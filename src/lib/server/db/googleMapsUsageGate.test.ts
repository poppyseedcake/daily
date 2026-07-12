import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  createGoogleMapsRequestGateway,
  type GoogleMapsProvider
} from '../googleMapsRequestGateway';
import { createGoogleMapsPersonAttribution } from '../googleMapsPersonAttribution';
import {
  createGoogleMapsUsageGate,
  readGoogleMapsUsageCaps
} from './googleMapsUsageGate';
import * as schema from './schema';

const drizzleDatabase = (database: Database.Database) => drizzle(database, { schema });

const databases: Database.Database[] = [];
const temporaryDirectories: string[] = [];

const createDatabase = (path = ':memory:', initialize = true) => {
  const database = new Database(path);
  database.pragma('busy_timeout = 5000');
  if (initialize) {
    database.exec(`
      CREATE TABLE google_maps_usage (
        period_kind text NOT NULL CHECK (period_kind IN ('day', 'month')),
        period_start_utc text NOT NULL,
        category text NOT NULL CHECK (category IN ('map-point-selection', 'commute-estimate')),
        request_count integer NOT NULL CHECK (request_count >= 0),
        PRIMARY KEY (period_kind, period_start_utc, category)
      )
      ;
      CREATE TABLE google_maps_person_usage (
        period_start_utc text NOT NULL,
        person_usage_identity text NOT NULL,
        request_count integer NOT NULL CHECK (request_count >= 0),
        PRIMARY KEY (period_start_utc, person_usage_identity)
      )
    `);
  }
  databases.push(database);
  return database;
};

const createDatabasePath = () => {
  const directory = mkdtempSync(join(tmpdir(), 'daily-google-maps-usage-'));
  temporaryDirectories.push(directory);
  return join(directory, 'daily.db');
};

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true });
  }
});

