import { and, eq, lt, sql, sum } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type {
  GoogleMapsAdmission,
  GoogleMapsCallCategory,
  GoogleMapsPersonAttribution,
  GoogleMapsUsageGate
} from '../googleMapsRequestGateway';
import * as schema from './schema';

type GoogleMapsDatabase = BetterSQLite3Database<typeof schema>;
const { googleMapsCapAlerts, googleMapsControl, googleMapsPersonUsage, googleMapsUsage } = schema;
const capAlertLeaseDurationMs = 5 * 60 * 1000;

export type GoogleMapsCapAlert = {
  capType: 'daily' | 'monthly';
  timeBasis: 'UTC';
  suspensionReason: 'global-daily-cap' | 'global-monthly-cap';
  daily: GoogleMapsUsageSnapshot['day'] & { cap: number };
  monthly: GoogleMapsUsageSnapshot['month'] & { cap: number };
};

export type GoogleMapsCapAlertDelivery = {
  send: (alert: GoogleMapsCapAlert) => Promise<void>;
};

export type GoogleMapsCapAlertDiagnosticsEvent = {
  capType: 'daily' | 'monthly';
  periodStart: string;
  outcome: 'failed';
  failureCode: 'delivery-failed';
};

export type GoogleMapsUsageGateOptions = {
  database: GoogleMapsDatabase;
  dailyCap: number;
  monthlyCap: number;
  perPersonDailyLimit: number;
  capAlertDelivery: GoogleMapsCapAlertDelivery;
  now?: () => Date;
  capAlertDiagnostics?: (event: GoogleMapsCapAlertDiagnosticsEvent) => void;
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
  capAlerts: {
    daily: GoogleMapsCapAlertOutcome | null;
    monthly: GoogleMapsCapAlertOutcome | null;
  };
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

export type GoogleMapsCapAlertOutcome = {
  periodStart: string;
  status: 'pending' | 'delivered' | 'failed';
  completedAt: string | null;
  failureCode: 'delivery-failed' | null;
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

const readGoogleMapsAdminKillSwitch = (database: GoogleMapsDatabase) =>
  database
    .select({ enabled: googleMapsControl.enabled })
    .from(googleMapsControl)
    .where(eq(googleMapsControl.controlKey, 'admin-kill-switch'))
    .get()?.enabled ?? false;

export const changeGoogleMapsAdminKillSwitch = (
  database: GoogleMapsDatabase,
  enabled: boolean
) =>
  database.transaction((transaction) => {
    const previousEnabled = readGoogleMapsAdminKillSwitch(transaction);
    if (previousEnabled === enabled) {
      return { previousEnabled, newEnabled: enabled, changed: false };
    }

    setGoogleMapsAdminKillSwitch(transaction, enabled);
    return { previousEnabled, newEnabled: enabled, changed: true };
  });

export const createGoogleMapsUsageGate = ({
  database,
  dailyCap,
  monthlyCap,
  perPersonDailyLimit,
  capAlertDelivery,
  now = () => new Date(),
  capAlertDiagnostics = (event) => {
    console.warn('Google Maps cap alert delivery failed.', event);
  }
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

  const snapshotFor = (source: GoogleMapsDatabase, period: UsagePeriod) => {
    const byCategory: UsageByCategory = {
      'map-point-selection': 0,
      'commute-estimate': 0
    };

    const rows = source
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
      total: usageForPeriod(source, period),
      byCategory
    };
  };

  const claimCapAlert = (
    source: GoogleMapsDatabase,
    capType: 'daily' | 'monthly',
    periodStartUtc: string,
    claimedAt: string
  ) => {
    const alertRecord = and(
      eq(googleMapsCapAlerts.capType, capType),
      eq(googleMapsCapAlerts.periodStartUtc, periodStartUtc)
    );
    const inserted = source
      .insert(googleMapsCapAlerts)
      .values({
        capType,
        periodStartUtc,
        deliveryStatus: 'pending',
        claimedAt
      })
      .onConflictDoNothing()
      .run().changes === 1;

    if (inserted) return true;

    const leaseExpiredAt = new Date(
      new Date(claimedAt).getTime() - capAlertLeaseDurationMs
    ).toISOString();
    return (
      source
        .update(googleMapsCapAlerts)
        .set({ claimedAt })
        .where(
          and(
            alertRecord,
            eq(googleMapsCapAlerts.deliveryStatus, 'pending'),
            lt(googleMapsCapAlerts.claimedAt, leaseExpiredAt)
          )
        )
        .run().changes === 1
    );
  };

  const capAlert = (
    source: GoogleMapsDatabase,
    capType: 'daily' | 'monthly',
    day: UsagePeriod,
    month: UsagePeriod
  ): GoogleMapsCapAlert => ({
    capType,
    timeBasis: 'UTC',
    suspensionReason: capType === 'daily' ? 'global-daily-cap' : 'global-monthly-cap',
    daily: { ...snapshotFor(source, day), cap: dailyCap },
    monthly: { ...snapshotFor(source, month), cap: monthlyCap }
  });

  const claimReachedCapAlerts = (
    source: GoogleMapsDatabase,
    day: UsagePeriod,
    month: UsagePeriod,
    claimedAt: string
  ) => {
    const alerts: GoogleMapsCapAlert[] = [];
    if (
      usageForPeriod(source, day) >= dailyCap &&
      claimCapAlert(source, 'daily', day.start, claimedAt)
    ) {
      alerts.push(capAlert(source, 'daily', day, month));
    }
    if (
      usageForPeriod(source, month) >= monthlyCap &&
      claimCapAlert(source, 'monthly', month.start, claimedAt)
    ) {
      alerts.push(capAlert(source, 'monthly', day, month));
    }
    return alerts;
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

  const admit = (
    category: GoogleMapsCallCategory,
    attribution: GoogleMapsPersonAttribution,
    periods: [UsagePeriod, UsagePeriod],
    claimedAt: string
  ) =>
    database.transaction(
      (transaction): { admission: GoogleMapsAdmission; alerts: GoogleMapsCapAlert[] } => {
        const [day, month] = periods;

        if (readGoogleMapsAdminKillSwitch(transaction)) {
          return { admission: { outcome: 'suspended', reason: 'admin-kill-switch' }, alerts: [] };
        }

        if (personUsageForDay(transaction, day, attribution) >= perPersonDailyLimit) {
          return {
            admission: { outcome: 'suspended', reason: 'per-person-daily-limit' },
            alerts: []
          };
        }

        if (usageForPeriod(transaction, day) >= dailyCap) {
          return {
            admission: { outcome: 'suspended', reason: 'global-daily-cap' },
            alerts: claimReachedCapAlerts(transaction, day, month, claimedAt)
          };
        }

        if (usageForPeriod(transaction, month) >= monthlyCap) {
          return {
            admission: { outcome: 'suspended', reason: 'global-monthly-cap' },
            alerts: claimReachedCapAlerts(transaction, day, month, claimedAt)
          };
        }

        reserve(transaction, day, category);
        reserve(transaction, month, category);
        reservePersonUsage(transaction, day, attribution);
        return {
          admission: { outcome: 'admitted' },
          alerts: claimReachedCapAlerts(transaction, day, month, claimedAt)
        };
      },
      { behavior: 'immediate' }
    );

  const currentUsage = (at = now()): GoogleMapsUsageSnapshot => {
    const [day, month] = utcPeriodsFor(at);
    return {
      timeBasis: 'UTC',
      day: snapshotFor(database, day),
      month: snapshotFor(database, month)
    };
  };

  const capAlertOutcomeFor = (
    source: GoogleMapsDatabase,
    capType: 'daily' | 'monthly',
    periodStart: string
  ): GoogleMapsCapAlertOutcome | null => {
    const record = source
      .select({
        status: googleMapsCapAlerts.deliveryStatus,
        completedAt: googleMapsCapAlerts.completedAt,
        failureCode: googleMapsCapAlerts.failureCode
      })
      .from(googleMapsCapAlerts)
      .where(
        and(
          eq(googleMapsCapAlerts.capType, capType),
          eq(googleMapsCapAlerts.periodStartUtc, periodStart)
        )
      )
      .get();

    if (!record) return null;

    return {
      periodStart,
      status: record.status,
      completedAt: record.completedAt,
      failureCode: record.failureCode === 'delivery-failed' ? 'delivery-failed' : null
    };
  };

  const deliverAlerts = async (alerts: GoogleMapsCapAlert[], attemptedAt: Date) => {
    for (const alert of alerts) {
      const periodStart =
        alert.capType === 'daily' ? alert.daily.periodStart : alert.monthly.periodStart;
      const alertRecord = and(
        eq(googleMapsCapAlerts.capType, alert.capType),
        eq(googleMapsCapAlerts.periodStartUtc, periodStart)
      );

      try {
        await capAlertDelivery.send(alert);
        database
          .update(googleMapsCapAlerts)
          .set({ deliveryStatus: 'delivered', completedAt: attemptedAt.toISOString() })
          .where(alertRecord)
          .run();
      } catch {
        try {
          database
            .update(googleMapsCapAlerts)
            .set({
              deliveryStatus: 'failed',
              completedAt: attemptedAt.toISOString(),
              failureCode: 'delivery-failed'
            })
            .where(alertRecord)
            .run();
        } catch {
          // The durable claim still prevents a duplicate alert attempt.
        }

        try {
          capAlertDiagnostics({
            capType: alert.capType,
            periodStart,
            outcome: 'failed',
            failureCode: 'delivery-failed'
          });
        } catch {
          // Diagnostics must not change the protected request outcome.
        }
      }
    }
  };

  return {
    async admit(category, attribution) {
      const attemptedAt = now();
      const result = admit(category, attribution, utcPeriodsFor(attemptedAt), attemptedAt.toISOString());
      void Promise.resolve().then(() => deliverAlerts(result.alerts, attemptedAt));
      return result.admission;
    },
    async currentUsage() {
      return currentUsage();
    },
    async currentOperations(environmentKillSwitchEnabled) {
      const at = now();
      const usage = currentUsage(at);
      const [day, month] = utcPeriodsFor(at);
      const adminEnabled = readGoogleMapsAdminKillSwitch(database);
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
        capAlerts: {
          daily: capAlertOutcomeFor(database, 'daily', day.start),
          monthly: capAlertOutcomeFor(database, 'monthly', month.start)
        },
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
