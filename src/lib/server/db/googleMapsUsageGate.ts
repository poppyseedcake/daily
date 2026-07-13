import { and, eq, sql, sum } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type {
  GoogleMapsAdmission,
  GoogleMapsCallCategory,
  GoogleMapsPersonAttribution,
  GoogleMapsUsageGate
} from '../googleMapsRequestGateway';
import * as schema from './schema';

type GoogleMapsDatabase = BetterSQLite3Database<typeof schema>;
const { googleMapsControl, googleMapsPersonUsage, googleMapsUsage } = schema;

export type GoogleMapsUsageGateOptions = {
  database: GoogleMapsDatabase;
  dailyCap: number;
  monthlyCap: number;
  perPersonDailyLimit: number;
  now?: () => Date;
};

export type GoogleMapsUsageCapsEnvironment = {
  GOOGLE_MAPS_GLOBAL_DAILY_CAP?: string;
  GOOGLE_MAPS_GLOBAL_MONTHLY_CAP?: string;
  GOOGLE_MAPS_PER_PERSON_DAILY_LIMIT?: string;
};

type UsageByCategory = Record<GoogleMapsCallCategory, number>;

export type GoogleMapsUsageSnapshot = {
  timeBasis: 'UTC';
  day: { periodStart: string; total: number; byCategory: UsageByCategory };
  month: { periodStart: string; total: number; byCategory: UsageByCategory };
};

export type GoogleMapsDurableUsageGate = GoogleMapsUsageGate & {
  currentUsage: () => Promise<GoogleMapsUsageSnapshot>;
  currentOperations: (
    environmentKillSwitchEnabled: boolean
  ) => Promise<GoogleMapsOperationsSnapshot>;
  setAdminKillSwitch: (enabled: boolean) => Promise<void>;
};

export type GoogleMapsOperationsSnapshot = {
  timeBasis: 'UTC';
  daily: GoogleMapsUsageSnapshot['day'] & { cap: number };
  monthly: GoogleMapsUsageSnapshot['month'] & { cap: number };
  environmentKillSwitchEnabled: boolean;
  adminKillSwitchEnabled: boolean;
  effectiveState: 'active' | 'suspended';
  suspensionReason:
    | 'environment-kill-switch'
    | 'admin-kill-switch'
    | 'global-daily-cap'
    | 'global-monthly-cap'
    | null;
};

type UsagePeriod = {
  kind: 'day' | 'month';
  start: string;
};

const utcPeriodsFor = (date: Date): [UsagePeriod, UsagePeriod] => {
  const iso = date.toISOString();
  return [
    { kind: 'day', start: iso.slice(0, 10) },
    { kind: 'month', start: iso.slice(0, 7) }
  ];
};