describe('Google Maps usage gate', () => {
  const person = { personUsageIdentity: 'privacy-safe-person-a' };

  test('admits calls immediately below both caps and rejects calls at either cap', async () => {
    const database = createDatabase();
    const gate = createGoogleMapsUsageGate({
      database: drizzleDatabase(database),
      dailyCap: 2,
      monthlyCap: 3,
      perPersonDailyLimit: 100,
      now: () => new Date('2026-07-12T23:59:59.000Z')
    });

    await expect(gate.admit('map-point-selection', person)).resolves.toEqual({ outcome: 'admitted' });
    await expect(gate.admit('commute-estimate', person)).resolves.toEqual({ outcome: 'admitted' });
    await expect(gate.admit('map-point-selection', person)).resolves.toEqual({
      outcome: 'suspended',
      reason: 'global-daily-cap'
    });

    const nextDay = createGoogleMapsUsageGate({
      database: drizzleDatabase(database),
      dailyCap: 2,
      monthlyCap: 3,
      perPersonDailyLimit: 100,
      now: () => new Date('2026-07-13T00:00:00.000Z')
    });
    await expect(nextDay.admit('commute-estimate', person)).resolves.toEqual({ outcome: 'admitted' });
    await expect(nextDay.admit('map-point-selection', person)).resolves.toEqual({
      outcome: 'suspended',
      reason: 'global-monthly-cap'
    });
  });

  test('limits one person without suspending another and resets at the UTC daily boundary', async () => {
    const database = createDatabase();
    let currentTime = new Date('2026-07-12T23:59:59.999Z');
    const gate = createGoogleMapsUsageGate({
      database: drizzleDatabase(database),
      dailyCap: 20,
      monthlyCap: 20,
      perPersonDailyLimit: 2,
      now: () => currentTime
    });
    const personA = createGoogleMapsPersonAttribution({
      authState: { mode: 'visitor' },
      visitorRequest: { clientAddress: '203.0.113.10', userAgent: 'Test Browser/1.0' },
      secret: 'test-attribution-secret-with-at-least-32-bytes'
    });
    const personB = createGoogleMapsPersonAttribution({
      authState: {
        mode: 'user',
        userId: 'signed-in-user-b',
        summaryRecipient: 'person-b@example.test'
      },
      secret: 'test-attribution-secret-with-at-least-32-bytes'
    });

    await expect(gate.admit('map-point-selection', personA)).resolves.toEqual({ outcome: 'admitted' });
    await expect(gate.admit('commute-estimate', personA)).resolves.toEqual({ outcome: 'admitted' });
    await expect(gate.admit('commute-estimate', personA)).resolves.toEqual({
      outcome: 'suspended',
      reason: 'per-person-daily-limit'
    });
    await expect(gate.admit('commute-estimate', personB)).resolves.toEqual({ outcome: 'admitted' });

    currentTime = new Date('2026-07-13T00:00:00.000Z');
    await expect(gate.admit('map-point-selection', personA)).resolves.toEqual({ outcome: 'admitted' });
  });

  test('rolls daily and monthly periods over at UTC boundaries', async () => {
    const database = createDatabase();
    let currentTime = new Date('2026-07-31T23:59:59.999Z');
    const gate = createGoogleMapsUsageGate({
      database: drizzleDatabase(database),
      dailyCap: 1,
      monthlyCap: 1,
      perPersonDailyLimit: 100,
      now: () => currentTime
    });

    await expect(gate.admit('commute-estimate', person)).resolves.toEqual({ outcome: 'admitted' });
    await expect(gate.admit('commute-estimate', person)).resolves.toEqual({
      outcome: 'suspended',
      reason: 'global-daily-cap'
    });

    currentTime = new Date('2026-08-01T00:00:00.000Z');
    await expect(gate.admit('map-point-selection', person)).resolves.toEqual({ outcome: 'admitted' });
  });

  test('rejects calls when reconfigured caps are already below persisted usage', async () => {
    const dailyDatabase = createDatabase();
    const initialDailyGate = createGoogleMapsUsageGate({
      database: drizzleDatabase(dailyDatabase),
      dailyCap: 4,
      monthlyCap: 4,
      perPersonDailyLimit: 100,
      now: () => new Date('2026-07-12T12:00:00.000Z')
    });
    await initialDailyGate.admit('map-point-selection', person);
    await initialDailyGate.admit('commute-estimate', person);
    await initialDailyGate.admit('commute-estimate', person);

    const reducedDailyGate = createGoogleMapsUsageGate({
      database: drizzleDatabase(dailyDatabase),
      dailyCap: 2,
      monthlyCap: 4,
      perPersonDailyLimit: 100,
      now: () => new Date('2026-07-12T12:01:00.000Z')
    });
    await expect(reducedDailyGate.admit('map-point-selection', person)).resolves.toEqual({
      outcome: 'suspended',
      reason: 'global-daily-cap'
    });

    const reducedMonthlyGate = createGoogleMapsUsageGate({
      database: drizzleDatabase(dailyDatabase),
      dailyCap: 4,
      monthlyCap: 2,
      perPersonDailyLimit: 100,
      now: () => new Date('2026-07-13T12:00:00.000Z')
    });
    await expect(reducedMonthlyGate.admit('map-point-selection', person)).resolves.toEqual({
      outcome: 'suspended',
      reason: 'global-monthly-cap'
    });
  });

  test('persists admitted usage across database connections and keeps categories distinguishable', async () => {
    const path = createDatabasePath();
    const firstDatabase = createDatabase(path);
    const firstGate = createGoogleMapsUsageGate({
      database: drizzleDatabase(firstDatabase),
      dailyCap: 3,
      monthlyCap: 3,
      perPersonDailyLimit: 100,
      now: () => new Date('2026-07-12T12:00:00.000Z')
    });

    await firstGate.admit('map-point-selection', person);
    await firstGate.admit('commute-estimate', person);
    firstDatabase.close();
    databases.splice(databases.indexOf(firstDatabase), 1);

    const restartedDatabase = createDatabase(path, false);
    const restartedGate = createGoogleMapsUsageGate({
      database: drizzleDatabase(restartedDatabase),
      dailyCap: 3,
      monthlyCap: 3,
      perPersonDailyLimit: 100,
      now: () => new Date('2026-07-12T12:01:00.000Z')
    });

    await expect(restartedGate.currentUsage()).resolves.toEqual({
      timeBasis: 'UTC',
      day: {
        periodStart: '2026-07-12',
        total: 2,
        byCategory: { 'map-point-selection': 1, 'commute-estimate': 1 }
      },
      month: {
        periodStart: '2026-07',
        total: 2,
        byCategory: { 'map-point-selection': 1, 'commute-estimate': 1 }
      }
    });
    await expect(restartedGate.admit('commute-estimate', person)).resolves.toEqual({ outcome: 'admitted' });
    await expect(restartedGate.admit('map-point-selection', person)).resolves.toEqual({
      outcome: 'suspended',
      reason: 'global-daily-cap'
    });
  });

  test('atomically admits no more concurrent requests than the shared cap', async () => {
    const path = createDatabasePath();
    const firstDatabase = createDatabase(path);
    const secondDatabase = createDatabase(path, false);
    const options = {
      dailyCap: 5,
      monthlyCap: 5,
      perPersonDailyLimit: 100,
      now: () => new Date('2026-07-12T12:00:00.000Z')
    };
    const gates = [
      createGoogleMapsUsageGate({ database: drizzleDatabase(firstDatabase), ...options }),
      createGoogleMapsUsageGate({ database: drizzleDatabase(secondDatabase), ...options })
    ];

    const outcomes = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        gates[index % gates.length]!.admit(index % 2 === 0 ? 'map-point-selection' : 'commute-estimate', person)
      )
    );

    expect(outcomes.filter(({ outcome }) => outcome === 'admitted')).toHaveLength(5);
    expect(outcomes.filter(({ outcome }) => outcome === 'suspended')).toHaveLength(7);
  });

  test('reads positive integer caps from deployment configuration', () => {
    expect(
      readGoogleMapsUsageCaps({
        GOOGLE_MAPS_GLOBAL_DAILY_CAP: '25',
        GOOGLE_MAPS_GLOBAL_MONTHLY_CAP: '500',
        GOOGLE_MAPS_PER_PERSON_DAILY_LIMIT: '50'
      })
    ).toEqual({ dailyCap: 25, monthlyCap: 500, perPersonDailyLimit: 50 });

    expect(() =>
      readGoogleMapsUsageCaps({
        GOOGLE_MAPS_GLOBAL_DAILY_CAP: '0',
        GOOGLE_MAPS_GLOBAL_MONTHLY_CAP: 'not-a-number',
        GOOGLE_MAPS_PER_PERSON_DAILY_LIMIT: '-1'
      })
    ).toThrow('Google Maps usage limits must be positive integers');
  });

  test('atomically admits no more concurrent requests for one person than their limit', async () => {
    const path = createDatabasePath();
    const firstDatabase = createDatabase(path);
    const secondDatabase = createDatabase(path, false);
    const options = {
      dailyCap: 20,
      monthlyCap: 20,
      perPersonDailyLimit: 3,
      now: () => new Date('2026-07-12T12:00:00.000Z')
    };
    const gates = [
      createGoogleMapsUsageGate({ database: drizzleDatabase(firstDatabase), ...options }),
      createGoogleMapsUsageGate({ database: drizzleDatabase(secondDatabase), ...options })
    ];

    const outcomes = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        gates[index % gates.length]!.admit('commute-estimate', person)
      )
    );

    expect(outcomes.filter(({ outcome }) => outcome === 'admitted')).toHaveLength(3);
    expect(outcomes.filter(({ outcome }) => outcome === 'suspended')).toHaveLength(7);
  });

  test('rejects unrecognized usage categories at the SQLite boundary', () => {
    const database = createDatabase();
    const insertUnknownCategory = database.prepare(`
      INSERT INTO google_maps_usage (
        period_kind,
        period_start_utc,
        category,
        request_count
      ) VALUES ('day', '2026-07-12', 'unknown-provider-call', 1)
    `);

    expect(() => insertUnknownCategory.run()).toThrow();
  });

  test('keeps a failed provider call reserved and blocks the next call before provider admission', async () => {
    const database = createDatabase();
    const usageGate = createGoogleMapsUsageGate({
      database: drizzleDatabase(database),
      dailyCap: 1,
      monthlyCap: 1,
      perPersonDailyLimit: 100,
      now: () => new Date('2026-07-12T12:00:00.000Z')
    });
    let providerCalls = 0;
    const provider: GoogleMapsProvider = {
      async selectPoint() {
        providerCalls += 1;
        throw new Error('provider failed after consuming quota');
      },
      async estimateCommute() {
        providerCalls += 1;
        return { durationMinutes: 15 };
      }
    };
    const gateway = createGoogleMapsRequestGateway({
      provider,
      attribution: { personUsageIdentity: "test-person" },
      usageGate,
      environmentKillSwitch: false,
      diagnostics: () => undefined
    });

    await expect(gateway.selectPoint({ latitude: 52, longitude: 21 })).resolves.toEqual({
      outcome: 'unavailable',
      reason: 'provider-unavailable'
    });
    await expect(
      gateway.estimateCommute({
        origin: { label: 'private origin', latitude: 52, longitude: 21 },
        destination: { label: 'private destination', latitude: 53, longitude: 22 }
      })
    ).resolves.toEqual({ outcome: 'unavailable', reason: 'global-daily-cap' });
    expect(providerCalls).toBe(1);
    await expect(usageGate.currentUsage()).resolves.toMatchObject({
      day: { total: 1 },
      month: { total: 1 }
    });
  });
});
