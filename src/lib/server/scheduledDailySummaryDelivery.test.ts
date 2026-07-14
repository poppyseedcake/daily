import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createUserCalendarConnectionStore } from './db/calendarConnectionStore';
import { createUserCommuteSetupStore } from './db/commuteSetupStore';
import { createDeliveryRecordStore } from './db/deliveryRecordStore';
import { createScheduledDailySummaryOccurrenceStore } from './db/scheduledDailySummaryOccurrenceStore';
import * as schema from './db/schema';
import { createUserSummaryConfigurationStore } from './db/summaryConfigurationStore';
import { createUserTodoStore } from './db/todoStore';
import { createUserWeatherLocationStore } from './db/weatherLocationStore';
import type { DailySummaryDeliveryProvider } from './dailySummaryDelivery';
import { createScheduledDailySummaryDelivery } from './scheduledDailySummaryDelivery';
import { createScheduledDailySummaryGenerator } from './scheduledDailySummaryGeneration';

const applyMigrations = (sqlite: Database.Database) => {
  for (const migration of [
    '0000_bootstrap_daily.sql',
    '0002_add_delivery_records.sql',
    '0003_add_weather_locations.sql',
    '0004_add_calendar_connections.sql',
    '0005_add_selected_calendar_metadata.sql',
    '0010_add_commute_setup.sql',
    '0011_add_next_summary_at.sql',
    '0012_add_scheduled_delivery_claims.sql'
  ]) {
    sqlite.exec(readFileSync(`drizzle/${migration}`, 'utf8'));
  }
};

