import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createDeliveryRecordStore } from './deliveryRecordStore';
import * as schema from './schema';

const createTestDatabase = () => {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(readFileSync('drizzle/0000_bootstrap_daily.sql', 'utf8'));
  sqlite.exec(readFileSync('drizzle/0002_add_delivery_records.sql', 'utf8'));
  sqlite.exec(readFileSync('drizzle/0011_add_next_summary_at.sql', 'utf8'));
  sqlite.exec(readFileSync('drizzle/0012_add_scheduled_delivery_claims.sql', 'utf8'));
  return { sqlite, database: drizzle(sqlite, { schema }) };
};

const saveUser = (sqlite: Database.Database, id: string) => {
  sqlite
    .prepare(
      'insert into users (id, google_subject, email, created_at, updated_at) values (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
    )
    .run(id, `google-${id}`, `${id}@example.com`);
};

describe('SQLite Delivery Record store', () => {
  let sqlite: Database.Database;
  let database: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(() => {
    ({ sqlite, database } = createTestDatabase());
    saveUser(sqlite, 'user-1');
  });

  afterEach(() => sqlite.close());

  test('persists and loads recent Test Delivery metadata', async () => {
    const store = createDeliveryRecordStore(database);
    await store.recordAttempt('user-1', {
      id: 'delivery-1',
      attemptType: 'test',
      requestedAt: '2026-07-05T06:45:00.000Z',
      completedAt: '2026-07-05T06:45:03.000Z',
      deliveryStatus: 'sent',
      providerName: 'resend',
      providerMessageId: 'message-123',
      providerStatusMetadata: 'accepted by provider',
      errorClassification: null
    });

    await expect(store.loadRecentForUser('user-1', '2026-07-05T12:00:00.000Z')).resolves.toEqual([
      expect.objectContaining({
        id: 'delivery-1',
        attemptType: 'test',
        deliveryStatus: 'sent',
        providerMessageId: 'message-123',
        providerStatusMetadata: 'accepted by provider',
        scheduledAt: null,
        attemptCount: null
      })
    ]);
  });

  test('loads recent scheduled history without owning its state transitions', async () => {
    saveUser(sqlite, 'user-2');
    sqlite
      .prepare(
        `insert into delivery_records (
          id, user_id, attempt_type, requested_at, completed_at, delivery_status,
          provider_name, provider_status_metadata, error_classification, scheduled_at,
          attempt_count, last_attempt_at
        ) values (?, ?, 'scheduled', ?, ?, 'failed', ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'scheduled-1',
        'user-1',
        '2026-06-20T07:00:00.000Z',
        '2026-06-20T07:00:05.000Z',
        'resend',
        'rate limited',
        'provider-unavailable',
        '2026-06-20T07:00:00.000Z',
        1,
        '2026-06-20T07:00:01.000Z'
      );
    await createDeliveryRecordStore(database).recordAttempt('user-2', {
      id: 'other-user-delivery',
      attemptType: 'test',
      requestedAt: '2026-07-04T07:00:00.000Z',
      completedAt: null,
      deliveryStatus: 'failed',
      providerName: 'resend',
      providerMessageId: null,
      providerStatusMetadata: null,
      errorClassification: 'configuration-missing'
    });

    await expect(
      createDeliveryRecordStore(database).loadRecentForUser(
        'user-1',
        '2026-07-05T12:00:00.000Z'
      )
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'scheduled-1',
        attemptType: 'scheduled',
        deliveryStatus: 'failed',
        attemptCount: 1
      })
    ]);
  });

  test.each([
    [
      'private rendered content',
      '{"html":"<article>Draft investor update</article>","token":"secret-token"}'
    ],
    [
      'weather provider diagnostics',
      'payload={"latitude":52.2297,"daily":{"weather_code":[61]},"todo":"Call bank"}'
    ],
    ['private provider prose', 'Meet Alice at Hospital password=abc123 Bearer abc123']
  ])('redacts %s from provider status metadata', async (_name, providerStatusMetadata) => {
    const store = createDeliveryRecordStore(database);
    await store.recordAttempt('user-1', {
      id: 'private-provider-payload',
      attemptType: 'test',
      requestedAt: '2026-07-05T06:45:00.000Z',
      completedAt: '2026-07-05T06:45:03.000Z',
      deliveryStatus: 'failed',
      providerName: 'resend',
      providerMessageId: null,
      providerStatusMetadata,
      errorClassification: 'provider-rejected'
    });

    const [record] = await store.loadRecentForUser('user-1', '2026-07-05T12:00:00.000Z');
    expect(record.providerStatusMetadata).toBe('redacted');
    expect(JSON.stringify(record)).not.toContain(providerStatusMetadata);
  });
});
