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
        errorClassification: null
      }
    ]);
  });

  test('loads only the signed-in User recent Delivery Records and keeps scheduled failures', async () => {
    saveUser(sqlite, 'user-2');
    const store = createDeliveryRecordStore(database);

    await store.recordAttempt('user-1', {
      id: 'recent-scheduled-failure',
      attemptType: 'scheduled',
      requestedAt: '2026-06-20T07:00:00.000Z',
      completedAt: '2026-06-20T07:00:05.000Z',
      deliveryStatus: 'failed',
      providerName: 'resend',
      providerMessageId: null,
      providerStatusMetadata: 'rate limited',
      errorClassification: 'provider-temporary'
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
      errorClassification: 'provider-configuration'
    });

    await expect(store.loadRecentForUser('user-1', '2026-07-05T12:00:00.000Z')).resolves.toEqual([
      {
        id: 'recent-scheduled-failure',
        attemptType: 'scheduled',
        requestedAt: '2026-06-20T07:00:00.000Z',
        completedAt: '2026-06-20T07:00:05.000Z',
        deliveryStatus: 'failed',
        providerName: 'resend',
        providerMessageId: null,
        providerStatusMetadata: 'rate limited',
        errorClassification: 'provider-temporary'
      }
    ]);
  });
});
