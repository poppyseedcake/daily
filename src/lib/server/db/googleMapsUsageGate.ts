import { and, eq, sql, sum } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type {
  GoogleMapsAdmission,
  GoogleMapsCallCategory,
  GoogleMapsUsageGate
} from '../googleMapsRequestGateway';
import * as schema from './schema';

type GoogleMapsDatabase = BetterSQLite3Database<typeof schema>;
const { googleMapsUsage } = schema;

export type GoogleMapsUsageGateOptions = {
  database: GoogleMapsDatabase;
  dailyCap: number;
  monthlyCap: number;
  now?: () => Date;
};

export type GoogleMapsUsageCapsEnvironment = {
  GOOGLE_MAPS_GLOBAL_DAILY_CAP?: string;
  GOOGLE_MAPS_GLOBAL_MONTHLY_CAP?: string;
};

type UsageByCategory = Record<GoogleMapsCallCategory, number>;

export type GoogleMapsUsageSnapshot = {
  timeBasis: 'UTC';
  day: { periodStart: string; total: number; byCategory: UsageByCategory };
  month: { periodStart: string; total: number; byCategory: UsageByCategory };
};

export type GoogleMapsDurableUsageGate = GoogleMapsUsageGate & {
  currentUsage: () => Promise<GoogleMapsUsageSnapshot>;
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
): Pick<GoogleMapsUsageGateOptions, 'dailyCap' | 'monthlyCap'> => {
  const dailyCap = positiveInteger(environment.GOOGLE_MAPS_GLOBAL_DAILY_CAP);
  const monthlyCap = positiveInteger(environment.GOOGLE_MAPS_GLOBAL_MONTHLY_CAP);

  if (dailyCap === null || monthlyCap === null) {
    throw new Error('Google Maps global caps must be positive integers');
  }

  return { dailyCap, monthlyCap };
};

export const createGoogleMapsUsageGate = ({
  database,
  dailyCap,
  monthlyCap,
  now = () => new Date()
}: GoogleMapsUsageGateOptions): GoogleMapsDurableUsageGate => {
  if (
    !Number.isSafeInteger(dailyCap) ||
    dailyCap <= 0 ||
    !Number.isSafeInteger(monthlyCap) ||
    monthlyCap <= 0
  ) {
    throw new Error('Google Maps global caps must be positive integers');
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
      total: byCategory['map-point-selection'] + byCategory['commute-estimate'],
      byCategory
    };
  };

  const admit = (category: GoogleMapsCallCategory, periods: [UsagePeriod, UsagePeriod]) =>
    database.transaction(
      (transaction): GoogleMapsAdmission => {
      const [day, month] = periods;

      if (usageForPeriod(transaction, day) >= dailyCap) {
        return { outcome: 'suspended', reason: 'global-daily-cap' };
      }

      if (usageForPeriod(transaction, month) >= monthlyCap) {
        return { outcome: 'suspended', reason: 'global-monthly-cap' };
      }

      reserve(transaction, day, category);
      reserve(transaction, month, category);
      return { outcome: 'admitted' };
      },
      { behavior: 'immediate' }
    );

  return {
    async admit(category) {
      return admit(category, utcPeriodsFor(now()));
    },
    async currentUsage() {
      const [day, month] = utcPeriodsFor(now());
      return {
        timeBasis: 'UTC',
        day: snapshotFor(day),
        month: snapshotFor(month)
      };
    }
  };
};
