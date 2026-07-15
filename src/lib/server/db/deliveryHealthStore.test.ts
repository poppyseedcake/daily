import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, expect, test } from 'vitest';
import * as schema from './schema';
import {
  createDeliveryHealthStore,
  scheduledWorkerOverdueMinutesFromEnvironment
} from './deliveryHealthStore';

const applyDeliveryHealthMigrations = (sqlite: Database.Database) => {
  sqlite.exec(readFileSync('drizzle/0000_bootstrap_daily.sql', 'utf8'));
  sqlite.exec(readFileSync('drizzle/0002_add_delivery_records.sql', 'utf8'));
  sqlite.exec(readFileSync('drizzle/0012_add_scheduled_delivery_claims.sql', 'utf8'));
  sqlite.exec(readFileSync('drizzle/0014_add_scheduled_worker_runs.sql', 'utf8'));
};

describe('Delivery Health Store', () => {
  test('calculates worker freshness before, at, and after the configured UTC threshold', async () => {
    const sqlite = new Database(':memory:');
    applyDeliveryHealthMigrations(sqlite);
    const store = createDeliveryHealthStore(drizzle(sqlite, { schema }));

    try {
      await expect(
        store.load({ now: '2026-07-15T12:00:00.000Z', overdueThresholdMinutes: 5 })
      ).resolves.toMatchObject({
        worker: { status: 'missing', latestRun: null },
        windows: [
          {
            key: '24-hours',
            totals: {
              sent: 0,
              retrying: 0,
              failed: 0,
              activeProcessing: 0,
              expiredProcessing: 0
            }
          },
          {
            key: '7-days',
            totals: {
              sent: 0,
              retrying: 0,
              failed: 0,
              activeProcessing: 0,
              expiredProcessing: 0
            }
          }
        ]
      });

      sqlite
        .prepare(
          `insert into scheduled_worker_runs (
            id, started_at, completed_at, duration_milliseconds, outcome,
            due_count, sent_count, skipped_count, retrying_count, failed_count,
            isolated_error_count
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          'healthy-empty-run',
          '2026-07-15T11:54:59.900Z',
          '2026-07-15T11:55:00.000Z',
          100,
          'succeeded',
          0,
          0,
          0,
          0,
          0,
          0
        );

      await expect(
        store.load({ now: '2026-07-15T11:59:59.999Z', overdueThresholdMinutes: 5 })
      ).resolves.toMatchObject({ worker: { status: 'healthy' } });
      await expect(
        store.load({ now: '2026-07-15T12:00:00.000Z', overdueThresholdMinutes: 5 })
      ).resolves.toMatchObject({ worker: { status: 'healthy' } });
      await expect(
        store.load({ now: '2026-07-15T12:00:00.001Z', overdueThresholdMinutes: 5 })
      ).resolves.toMatchObject({
        timeBasis: 'UTC',
        worker: {
          status: 'overdue',
          overdueThresholdMinutes: 5,
          latestRun: {
            outcome: 'succeeded',
            completedAt: '2026-07-15T11:55:00.000Z',
            durationMilliseconds: 100,
            counts: { due: 0, sent: 0, skipped: 0, retrying: 0, failed: 0, isolatedError: 0 }
          }
        }
      });
    } finally {
      sqlite.close();
    }
  });

  test('uses the newest run for detail and the newest successful top-level run for freshness', async () => {
    const sqlite = new Database(':memory:');
    applyDeliveryHealthMigrations(sqlite);
    const store = createDeliveryHealthStore(drizzle(sqlite, { schema }));

    try {
      const insert = sqlite.prepare(
        `insert into scheduled_worker_runs (
          id, started_at, completed_at, duration_milliseconds, outcome, failure_classification,
          due_count, sent_count, skipped_count, retrying_count, failed_count, isolated_error_count
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      insert.run(
        'successful-run',
        '2026-07-15T11:58:00.000Z',
        '2026-07-15T11:58:00.010Z',
        10,
        'completed-with-isolated-errors',
        null,
        2,
        1,
        0,
        0,
        0,
        1
      );
      insert.run(
        'failed-run',
        '2026-07-15T11:59:00.000Z',
        '2026-07-15T11:59:00.020Z',
        20,
        'failed',
        'due-work-query-failed',
        0,
        0,
        0,
        0,
        0,
        0
      );

      await expect(
        store.load({ now: '2026-07-15T12:00:00.000Z', overdueThresholdMinutes: 5 })
      ).resolves.toMatchObject({
        worker: {
          status: 'healthy',
          latestRun: {
            outcome: 'failed',
            failureClassification: 'due-work-query-failed',
            completedAt: '2026-07-15T11:59:00.020Z'
          }
        }
      });
    } finally {
      sqlite.close();
    }
  });

  test('returns aggregate-only scheduled delivery totals and stable failure groups for 24 hours and 7 days', async () => {
    const sqlite = new Database(':memory:');
    applyDeliveryHealthMigrations(sqlite);
    const store = createDeliveryHealthStore(drizzle(sqlite, { schema }));
    const insertUser = sqlite.prepare('insert into users (id, google_subject, email) values (?, ?, ?)');
    const insertDelivery = sqlite.prepare(
      `insert into delivery_records (
        id, user_id, attempt_type, requested_at, completed_at, delivery_status,
        provider_name, provider_message_id, provider_status_metadata, error_classification,
        scheduled_at, attempt_count, last_attempt_at, next_retry_at, claim_expires_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    try {
      insertUser.run('private-user', 'private-subject', 'recipient@example.com');
      const add = (
        id: string,
        requestedAt: string,
        status: 'sent' | 'retrying' | 'failed' | 'processing',
        classification: string | null = null,
        claimExpiresAt: string | null = null,
        attemptType: 'scheduled' | 'test' = 'scheduled'
      ) =>
        insertDelivery.run(
          id,
          'private-user',
          attemptType,
          requestedAt,
          status === 'sent' || status === 'failed' ? requestedAt : null,
          status,
          'private-provider',
          'private-message-id',
          'private summary content',
          classification,
          attemptType === 'scheduled' ? requestedAt : null,
          attemptType === 'scheduled' ? 1 : null,
          requestedAt,
          status === 'retrying' ? '2026-07-15T12:30:00.000Z' : null,
          claimExpiresAt
        );

      add('sent-24h', '2026-07-15T11:00:00.000Z', 'sent');
      add('retrying-24h', '2026-07-15T10:00:00.000Z', 'retrying', 'provider-unavailable');
      add('failed-24h-a', '2026-07-15T09:00:00.000Z', 'failed', 'provider-rejected');
      add('failed-24h-b', '2026-07-15T08:00:00.000Z', 'failed', 'provider-rejected');
      add('active-24h', '2026-07-15T07:00:00.000Z', 'processing', null, '2026-07-15T12:01:00.000Z');
      add('expired-24h', '2026-07-15T06:00:00.000Z', 'processing', null, '2026-07-15T11:59:00.000Z');
      add('failed-7d', '2026-07-12T12:00:00.000Z', 'failed', 'authentication-failed');
      add('outside-7d', '2026-07-08T11:59:59.999Z', 'sent');
      add('test-delivery', '2026-07-15T11:30:00.000Z', 'failed', 'unexpected', null, 'test');

      const health = await store.load({
        now: '2026-07-15T12:00:00.000Z',
        overdueThresholdMinutes: 5
      });

      expect(health.windows).toEqual([
        {
          key: '24-hours',
          label: 'Last 24 hours',
          totals: { sent: 1, retrying: 1, failed: 2, activeProcessing: 1, expiredProcessing: 1 },
          failureClassifications: [
            { classification: 'provider-rejected', count: 2 },
            { classification: 'provider-unavailable', count: 1 }
          ]
        },
        {
          key: '7-days',
          label: 'Last 7 days',
          totals: { sent: 1, retrying: 1, failed: 3, activeProcessing: 1, expiredProcessing: 1 },
          failureClassifications: [
            { classification: 'provider-rejected', count: 2 },
            { classification: 'authentication-failed', count: 1 },
            { classification: 'provider-unavailable', count: 1 }
          ]
        }
      ]);
      expect(JSON.stringify(health)).not.toMatch(
        /recipient@example|private-user|private-subject|private-provider|private-message-id|summary content|scheduledAt|deliveryRecords/
      );
    } finally {
      sqlite.close();
    }
  });

  test('requires a whole-minute overdue threshold greater than the one-minute schedule', () => {
    expect(scheduledWorkerOverdueMinutesFromEnvironment(undefined)).toBe(5);
    expect(scheduledWorkerOverdueMinutesFromEnvironment('2')).toBe(2);
    expect(() => scheduledWorkerOverdueMinutesFromEnvironment('1')).toThrow(
      'SCHEDULED_WORKER_OVERDUE_MINUTES must be an integer between 2 and 1440.'
    );
    expect(() => scheduledWorkerOverdueMinutesFromEnvironment('2.5')).toThrow(
      'SCHEDULED_WORKER_OVERDUE_MINUTES must be an integer between 2 and 1440.'
    );
  });
});
