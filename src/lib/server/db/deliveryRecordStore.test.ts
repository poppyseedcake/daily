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
  sqlite.exec(readFileSync('drizzle/0012_add_scheduled_delivery_claims.sql', 'utf8'));

  return {
    sqlite,
    database: drizzle(sqlite, { schema })
  };
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
    const testDatabase = createTestDatabase();
    sqlite = testDatabase.sqlite;
    database = testDatabase.database;
    saveUser(sqlite, 'user-1');
  });

  afterEach(() => {
    sqlite.close();
  });

  test('persists recent Delivery Records for a User with delivery metadata', async () => {
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
      {
        id: 'delivery-1',
        attemptType: 'test',
        requestedAt: '2026-07-05T06:45:00.000Z',
        completedAt: '2026-07-05T06:45:03.000Z',
        deliveryStatus: 'sent',
        providerName: 'resend',
        providerMessageId: 'message-123',
        providerStatusMetadata: 'accepted by provider',
        errorClassification: null,
        scheduledAt: null,
        attemptCount: null,
        lastAttemptAt: null,
        nextRetryAt: null,
        claimExpiresAt: null
      }
    ]);
  });

  test('loads only the signed-in User recent Delivery Records and keeps scheduled failures', async () => {
    saveUser(sqlite, 'user-2');
    const store = createDeliveryRecordStore(database);

    const scheduledClaim = await store.claimScheduledOccurrence('user-1', {
      scheduledAt: '2026-06-20T07:00:00.000Z',
      claimedAt: '2026-06-20T07:00:01.000Z',
      claimExpiresAt: '2026-06-20T07:05:01.000Z',
      providerName: 'resend'
    });
    await store.markScheduledFailed(scheduledClaim!.id, {
      completedAt: '2026-06-20T07:00:05.000Z',
      providerMessageId: null,
      providerStatusMetadata: 'rate limited',
      errorClassification: 'provider-unavailable'
    });
    await store.recordAttempt('user-1', {
      id: 'old-test-success',
      attemptType: 'test',
      requestedAt: '2026-06-01T07:00:00.000Z',
      completedAt: '2026-06-01T07:00:02.000Z',
      deliveryStatus: 'sent',
      providerName: 'resend',
      providerMessageId: 'old-message',
      providerStatusMetadata: null,
      errorClassification: null
    });
    await store.recordAttempt('user-2', {
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

    await expect(store.loadRecentForUser('user-1', '2026-07-05T12:00:00.000Z')).resolves.toEqual([
      {
        id: scheduledClaim!.id,
        attemptType: 'scheduled',
        requestedAt: '2026-06-20T07:00:00.000Z',
        completedAt: '2026-06-20T07:00:05.000Z',
        deliveryStatus: 'failed',
        providerName: 'resend',
        providerMessageId: null,
        providerStatusMetadata: 'rate limited',
        errorClassification: 'provider-unavailable',
        scheduledAt: '2026-06-20T07:00:00.000Z',
        attemptCount: 1,
        lastAttemptAt: '2026-06-20T07:00:01.000Z',
        nextRetryAt: null,
        claimExpiresAt: null
      }
    ]);
  });

  test('does not persist private rendered content in provider status metadata', async () => {
    const store = createDeliveryRecordStore(database);

    await store.recordAttempt('user-1', {
      id: 'private-provider-payload',
      attemptType: 'test',
      requestedAt: '2026-07-05T06:45:00.000Z',
      completedAt: '2026-07-05T06:45:03.000Z',
      deliveryStatus: 'failed',
      providerName: 'resend',
      providerMessageId: null,
      providerStatusMetadata:
        '{"html":"<article>Draft investor update</article>","text":"Calendar: Therapy 10:00, Route: 123 Private St to Office","token":"secret-token"}',
      errorClassification: 'provider-rejected'
    });

    const [record] = await store.loadRecentForUser('user-1', '2026-07-05T12:00:00.000Z');
    const persistedRow = sqlite
      .prepare('select provider_status_metadata from delivery_records where id = ?')
      .get('private-provider-payload') as { provider_status_metadata: string | null };

    expect(record.providerStatusMetadata).toBe('redacted');
    expect(persistedRow.provider_status_metadata).toBe('redacted');
    expect(JSON.stringify(record)).not.toContain('Draft investor update');
    expect(JSON.stringify(record)).not.toContain('Therapy');
    expect(JSON.stringify(record)).not.toContain('123 Private St');
    expect(JSON.stringify(record)).not.toContain('secret-token');
  });

  test('redacts weather provider diagnostics that include payloads or private Daily Summary details', async () => {
    const store = createDeliveryRecordStore(database);

    await store.recordAttempt('user-1', {
      id: 'weather-provider-diagnostics',
      attemptType: 'test',
      requestedAt: '2026-07-05T06:45:00.000Z',
      completedAt: '2026-07-05T06:45:03.000Z',
      deliveryStatus: 'failed',
      providerName: 'open-meteo',
      providerMessageId: null,
      providerStatusMetadata:
        'payload={"latitude":52.2297,"longitude":21.0122,"daily":{"weather_code":[61]},"calendar":"Therapy 10:00","todo":"Call bank"}',
      errorClassification: 'provider-rejected'
    });

    const [record] = await store.loadRecentForUser('user-1', '2026-07-05T12:00:00.000Z');
    const persistedRow = sqlite
      .prepare('select provider_status_metadata from delivery_records where id = ?')
      .get('weather-provider-diagnostics') as { provider_status_metadata: string | null };

    expect(record.providerStatusMetadata).toBe('redacted');
    expect(persistedRow.provider_status_metadata).toBe('redacted');
    expect(JSON.stringify(record)).not.toContain('52.2297');
    expect(JSON.stringify(record)).not.toContain('weather_code');
    expect(JSON.stringify(record)).not.toContain('Therapy');
    expect(JSON.stringify(record)).not.toContain('Call bank');
  });

  test('claims one Scheduled Delivery Record per User occurrence', async () => {
    const firstStore = createDeliveryRecordStore(database);
    const competingStore = createDeliveryRecordStore(database);
    const occurrence = {
      scheduledAt: '2026-07-06T07:00:00.000Z',
      claimedAt: '2026-07-06T07:00:01.000Z',
      claimExpiresAt: '2026-07-06T07:05:01.000Z',
      providerName: 'resend'
    };

    const [firstClaim, competingClaim] = await Promise.all([
      firstStore.claimScheduledOccurrence('user-1', occurrence),
      competingStore.claimScheduledOccurrence('user-1', occurrence)
    ]);

    expect([firstClaim, competingClaim].filter(Boolean)).toHaveLength(1);
    expect(firstClaim ?? competingClaim).toMatchObject({
      attemptType: 'scheduled',
      scheduledAt: occurrence.scheduledAt,
      deliveryStatus: 'processing',
      attemptCount: 1,
      lastAttemptAt: occurrence.claimedAt,
      claimExpiresAt: occurrence.claimExpiresAt,
      providerName: 'resend'
    });
    expect(
      sqlite
        .prepare(
          "select count(*) as count from delivery_records where user_id = ? and scheduled_at = ? and attempt_type = 'scheduled'"
        )
        .get('user-1', occurrence.scheduledAt)
    ).toEqual({ count: 1 });
  });

  test('recovers an expired processing claim without creating another occurrence', async () => {
    const store = createDeliveryRecordStore(database);
    const scheduledAt = '2026-07-06T07:00:00.000Z';

    const firstClaim = await store.claimScheduledOccurrence('user-1', {
      scheduledAt,
      claimedAt: '2026-07-06T07:00:01.000Z',
      claimExpiresAt: '2026-07-06T07:05:01.000Z',
      providerName: 'resend'
    });
    const activeCompetingClaim = await store.claimScheduledOccurrence('user-1', {
      scheduledAt,
      claimedAt: '2026-07-06T07:04:00.000Z',
      claimExpiresAt: '2026-07-06T07:09:00.000Z',
      providerName: 'resend'
    });
    const recoveredClaim = await store.claimScheduledOccurrence('user-1', {
      scheduledAt,
      claimedAt: '2026-07-06T07:05:02.000Z',
      claimExpiresAt: '2026-07-06T07:10:02.000Z',
      providerName: 'resend'
    });

    expect(activeCompetingClaim).toBeNull();
    expect(recoveredClaim).toMatchObject({
      id: firstClaim?.id,
      scheduledAt,
      deliveryStatus: 'processing',
      attemptCount: 2,
      lastAttemptAt: '2026-07-06T07:05:02.000Z',
      claimExpiresAt: '2026-07-06T07:10:02.000Z'
    });
    expect(
      sqlite.prepare('select count(*) as count from delivery_records where scheduled_at = ?').get(scheduledAt)
    ).toEqual({ count: 1 });
  });

  test('updates one Scheduled Delivery Record through retrying and sent states', async () => {
    const store = createDeliveryRecordStore(database);
    const scheduledAt = '2026-07-06T07:00:00.000Z';
    const claim = await store.claimScheduledOccurrence('user-1', {
      scheduledAt,
      claimedAt: '2026-07-06T07:00:01.000Z',
      claimExpiresAt: '2026-07-06T07:05:01.000Z',
      providerName: 'resend'
    });

    const retrying = await store.markScheduledRetrying(claim!.id, {
      attemptedAt: '2026-07-06T07:00:03.000Z',
      nextRetryAt: '2026-07-06T07:05:00.000Z',
      providerStatusMetadata: 'temporarily unavailable',
      errorClassification: 'provider-unavailable'
    });
    const retryClaim = await store.claimScheduledOccurrence('user-1', {
      scheduledAt,
      claimedAt: '2026-07-06T07:05:00.000Z',
      claimExpiresAt: '2026-07-06T07:10:00.000Z',
      providerName: 'resend'
    });
    const sent = await store.markScheduledSent(claim!.id, {
      completedAt: '2026-07-06T07:05:04.000Z',
      providerMessageId: 'message-456',
      providerStatusMetadata: 'accepted by provider'
    });

    expect(retrying).toMatchObject({
      deliveryStatus: 'retrying',
      attemptCount: 1,
      nextRetryAt: '2026-07-06T07:05:00.000Z',
      claimExpiresAt: null,
      errorClassification: 'provider-unavailable'
    });
    expect(retryClaim).toMatchObject({ deliveryStatus: 'processing', attemptCount: 2 });
    expect(sent).toMatchObject({
      deliveryStatus: 'sent',
      completedAt: '2026-07-06T07:05:04.000Z',
      attemptCount: 2,
      nextRetryAt: null,
      claimExpiresAt: null,
      providerMessageId: 'message-456',
      errorClassification: null
    });
    await expect(
      store.claimScheduledOccurrence('user-1', {
        scheduledAt,
        claimedAt: '2026-07-06T07:11:00.000Z',
        claimExpiresAt: '2026-07-06T07:16:00.000Z',
        providerName: 'resend'
      })
    ).resolves.toBeNull();
    await expect(
      store.markScheduledRetrying(claim!.id, {
        attemptedAt: '2026-07-06T07:11:01.000Z',
        nextRetryAt: '2026-07-06T07:12:00.000Z',
        providerStatusMetadata: 'temporarily unavailable',
        errorClassification: 'provider-unavailable'
      })
    ).resolves.toBeNull();
    await expect(
      store.markScheduledFailed(claim!.id, {
        completedAt: '2026-07-06T07:11:02.000Z',
        providerMessageId: null,
        providerStatusMetadata: 'late failure',
        errorClassification: 'unexpected'
      })
    ).resolves.toBeNull();
  });

  test('keeps Test Delivery Records immediate, final, and outside scheduled claiming', async () => {
    const store = createDeliveryRecordStore(database);
    const requestedAt = '2026-07-06T07:00:00.000Z';

    await store.recordAttempt('user-1', {
      id: 'test-delivery',
      attemptType: 'test',
      requestedAt,
      completedAt: '2026-07-06T07:00:02.000Z',
      deliveryStatus: 'sent',
      providerName: 'resend',
      providerMessageId: 'test-message',
      providerStatusMetadata: 'accepted',
      errorClassification: null
    });
    const scheduled = await store.claimScheduledOccurrence('user-1', {
      scheduledAt: requestedAt,
      claimedAt: '2026-07-06T07:00:03.000Z',
      claimExpiresAt: '2026-07-06T07:05:03.000Z',
      providerName: 'resend'
    });

    expect(scheduled).not.toBeNull();
    expect(
      sqlite.prepare('select attempt_type, delivery_status, scheduled_at, attempt_count from delivery_records order by attempt_type').all()
    ).toEqual([
      {
        attempt_type: 'scheduled',
        delivery_status: 'processing',
        scheduled_at: requestedAt,
        attempt_count: 1
      },
      {
        attempt_type: 'test',
        delivery_status: 'sent',
        scheduled_at: null,
        attempt_count: null
      }
    ]);
  });
});