const positiveInteger = (value: string | undefined): number | null => {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

export const readGoogleMapsUsageCaps = (
  environment: GoogleMapsUsageCapsEnvironment
): Pick<GoogleMapsUsageGateOptions, 'dailyCap' | 'monthlyCap' | 'perPersonDailyLimit'> => {
  const dailyCap = positiveInteger(environment.GOOGLE_MAPS_GLOBAL_DAILY_CAP);
  const monthlyCap = positiveInteger(environment.GOOGLE_MAPS_GLOBAL_MONTHLY_CAP);
  const perPersonDailyLimit = positiveInteger(environment.GOOGLE_MAPS_PER_PERSON_DAILY_LIMIT);

  if (dailyCap === null || monthlyCap === null || perPersonDailyLimit === null) {
    throw new Error('Google Maps usage limits must be positive integers');
  }

  return { dailyCap, monthlyCap, perPersonDailyLimit };
};

export const setGoogleMapsAdminKillSwitch = (
  database: GoogleMapsDatabase,
  enabled: boolean
): void => {
  database
    .insert(googleMapsControl)
    .values({ controlKey: 'admin-kill-switch', enabled })
    .onConflictDoUpdate({
      target: googleMapsControl.controlKey,
      set: { enabled }
    })
    .run();
};

export const createGoogleMapsUsageGate = ({
  database,
  dailyCap,
  monthlyCap,
  perPersonDailyLimit,
  now = () => new Date()
}: GoogleMapsUsageGateOptions): GoogleMapsDurableUsageGate => {
  if (
    !Number.isSafeInteger(dailyCap) ||
    dailyCap <= 0 ||
    !Number.isSafeInteger(monthlyCap) ||
    monthlyCap <= 0 ||
    !Number.isSafeInteger(perPersonDailyLimit) ||
    perPersonDailyLimit <= 0
  ) {
    throw new Error('Google Maps usage limits must be positive integers');
  }

  const usageForPeriod = (source: GoogleMapsDatabase, period: UsagePeriod) =>
    Number(
      source
        .select({ total: sum(googleMapsUsage.requestCount) })
        .from(googleMapsUsage)
        .where(
          and(
            eq(googleMapsUsage.periodKind, period.kind),
            eq(googleMapsUsage.periodStartUtc, period.start)
          )
        )
        .get()?.total ?? 0
    );

  const reserve = (
    source: GoogleMapsDatabase,
    period: UsagePeriod,
    category: GoogleMapsCallCategory
  ) =>
    source
      .insert(googleMapsUsage)
      .values({
        periodKind: period.kind,
        periodStartUtc: period.start,
        category,
        requestCount: 1
      })
      .onConflictDoUpdate({
        target: [
          googleMapsUsage.periodKind,
          googleMapsUsage.periodStartUtc,
          googleMapsUsage.category
        ],
        set: { requestCount: sql`${googleMapsUsage.requestCount} + 1` }
      })
      .run();

  const snapshotFor = (period: UsagePeriod) => {
    const byCategory: UsageByCategory = {
      'map-point-selection': 0,
      'commute-estimate': 0
    };

    const rows = database
      .select({
        category: googleMapsUsage.category,
        requestCount: googleMapsUsage.requestCount
      })
      .from(googleMapsUsage)
      .where(
        and(
          eq(googleMapsUsage.periodKind, period.kind),
          eq(googleMapsUsage.periodStartUtc, period.start)
        )
      )
      .orderBy(googleMapsUsage.category)
      .all();

    for (const row of rows) {
      byCategory[row.category] = row.requestCount;
    }

    return {
      periodStart: period.start,
      total: usageForPeriod(database, period),
      byCategory
    };
  };

  const personUsageForDay = (
    source: GoogleMapsDatabase,
    day: UsagePeriod,
    attribution: GoogleMapsPersonAttribution
  ) =>
    source
      .select({ requestCount: googleMapsPersonUsage.requestCount })
      .from(googleMapsPersonUsage)
      .where(
        and(
          eq(googleMapsPersonUsage.periodStartUtc, day.start),
          eq(googleMapsPersonUsage.personUsageIdentity, attribution.personUsageIdentity)
        )
      )
      .get()?.requestCount ?? 0;

  const reservePersonUsage = (
    source: GoogleMapsDatabase,
    day: UsagePeriod,
    attribution: GoogleMapsPersonAttribution
  ) =>
    source
      .insert(googleMapsPersonUsage)
      .values({
        periodStartUtc: day.start,
        personUsageIdentity: attribution.personUsageIdentity,
        requestCount: 1
      })
      .onConflictDoUpdate({
        target: [googleMapsPersonUsage.periodStartUtc, googleMapsPersonUsage.personUsageIdentity],
        set: { requestCount: sql`${googleMapsPersonUsage.requestCount} + 1` }
      })
      .run();

  const adminKillSwitchEnabled = (source: GoogleMapsDatabase) =>
    source
      .select({ enabled: googleMapsControl.enabled })
      .from(googleMapsControl)
      .where(eq(googleMapsControl.controlKey, 'admin-kill-switch'))
      .get()?.enabled ?? false;

  const admit = (
    category: GoogleMapsCallCategory,
    attribution: GoogleMapsPersonAttribution,
    periods: [UsagePeriod, UsagePeriod]
  ) =>
    database.transaction(
      (transaction): GoogleMapsAdmission => {
        const [day, month] = periods;

        if (adminKillSwitchEnabled(transaction)) {
          return { outcome: 'suspended', reason: 'admin-kill-switch' };
        }

        if (personUsageForDay(transaction, day, attribution) >= perPersonDailyLimit) {
          return { outcome: 'suspended', reason: 'per-person-daily-limit' };
        }

        if (usageForPeriod(transaction, day) >= dailyCap) {
          return { outcome: 'suspended', reason: 'global-daily-cap' };
        }

        if (usageForPeriod(transaction, month) >= monthlyCap) {
          return { outcome: 'suspended', reason: 'global-monthly-cap' };
        }

        reserve(transaction, day, category);
        reserve(transaction, month, category);
        reservePersonUsage(transaction, day, attribution);
        return { outcome: 'admitted' };
      },
      { behavior: 'immediate' }
    );

  const currentUsage = (): GoogleMapsUsageSnapshot => {
    const [day, month] = utcPeriodsFor(now());
    return {
      timeBasis: 'UTC',
      day: snapshotFor(day),
      month: snapshotFor(month)
    };
  };

  return {
    async admit(category, attribution) {
      return admit(category, attribution, utcPeriodsFor(now()));
    },
    async currentUsage() {
      return currentUsage();
    },
    async currentOperations(environmentKillSwitchEnabled) {
      const usage = currentUsage();
      const adminEnabled = adminKillSwitchEnabled(database);
      const suspensionReason = environmentKillSwitchEnabled
        ? 'environment-kill-switch'
        : adminEnabled
          ? 'admin-kill-switch'
          : usage.day.total >= dailyCap
            ? 'global-daily-cap'
            : usage.month.total >= monthlyCap
              ? 'global-monthly-cap'
              : null;

      return {
        timeBasis: usage.timeBasis,
        daily: { ...usage.day, cap: dailyCap },
        monthly: { ...usage.month, cap: monthlyCap },
        environmentKillSwitchEnabled,
        adminKillSwitchEnabled: adminEnabled,
        effectiveState: suspensionReason === null ? 'active' : 'suspended',
        suspensionReason
      };
    },
    async setAdminKillSwitch(enabled) {
      setGoogleMapsAdminKillSwitch(database, enabled);
    }
  };
};