const saveQualifyingUser = (
  sqlite: Database.Database,
  { userId, scheduledAt }: { userId: string; scheduledAt: string }
) => {
  sqlite
    .prepare(
      'insert into users (id, google_subject, email, next_summary_at) values (?, ?, ?, ?)'
    )
    .run(userId, `google-${userId}`, `${userId}@example.com`, scheduledAt);
  sqlite
    .prepare(
      `insert into summary_configurations (
        id, user_id, summary_time, user_time_zone, summary_theme,
        summary_delivery_enabled, weather_section_enabled, commute_section_enabled,
        calendar_section_enabled, todo_section_enabled
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(`configuration-${userId}`, userId, '07:00', 'Europe/Warsaw', 'dark', 1, 0, 0, 0, 1);
  sqlite
    .prepare(
      `insert into todo_tasks (
        id, user_id, category_id, title, urgency, position, completed
      ) values (?, ?, null, ?, ?, ?, ?)`
    )
    .run(`${userId}:todo-1`, userId, 'Prepare launch notes', 'high', 1, 0);
};

const createTestDelivery = ({
  database,
  send,
  now
}: {
  database: ReturnType<typeof drizzle<typeof schema>>;
  send: DailySummaryDeliveryProvider['send'];
  now: () => Date;
}) => {
  const generator = createScheduledDailySummaryGenerator({
    configurationStore: createUserSummaryConfigurationStore(database),
    todoStore: createUserTodoStore(database),
    weatherLocationStore: createUserWeatherLocationStore(database),
    commuteSetupStore: createUserCommuteSetupStore(database),
    calendarConnectionStore: createUserCalendarConnectionStore(database),
    loadCalendarAccessToken: vi.fn(),
    calendarEventProvider: vi.fn(),
    weatherProvider: { fetchDailyForecast: vi.fn() },
    commuteEstimateProvider: vi.fn(),
    now
  });

  return createScheduledDailySummaryDelivery({
    occurrenceStore: createScheduledDailySummaryOccurrenceStore(database),
    deliveryRecordStore: createDeliveryRecordStore(database),
    generator,
    deliveryProvider: { send },
    providerName: 'fake-delivery',
    senderAddress: () => 'Daily <daily@example.com>',
    now
  });
};

describe('scheduled Daily Summary delivery', () => {
  let sqlite: Database.Database;
  let database: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    applyMigrations(sqlite);
    database = drizzle(sqlite, { schema });
  });

  afterEach(() => {
    sqlite.close();
  });

  test('delivers one due occurrence through generation, claim, recording, and local-day rescheduling', async () => {
    saveQualifyingUser(sqlite, {
      userId: 'user-1',
      scheduledAt: '2026-10-24T05:00:00Z'
    });
    const send = vi.fn().mockResolvedValue({
      providerName: 'fake-delivery',
      providerMessageId: 'message-1',
      providerStatusMetadata: 'accepted'
    });
    const delivery = createTestDelivery({
      database,
      send,
      now: () => new Date('2026-10-24T05:00:00.000Z')
    });

    await expect(delivery.processOneDueOccurrence()).resolves.toEqual({
      outcome: 'sent',
      occurrenceId: expect.any(String)
    });

    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({
      to: 'user-1@example.com',
      from: 'Daily <daily@example.com>',
      subject: 'Daily Summary',
      html: expect.stringContaining('Prepare launch notes'),
      text: expect.stringContaining('Prepare launch notes'),
      idempotencyKey: expect.stringMatching(/^daily-summary\/[a-f0-9]{64}$/)
    });
    expect(
      sqlite
        .prepare(
          `select attempt_type, scheduled_at, delivery_status, attempt_count,
                  provider_message_id, provider_status_metadata
             from delivery_records`
        )
        .all()
    ).toEqual([
      {
        attempt_type: 'scheduled',
        scheduled_at: '2026-10-24T05:00:00Z',
        delivery_status: 'sent',
        attempt_count: 1,
        provider_message_id: 'message-1',
        provider_status_metadata: 'accepted'
      }
    ]);
    expect(
      sqlite.prepare('select next_summary_at from users where id = ?').get('user-1')
    ).toEqual({ next_summary_at: '2026-10-25T06:00:00Z' });
  });

  test('overlapping and repeated processing submits one provider request for an occurrence', async () => {
    saveQualifyingUser(sqlite, {
      userId: 'user-1',
      scheduledAt: '2026-10-24T05:00:00Z'
    });
    const send = vi.fn().mockResolvedValue({
      providerName: 'fake-delivery',
      providerMessageId: 'message-1',
      providerStatusMetadata: 'accepted'
    });
    const firstDelivery = createTestDelivery({
      database,
      send,
      now: () => new Date('2026-10-24T05:00:00.000Z')
    });
    const overlappingDelivery = createTestDelivery({
      database,
      send,
      now: () => new Date('2026-10-24T05:00:00.000Z')
    });

    const overlappingOutcomes = await Promise.all([
      firstDelivery.processOneDueOccurrence(),
      overlappingDelivery.processOneDueOccurrence()
    ]);
    const repeatedOutcome = await firstDelivery.processOneDueOccurrence();

    expect(send).toHaveBeenCalledOnce();
    const overlappingOutcomeNames = overlappingOutcomes.map(({ outcome }) => outcome);
    expect(overlappingOutcomeNames.filter((outcome) => outcome === 'sent')).toHaveLength(1);
    expect(
      overlappingOutcomeNames.some(
        (outcome) => outcome === 'already-claimed' || outcome === 'already-processed'
      )
    ).toBe(true);
    expect(repeatedOutcome).toEqual({ outcome: 'none-due' });
    expect(
      sqlite.prepare('select count(*) as count from delivery_records').get()
    ).toEqual({ count: 1 });
  });

  test('recovers an interrupted occurrence with the same record, identity, and idempotency key', async () => {
    saveQualifyingUser(sqlite, {
      userId: 'user-1',
      scheduledAt: '2026-10-24T05:00:00Z'
    });
    const idempotencyKeys: string[] = [];
    const send = vi
      .fn<DailySummaryDeliveryProvider['send']>()
      .mockImplementationOnce(async (message) => {
        idempotencyKeys.push(message.idempotencyKey ?? '');
        throw new Error('simulated process interruption');
      })
      .mockImplementationOnce(async (message) => {
        idempotencyKeys.push(message.idempotencyKey ?? '');
        return {
          providerName: 'fake-delivery',
          providerMessageId: 'message-1',
          providerStatusMetadata: 'accepted'
        };
      });
    const interruptedDelivery = createTestDelivery({
      database,
      send,
      now: () => new Date('2026-10-24T05:00:00.000Z')
    });

    await expect(interruptedDelivery.processOneDueOccurrence()).rejects.toThrow(
      'simulated process interruption'
    );
    expect(
      sqlite.prepare('select next_summary_at from users where id = ?').get('user-1')
    ).toEqual({ next_summary_at: '2026-10-25T06:00:00Z' });
    const interruptedRecord = sqlite
      .prepare(
        'select id, scheduled_at, delivery_status, attempt_count from delivery_records'
      )
      .get() as {
      id: string;
      scheduled_at: string;
      delivery_status: string;
      attempt_count: number;
    };

    const recoveredDelivery = createTestDelivery({
      database,
      send,
      now: () => new Date('2026-10-24T05:05:01.000Z')
    });
    const recoveredOutcome = await recoveredDelivery.processOneDueOccurrence();
    const recoveredRecord = sqlite
      .prepare(
        'select id, scheduled_at, delivery_status, attempt_count from delivery_records'
      )
      .get();

    expect(recoveredOutcome).toEqual({
      outcome: 'sent',
      occurrenceId: interruptedRecord.id
    });
    expect(recoveredRecord).toEqual({
      id: interruptedRecord.id,
      scheduled_at: '2026-10-24T05:00:00Z',
      delivery_status: 'sent',
      attempt_count: 2
    });
    expect(idempotencyKeys).toEqual([idempotencyKeys[0], idempotencyKeys[0]]);
    expect(idempotencyKeys[0]).toMatch(/^daily-summary\/[a-f0-9]{64}$/);
    expect(idempotencyKeys[0]).not.toContain('user-1@example.com');
    expect(idempotencyKeys[0]).not.toContain('Prepare launch notes');
  });
});
