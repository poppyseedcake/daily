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
  changeGoogleMapsAdminKillSwitch,
  createGoogleMapsUsageGate as createDurableGoogleMapsUsageGate,
  readGoogleMapsUsageCaps,
  setGoogleMapsAdminKillSwitch,
  type GoogleMapsUsageGateOptions
} from './googleMapsUsageGate';
import * as schema from './schema';

const drizzleDatabase = (database: Database.Database) => drizzle(database, { schema });

const databases: Database.Database[] = [];
const temporaryDirectories: string[] = [];
const noOpCapAlertDelivery = { send: async () => undefined };
const flushAlertDeliveries = () => new Promise<void>((resolve) => setImmediate(resolve));
const createTestGoogleMapsUsageGate = (
  options: Omit<GoogleMapsUsageGateOptions, 'capAlertDelivery'> &
    Partial<Pick<GoogleMapsUsageGateOptions, 'capAlertDelivery'>>
) => createDurableGoogleMapsUsageGate({ capAlertDelivery: noOpCapAlertDelivery, ...options });

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
      );
      CREATE TABLE google_maps_control (
        control_key text PRIMARY KEY NOT NULL CHECK (control_key = 'admin-kill-switch'),
        enabled integer NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1))
      );
      CREATE TABLE google_maps_cap_alerts (
        cap_type text NOT NULL CHECK (cap_type IN ('daily', 'monthly')),
        period_start_utc text NOT NULL,
        delivery_status text NOT NULL CHECK (delivery_status IN ('pending', 'delivered', 'failed')),
        claimed_at text NOT NULL,
        completed_at text,
        failure_code text,
        PRIMARY KEY (cap_type, period_start_utc)
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

  test('delivers one privacy-safe operator alert when the daily cap is reached', async () => {
    const deliveredAlerts: unknown[] = [];
    const database = createDatabase();
    const gate = createTestGoogleMapsUsageGate({
      database: drizzleDatabase(database),
      dailyCap: 1,
      monthlyCap: 10,
      perPersonDailyLimit: 100,
      now: () => new Date('2026-07-12T12:00:00.000Z'),
      capAlertDelivery: {
        async send(alert) {
          deliveredAlerts.push(alert);
        }
      }
    });

    await expect(gate.admit('commute-estimate', person)).resolves.toEqual({ outcome: 'admitted' });
    await expect(gate.admit('map-point-selection', person)).resolves.toEqual({
      outcome: 'suspended',
      reason: 'global-daily-cap'
    });
    await flushAlertDeliveries();

    expect(deliveredAlerts).toEqual([
      {
        capType: 'daily',
        timeBasis: 'UTC',
        suspensionReason: 'global-daily-cap',
        daily: {
          periodStart: '2026-07-12',
          total: 1,
          cap: 1,
          byCategory: { 'map-point-selection': 0, 'commute-estimate': 1 }
        },
        monthly: {
          periodStart: '2026-07',
          total: 1,
          cap: 10,
          byCategory: { 'map-point-selection': 0, 'commute-estimate': 1 }
        }
      }
    ]);
    expect(JSON.stringify(deliveredAlerts)).not.toMatch(
      /personUsageIdentity|origin|destination|route|provider|summary|email/i
    );
  });

  test('delivers one monthly alert across blocked requests and an application restart', async () => {
    const deliveredAlerts: Array<{ capType: string }> = [];
    const path = createDatabasePath();
    const options = {
      dailyCap: 10,
      monthlyCap: 1,
      perPersonDailyLimit: 100,
      now: () => new Date('2026-07-12T12:00:00.000Z'),
      capAlertDelivery: {
        async send(alert: { capType: string }) {
          deliveredAlerts.push(alert);
        }
      }
    };
    const firstDatabase = createDatabase(path);
    const firstGate = createTestGoogleMapsUsageGate({
      database: drizzleDatabase(firstDatabase),
      ...options
    });

    await expect(firstGate.admit('map-point-selection', person)).resolves.toEqual({
      outcome: 'admitted'
    });
    await expect(firstGate.admit('commute-estimate', person)).resolves.toEqual({
      outcome: 'suspended',
      reason: 'global-monthly-cap'
    });
    firstDatabase.close();
    databases.splice(databases.indexOf(firstDatabase), 1);

    const restartedGate = createTestGoogleMapsUsageGate({
      database: drizzleDatabase(createDatabase(path, false)),
      ...options
    });
    await expect(restartedGate.admit('commute-estimate', person)).resolves.toEqual({
      outcome: 'suspended',
      reason: 'global-monthly-cap'
    });
    await flushAlertDeliveries();

    expect(deliveredAlerts.map(({ capType }) => capType)).toEqual(['monthly']);
  });

  test('keeps Maps suspended and records one safe diagnostic when alert delivery fails', async () => {
    const path = createDatabasePath();
    const diagnostics: unknown[] = [];
    let deliveryAttempts = 0;
    const options = {
      dailyCap: 1,
      monthlyCap: 10,
      perPersonDailyLimit: 100,
      now: () => new Date('2026-07-12T12:00:00.000Z'),
      capAlertDelivery: {
        async send() {
          deliveryAttempts += 1;
          throw new Error('private alert provider failure');
        }
      },
      capAlertDiagnostics: (event: unknown) => diagnostics.push(event)
    };
    const firstDatabase = createDatabase(path);
    const firstGate = createTestGoogleMapsUsageGate({
      database: drizzleDatabase(firstDatabase),
      ...options
    });

    await expect(firstGate.admit('commute-estimate', person)).resolves.toEqual({
      outcome: 'admitted'
    });
    firstDatabase.close();
    databases.splice(databases.indexOf(firstDatabase), 1);

    const restartedGate = createTestGoogleMapsUsageGate({
      database: drizzleDatabase(createDatabase(path, false)),
      ...options
    });
    await expect(restartedGate.admit('map-point-selection', person)).resolves.toEqual({
      outcome: 'suspended',
      reason: 'global-daily-cap'
    });

    expect(deliveryAttempts).toBe(1);
    expect(diagnostics).toEqual([
      {
        capType: 'daily',
        periodStart: '2026-07-12',
        outcome: 'failed',
        failureCode: 'delivery-failed'
      }
    ]);
    expect(JSON.stringify(diagnostics)).not.toContain('private alert provider failure');
  });

  test('reclaims an expired pending alert after a restart', async () => {
    const path = createDatabasePath();
    const firstDatabase = createDatabase(path);
    firstDatabase.exec(`
      INSERT INTO google_maps_usage VALUES ('day', '2026-07-12', 'commute-estimate', 1);
      INSERT INTO google_maps_usage VALUES ('month', '2026-07', 'commute-estimate', 1);
      INSERT INTO google_maps_cap_alerts VALUES (
        'daily', '2026-07-12', 'pending', '2026-07-12T11:54:00.000Z', NULL, NULL
      );
    `);
    firstDatabase.close();
    databases.splice(databases.indexOf(firstDatabase), 1);

    const deliveredCapTypes: string[] = [];
    const restartedDatabase = createDatabase(path, false);
    const restartedGate = createTestGoogleMapsUsageGate({
      database: drizzleDatabase(restartedDatabase),
      dailyCap: 1,
      monthlyCap: 10,
      perPersonDailyLimit: 100,
      now: () => new Date('2026-07-12T12:00:00.000Z'),
      capAlertDelivery: {
        async send(alert) {
          deliveredCapTypes.push(alert.capType);
        }
      }
    });

    await expect(restartedGate.admit('map-point-selection', person)).resolves.toEqual({
      outcome: 'suspended',
      reason: 'global-daily-cap'
    });
    await flushAlertDeliveries();

    expect(deliveredCapTypes).toEqual(['daily']);
    expect(
      restartedDatabase
        .prepare(
          "SELECT delivery_status FROM google_maps_cap_alerts WHERE cap_type = 'daily' AND period_start_utc = '2026-07-12'"
        )
        .get()
    ).toEqual({ delivery_status: 'delivered' });
  });

  test('returns the admission result without waiting for a slow cap alert provider', async () => {
    let beginDelivery: (() => void) | undefined;
    let deliveryStarted = false;
    const gate = createTestGoogleMapsUsageGate({
      database: drizzleDatabase(createDatabase()),
      dailyCap: 1,
      monthlyCap: 10,
      perPersonDailyLimit: 100,
      now: () => new Date('2026-07-12T12:00:00.000Z'),
      capAlertDelivery: {
        send() {
          deliveryStarted = true;
          return new Promise<void>((resolve) => {
            beginDelivery = resolve;
          });
        }
      }
    });

    await expect(gate.admit('commute-estimate', person)).resolves.toEqual({ outcome: 'admitted' });
    expect(deliveryStarted).toBe(true);

    expect(beginDelivery).toBeTypeOf('function');
    beginDelivery!();
    await flushAlertDeliveries();
  });

  test('claims both cap alerts when persisted usage already reaches reconfigured caps', async () => {
    const deliveredCapTypes: string[] = [];
    const database = createDatabase();
    const initialGate = createTestGoogleMapsUsageGate({
      database: drizzleDatabase(database),
      dailyCap: 2,
      monthlyCap: 2,
      perPersonDailyLimit: 100,
      now: () => new Date('2026-07-12T12:00:00.000Z')
    });
    await initialGate.admit('commute-estimate', person);

    const reconfiguredGate = createTestGoogleMapsUsageGate({
      database: drizzleDatabase(database),
      dailyCap: 1,
      monthlyCap: 1,
      perPersonDailyLimit: 100,
      now: () => new Date('2026-07-12T12:01:00.000Z'),
      capAlertDelivery: {
        async send(alert) {
          deliveredCapTypes.push(alert.capType);
        }
      }
    });

    await expect(reconfiguredGate.admit('map-point-selection', person)).resolves.toEqual({
      outcome: 'suspended',
      reason: 'global-daily-cap'
    });
    await flushAlertDeliveries();
    expect(deliveredCapTypes).toEqual(['daily', 'monthly']);
  });

  test('delivers new daily and monthly alerts after the UTC periods roll over', async () => {
    let currentTime = new Date('2026-07-31T23:59:59.999Z');
    const deliveredPeriods: string[] = [];
    const gate = createTestGoogleMapsUsageGate({
      database: drizzleDatabase(createDatabase()),
      dailyCap: 1,
      monthlyCap: 1,
      perPersonDailyLimit: 100,
      now: () => currentTime,
      capAlertDelivery: {
        async send(alert) {
          deliveredPeriods.push(
            `${alert.capType}:${
              alert.capType === 'daily' ? alert.daily.periodStart : alert.monthly.periodStart
            }`
          );
        }
      }
    });

    await expect(gate.admit('commute-estimate', person)).resolves.toEqual({ outcome: 'admitted' });
    currentTime = new Date('2026-08-01T00:00:00.000Z');
    await expect(gate.admit('map-point-selection', person)).resolves.toEqual({ outcome: 'admitted' });
    await flushAlertDeliveries();

    expect(deliveredPeriods).toEqual([
      'daily:2026-07-31',
      'monthly:2026-07',
      'daily:2026-08-01',
      'monthly:2026-08'
    ]);
  });

  test('admits calls immediately below both caps and rejects calls at either cap', async () => {
    const database = createDatabase();
    const gate = createTestGoogleMapsUsageGate({
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

    const nextDay = createTestGoogleMapsUsageGate({
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
    const gate = createTestGoogleMapsUsageGate({
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
    const gate = createTestGoogleMapsUsageGate({
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
    const initialDailyGate = createTestGoogleMapsUsageGate({
      database: drizzleDatabase(dailyDatabase),
      dailyCap: 4,
      monthlyCap: 4,
      perPersonDailyLimit: 100,
      now: () => new Date('2026-07-12T12:00:00.000Z')
    });
    await initialDailyGate.admit('map-point-selection', person);
    await initialDailyGate.admit('commute-estimate', person);
    await initialDailyGate.admit('commute-estimate', person);

    const reducedDailyGate = createTestGoogleMapsUsageGate({
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

    const reducedMonthlyGate = createTestGoogleMapsUsageGate({
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
    const firstGate = createTestGoogleMapsUsageGate({
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
    const restartedGate = createTestGoogleMapsUsageGate({
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
      createTestGoogleMapsUsageGate({ database: drizzleDatabase(firstDatabase), ...options }),
      createTestGoogleMapsUsageGate({ database: drizzleDatabase(secondDatabase), ...options })
    ];

    const outcomes = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        gates[index % gates.length]!.admit(index % 2 === 0 ? 'map-point-selection' : 'commute-estimate', person)
      )
    );

    expect(outcomes.filter(({ outcome }) => outcome === 'admitted')).toHaveLength(5);
    expect(outcomes.filter(({ outcome }) => outcome === 'suspended')).toHaveLength(7);
  });

  test('claims one cap alert across concurrent usage gates', async () => {
    const path = createDatabasePath();
    const firstDatabase = createDatabase(path);
    const secondDatabase = createDatabase(path, false);
    let deliveredAlerts = 0;
    const options = {
      dailyCap: 1,
      monthlyCap: 10,
      perPersonDailyLimit: 100,
      now: () => new Date('2026-07-12T12:00:00.000Z'),
      capAlertDelivery: {
        async send() {
          deliveredAlerts += 1;
        }
      }
    };
    const gates = [
      createTestGoogleMapsUsageGate({ database: drizzleDatabase(firstDatabase), ...options }),
      createTestGoogleMapsUsageGate({ database: drizzleDatabase(secondDatabase), ...options })
    ];

    const outcomes = await Promise.all(
      gates.map((gate) => gate.admit('commute-estimate', person))
    );

    expect(outcomes.map(({ outcome }) => outcome).sort()).toEqual(['admitted', 'suspended']);
    await flushAlertDeliveries();
    expect(deliveredAlerts).toBe(1);
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

  test('persists the Administrator kill switch and blocks protected calls without consuming usage', async () => {
    const path = createDatabasePath();
    const firstDatabase = createDatabase(path);
    const options = {
      dailyCap: 2,
      monthlyCap: 3,
      perPersonDailyLimit: 100,
      now: () => new Date('2026-07-12T12:00:00.000Z')
    };
    const firstGate = createTestGoogleMapsUsageGate({
      database: drizzleDatabase(firstDatabase),
      ...options
    });

    await expect(firstGate.setAdminKillSwitch(true)).resolves.toBeUndefined();
    await expect(firstGate.admit('map-point-selection', person)).resolves.toEqual({
      outcome: 'suspended',
      reason: 'admin-kill-switch'
    });
    await expect(firstGate.currentUsage()).resolves.toMatchObject({
      day: { total: 0 },
      month: { total: 0 }
    });

    firstDatabase.close();
    databases.splice(databases.indexOf(firstDatabase), 1);
    const restartedGate = createTestGoogleMapsUsageGate({
      database: drizzleDatabase(createDatabase(path, false)),
      ...options
    });

    await expect(restartedGate.currentOperations(false)).resolves.toMatchObject({
      adminKillSwitchEnabled: true,
      environmentKillSwitchEnabled: false,
      effectiveState: 'suspended',
      suspensionReason: 'admin-kill-switch'
    });
    await restartedGate.setAdminKillSwitch(false);
    await expect(restartedGate.admit('commute-estimate', person)).resolves.toEqual({
      outcome: 'admitted'
    });
  });

  test('updates the Administrator kill switch without requiring usage cap configuration', () => {
    const database = drizzleDatabase(createDatabase());

    expect(() => setGoogleMapsAdminKillSwitch(database, true)).not.toThrow();
    expect(
      database.select().from(schema.googleMapsControl).get()
    ).toMatchObject({ controlKey: 'admin-kill-switch', enabled: true });
  });

  test('reports whether the Administrator kill switch actually changed', () => {
    const database = drizzleDatabase(createDatabase());

    expect(changeGoogleMapsAdminKillSwitch(database, true)).toEqual({
      previousEnabled: false,
      newEnabled: true,
      changed: true
    });
    expect(changeGoogleMapsAdminKillSwitch(database, true)).toEqual({
      previousEnabled: true,
      newEnabled: true,
      changed: false
    });
    expect(changeGoogleMapsAdminKillSwitch(database, false)).toEqual({
      previousEnabled: true,
      newEnabled: false,
      changed: true
    });
  });

  test('reports environment control precedence and cap suspension from privacy-safe aggregate data', async () => {
    const database = createDatabase();
    const gate = createTestGoogleMapsUsageGate({
      database: drizzleDatabase(database),
      dailyCap: 1,
      monthlyCap: 2,
      perPersonDailyLimit: 100,
      now: () => new Date('2026-07-12T12:00:00.000Z')
    });

    await gate.setAdminKillSwitch(true);
    await expect(gate.currentOperations(true)).resolves.toMatchObject({
      environmentKillSwitchEnabled: true,
      adminKillSwitchEnabled: true,
      effectiveState: 'suspended',
      suspensionReason: 'environment-kill-switch'
    });

    await gate.setAdminKillSwitch(false);
    await gate.admit('commute-estimate', person);
    const operations = await gate.currentOperations(false);
    expect(operations).toEqual({
      timeBasis: 'UTC',
      daily: {
        periodStart: '2026-07-12',
        total: 1,
        cap: 1,
        byCategory: { 'map-point-selection': 0, 'commute-estimate': 1 }
      },
      monthly: {
        periodStart: '2026-07',
        total: 1,
        cap: 2,
        byCategory: { 'map-point-selection': 0, 'commute-estimate': 1 }
      },
      environmentKillSwitchEnabled: false,
      adminKillSwitchEnabled: false,
      effectiveState: 'suspended',
      suspensionReason: 'global-daily-cap'
    });
    expect(JSON.stringify(operations)).not.toMatch(
      /personUsageIdentity|origin|destination|route|provider|summary|email/i
    );
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
      createTestGoogleMapsUsageGate({ database: drizzleDatabase(firstDatabase), ...options }),
      createTestGoogleMapsUsageGate({ database: drizzleDatabase(secondDatabase), ...options })
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
    const usageGate = createTestGoogleMapsUsageGate({
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
