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
import {
  DailySummaryDeliveryError,
  type DailySummaryDeliveryProvider
} from './dailySummaryDelivery';
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

  test('delivers qualifying Todo content when Weather is unavailable', async () => {
    saveQualifyingUser(sqlite, {
      userId: 'user-1',
      scheduledAt: '2026-10-24T05:00:00Z'
    });
    sqlite
      .prepare('update summary_configurations set weather_section_enabled = 1 where user_id = ?')
      .run('user-1');
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

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      html: expect.stringContaining('Choose a Weather Location'),
      text: expect.stringContaining('Choose a Weather Location')
    }));
    expect(send.mock.calls[0][0].html).toContain('Prepare launch notes');
    expect(send.mock.calls[0][0].text).toContain('Prepare launch notes');
    expect(
      sqlite.prepare('select count(*) as count from delivery_records').get()
    ).toEqual({ count: 1 });
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

  test('keeps a scheduled occurrence due while its retry is not yet eligible', async () => {
    const scheduledAt = '2026-10-24T05:00:00Z';
    saveQualifyingUser(sqlite, { userId: 'user-1', scheduledAt });
    const recordStore = createDeliveryRecordStore(database);
    const claim = await recordStore.claimScheduledOccurrence('user-1', {
      scheduledAt,
      claimedAt: '2026-10-24T05:00:00.000Z',
      claimExpiresAt: '2026-10-24T05:05:00.000Z',
      providerName: 'fake-delivery'
    });
    await recordStore.markScheduledRetrying(claim!.id, {
      attemptCount: 1,
      attemptedAt: '2026-10-24T05:00:01.000Z',
      nextRetryAt: '2026-10-24T05:10:00.000Z',
      providerStatusMetadata: 'temporarily unavailable',
      errorClassification: 'provider-unavailable'
    });
    const send = vi.fn();
    const delivery = createTestDelivery({
      database,
      send,
      now: () => new Date('2026-10-24T05:05:00.000Z')
    });

    await expect(delivery.processOneDueOccurrence()).resolves.toEqual({
      outcome: 'retry-pending',
      occurrenceId: claim!.id
    });

    expect(send).not.toHaveBeenCalled();
    expect(
      sqlite.prepare('select next_summary_at from users where id = ?').get('user-1')
    ).toEqual({ next_summary_at: scheduledAt });
  });

  test('finishes an accepted occurrence as failed when the provider omits its message id', async () => {
    saveQualifyingUser(sqlite, {
      userId: 'user-1',
      scheduledAt: '2026-10-24T05:00:00Z'
    });
    const send = vi.fn().mockResolvedValue({
      providerName: 'fake-delivery',
      providerMessageId: null,
      providerStatusMetadata: 'accepted; missing message id'
    });
    const delivery = createTestDelivery({
      database,
      send,
      now: () => new Date('2026-10-24T05:00:00.000Z')
    });

    const firstOutcome = await delivery.processOneDueOccurrence();
    const repeatedOutcome = await delivery.processOneDueOccurrence();

    expect(firstOutcome).toEqual({
      outcome: 'provider-missing-message-id',
      occurrenceId: expect.any(String),
      errorClassification: 'provider-missing-message-id'
    });
    expect(repeatedOutcome).toEqual({ outcome: 'none-due' });
    expect(send).toHaveBeenCalledOnce();
    expect(
      sqlite
        .prepare(
          `select delivery_status, error_classification, provider_message_id,
                  provider_status_metadata, claim_expires_at
             from delivery_records`
        )
        .get()
    ).toEqual({
      delivery_status: 'failed',
      error_classification: 'provider-missing-message-id',
      provider_message_id: null,
      provider_status_metadata: 'accepted; missing message id',
      claim_expires_at: null
    });
  });

  test('skips an occurrence with empty enabled content without a Delivery Record', async () => {
    saveQualifyingUser(sqlite, {
      userId: 'user-1',
      scheduledAt: '2026-10-24T05:00:00Z'
    });
    sqlite.prepare('delete from todo_tasks where user_id = ?').run('user-1');
    const send = vi.fn();
    const delivery = createTestDelivery({
      database,
      send,
      now: () => new Date('2026-10-24T05:00:00.000Z')
    });

    await expect(delivery.processOneDueOccurrence()).resolves.toEqual({
      outcome: 'not-qualifying'
    });
    await expect(delivery.processOneDueOccurrence()).resolves.toEqual({
      outcome: 'none-due'
    });

    expect(send).not.toHaveBeenCalled();
    expect(
      sqlite.prepare('select count(*) as count from delivery_records').get()
    ).toEqual({ count: 0 });
    expect(
      sqlite.prepare('select next_summary_at from users where id = ?').get('user-1')
    ).toEqual({ next_summary_at: '2026-10-25T06:00:00Z' });
  });

  test('skips unavailable-only output without a provider call or Delivery Record', async () => {
    saveQualifyingUser(sqlite, {
      userId: 'user-1',
      scheduledAt: '2026-10-24T05:00:00Z'
    });
    sqlite.prepare('delete from todo_tasks where user_id = ?').run('user-1');
    sqlite
      .prepare(
        `update summary_configurations
            set weather_section_enabled = 1,
                todo_section_enabled = 0
          where user_id = ?`
      )
      .run('user-1');
    const send = vi.fn();
    const delivery = createTestDelivery({
      database,
      send,
      now: () => new Date('2026-10-24T05:00:00.000Z')
    });

    await expect(delivery.processOneDueOccurrence()).resolves.toEqual({
      outcome: 'not-qualifying'
    });

    expect(send).not.toHaveBeenCalled();
    expect(
      sqlite.prepare('select count(*) as count from delivery_records').get()
    ).toEqual({ count: 0 });
    expect(
      sqlite.prepare('select next_summary_at from users where id = ?').get('user-1')
    ).toEqual({ next_summary_at: '2026-10-25T06:00:00Z' });
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
        `select id, scheduled_at, delivery_status, attempt_count, error_classification
           from delivery_records`
      )
      .get() as {
      id: string;
      scheduled_at: string;
      delivery_status: string;
      attempt_count: number;
      error_classification: string | null;
    };
    expect(interruptedRecord.error_classification).toBe('unexpected');

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

  test('does not make a fourth provider submission while recovering three interrupted claims', async () => {
    const scheduledAt = '2026-10-24T05:00:00.000Z';
    saveQualifyingUser(sqlite, { userId: 'user-1', scheduledAt });
    let currentTime = new Date(scheduledAt);
    const send = vi
      .fn<DailySummaryDeliveryProvider['send']>()
      .mockRejectedValue(new Error('simulated interruption after submission'));
    const delivery = createTestDelivery({ database, send, now: () => currentTime });

    await expect(delivery.processOneDueOccurrence()).rejects.toThrow('simulated interruption');
    currentTime = new Date('2026-10-24T05:05:00.000Z');
    await expect(delivery.processOneDueOccurrence()).rejects.toThrow('simulated interruption');
    currentTime = new Date('2026-10-24T05:10:00.000Z');
    await expect(delivery.processOneDueOccurrence()).rejects.toThrow('simulated interruption');
    currentTime = new Date('2026-10-24T05:15:00.000Z');

    await expect(delivery.processOneDueOccurrence()).resolves.toMatchObject({
      outcome: 'retry-exhausted'
    });

    expect(send).toHaveBeenCalledTimes(3);
    expect(
      sqlite
        .prepare('select delivery_status, attempt_count, error_classification from delivery_records')
        .get()
    ).toEqual({
      delivery_status: 'failed',
      attempt_count: 3,
      error_classification: 'retry-exhausted'
    });
  });

  test('retries transient provider unavailability with current content on the same occurrence', async () => {
    const scheduledAt = '2026-10-24T05:00:00.000Z';
    saveQualifyingUser(sqlite, { userId: 'user-1', scheduledAt });
    let currentTime = new Date(scheduledAt);
    const submittedMessages: Array<Parameters<DailySummaryDeliveryProvider['send']>[0]> = [];
    const send = vi
      .fn<DailySummaryDeliveryProvider['send']>()
      .mockImplementationOnce(async (message) => {
        submittedMessages.push(message);
        throw new DailySummaryDeliveryError(
          'Delivery provider is temporarily unavailable.',
          'provider-unavailable',
          { providerName: 'fake-delivery', providerStatusMetadata: 'temporarily unavailable' }
        );
      })
      .mockImplementationOnce(async (message) => {
        submittedMessages.push(message);
        return {
          providerName: 'fake-delivery',
          providerMessageId: 'message-after-retry',
          providerStatusMetadata: 'accepted'
        };
      });
    const delivery = createTestDelivery({ database, send, now: () => currentTime });

    await expect(delivery.processOneDueOccurrence()).resolves.toEqual({
      outcome: 'retry-scheduled',
      occurrenceId: expect.any(String),
      nextRetryAt: '2026-10-24T05:05:00.000Z',
      errorClassification: 'provider-unavailable'
    });
    sqlite
      .prepare('update todo_tasks set title = ? where user_id = ?')
      .run('Review current launch notes', 'user-1');
    currentTime = new Date('2026-10-24T05:05:00.000Z');

    await expect(delivery.processOneDueOccurrence()).resolves.toEqual({
      outcome: 'sent',
      occurrenceId: expect.any(String)
    });

    expect(send).toHaveBeenCalledTimes(2);
    expect(submittedMessages[0].idempotencyKey).toBe(submittedMessages[1].idempotencyKey);
    expect(submittedMessages[0].text).toContain('Prepare launch notes');
    expect(submittedMessages[1].text).toContain('Review current launch notes');
    expect(
      sqlite
        .prepare(
          `select count(*) as record_count, min(attempt_count) as attempt_count,
                  min(delivery_status) as delivery_status, min(provider_message_id) as provider_message_id
             from delivery_records where attempt_type = 'scheduled'`
        )
        .get()
    ).toEqual({
      record_count: 1,
      attempt_count: 2,
      delivery_status: 'sent',
      provider_message_id: 'message-after-retry'
    });
    expect(
      sqlite.prepare('select next_summary_at from users where id = ?').get('user-1')
    ).toEqual({ next_summary_at: '2026-10-25T06:00:00Z' });
  });

  test('stops after three transient provider submissions without a fourth attempt', async () => {
    const scheduledAt = '2026-10-24T05:00:00.000Z';
    saveQualifyingUser(sqlite, { userId: 'user-1', scheduledAt });
    let currentTime = new Date(scheduledAt);
    const send = vi.fn<DailySummaryDeliveryProvider['send']>().mockRejectedValue(
      new DailySummaryDeliveryError(
        'Delivery provider is temporarily unavailable.',
        'provider-unavailable',
        { providerName: 'fake-delivery', providerStatusMetadata: 'temporarily unavailable' }
      )
    );
    const delivery = createTestDelivery({ database, send, now: () => currentTime });

    await expect(delivery.processOneDueOccurrence()).resolves.toMatchObject({
      outcome: 'retry-scheduled'
    });
    currentTime = new Date('2026-10-24T05:05:00.000Z');
    await expect(delivery.processOneDueOccurrence()).resolves.toMatchObject({
      outcome: 'retry-scheduled'
    });
    currentTime = new Date('2026-10-24T05:10:00.000Z');
    await expect(delivery.processOneDueOccurrence()).resolves.toMatchObject({
      outcome: 'retry-exhausted'
    });
    currentTime = new Date('2026-10-24T05:15:00.000Z');
    await expect(delivery.processOneDueOccurrence()).resolves.toEqual({ outcome: 'none-due' });

    expect(send).toHaveBeenCalledTimes(3);
    expect(
      sqlite
        .prepare(
          `select delivery_status, attempt_count, error_classification,
                  next_retry_at, claim_expires_at from delivery_records`
        )
        .get()
    ).toEqual({
      delivery_status: 'failed',
      attempt_count: 3,
      error_classification: 'retry-exhausted',
      next_retry_at: null,
      claim_expires_at: null
    });
  });

  test('fails a retry that starts after the fifteen-minute occurrence deadline without submitting it', async () => {
    const scheduledAt = '2026-10-24T05:00:00.000Z';
    saveQualifyingUser(sqlite, { userId: 'user-1', scheduledAt });
    let currentTime = new Date(scheduledAt);
    const send = vi.fn<DailySummaryDeliveryProvider['send']>().mockRejectedValue(
      new DailySummaryDeliveryError(
        'Delivery provider is temporarily unavailable.',
        'provider-unavailable',
        { providerName: 'fake-delivery', providerStatusMetadata: 'temporarily unavailable' }
      )
    );
    const delivery = createTestDelivery({ database, send, now: () => currentTime });

    await expect(delivery.processOneDueOccurrence()).resolves.toMatchObject({
      outcome: 'retry-scheduled'
    });
    currentTime = new Date('2026-10-24T05:15:00.001Z');

    await expect(delivery.processOneDueOccurrence()).resolves.toMatchObject({
      outcome: 'stale-occurrence'
    });

    expect(send).toHaveBeenCalledOnce();
    expect(
      sqlite
        .prepare(
          `select delivery_status, attempt_count, error_classification,
                  next_retry_at, claim_expires_at from delivery_records`
        )
        .get()
    ).toEqual({
      delivery_status: 'failed',
      attempt_count: 1,
      error_classification: 'stale-occurrence',
      next_retry_at: null,
      claim_expires_at: null
    });
  });

  test.each([
    'configuration-missing',
    'validation-failed',
    'authentication-failed',
    'provider-rejected'
  ] as const)('does not retry terminal delivery failure %s', async (classification) => {
    const scheduledAt = '2026-10-24T05:00:00.000Z';
    saveQualifyingUser(sqlite, { userId: 'user-1', scheduledAt });
    const send = vi.fn<DailySummaryDeliveryProvider['send']>().mockRejectedValue(
      new DailySummaryDeliveryError('Delivery cannot be retried.', classification, {
        providerName: 'fake-delivery',
        providerStatusMetadata: classification === 'provider-rejected' ? 'status=400' : null
      })
    );
    const delivery = createTestDelivery({
      database,
      send,
      now: () => new Date(scheduledAt)
    });

    await expect(delivery.processOneDueOccurrence()).resolves.toMatchObject({
      outcome: 'delivery-failed'
    });
    await expect(delivery.processOneDueOccurrence()).resolves.toEqual({ outcome: 'none-due' });

    expect(send).toHaveBeenCalledOnce();
    expect(
      sqlite
        .prepare('select delivery_status, attempt_count, error_classification from delivery_records')
        .get()
    ).toEqual({
      delivery_status: 'failed',
      attempt_count: 1,
      error_classification: classification
    });
  });

  test('never selects a Test Delivery Record for retry processing', async () => {
    saveQualifyingUser(sqlite, {
      userId: 'user-1',
      scheduledAt: '2026-10-25T06:00:00.000Z'
    });
    sqlite
      .prepare(
        `insert into delivery_records (
          id, user_id, attempt_type, requested_at, delivery_status, provider_name,
          scheduled_at, attempt_count, next_retry_at, error_classification
        ) values (?, ?, 'test', ?, 'retrying', ?, ?, ?, ?, ?)`
      )
      .run(
        'test-delivery',
        'user-1',
        '2026-10-24T05:00:00.000Z',
        'fake-delivery',
        '2026-10-24T05:00:00.000Z',
        1,
        '2026-10-24T05:05:00.000Z',
        'provider-unavailable'
      );
    const send = vi.fn<DailySummaryDeliveryProvider['send']>();
    const delivery = createTestDelivery({
      database,
      send,
      now: () => new Date('2026-10-24T05:05:00.000Z')
    });

    await expect(delivery.processOneDueOccurrence()).resolves.toEqual({ outcome: 'none-due' });
    expect(send).not.toHaveBeenCalled();
    expect(
      sqlite.prepare('select delivery_status, attempt_count from delivery_records').get()
    ).toEqual({ delivery_status: 'retrying', attempt_count: 1 });
  });
});
