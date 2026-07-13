import { Temporal } from '@js-temporal/polyfill';
import type { SummaryConfiguration } from './summaryConfiguration';

export const isSummaryScheduleEligible = (configuration: SummaryConfiguration) =>
  configuration.summaryDeliveryEnabled && Object.values(configuration.sections).some(Boolean);

export const calculateNextSummaryAt = (
  configuration: SummaryConfiguration,
  referenceInstant: Temporal.Instant
): Temporal.Instant | null => {
  if (!isSummaryScheduleEligible(configuration)) {
    return null;
  }

  const summaryTime = Temporal.PlainTime.from(configuration.summaryTime);
  const localReference = referenceInstant.toZonedDateTimeISO(configuration.userTimeZone);
  let localDate = localReference.toPlainDate();

  const occurrenceOn = (date: Temporal.PlainDate) =>
    date
      .toPlainDateTime(summaryTime)
      .toZonedDateTime(configuration.userTimeZone, { disambiguation: 'compatible' })
      .toInstant();

  let candidate = occurrenceOn(localDate);

  if (Temporal.Instant.compare(candidate, referenceInstant) <= 0) {
    localDate = localDate.add({ days: 1 });
    candidate = occurrenceOn(localDate);
  }

  return candidate;
};
