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

  const occurrenceOn = (date: Temporal.PlainDate) => {
    const requestedLocalTime = date.toPlainDateTime(summaryTime);
    const compatibleOccurrence = requestedLocalTime.toZonedDateTime(configuration.userTimeZone, {
      disambiguation: 'compatible'
    });

    if (!compatibleOccurrence.toPlainDateTime().equals(requestedLocalTime)) {
      const transition = compatibleOccurrence.getTimeZoneTransition('previous');

      if (
        transition &&
        Temporal.PlainDateTime.compare(transition.toPlainDateTime(), requestedLocalTime) > 0
      ) {
        return transition.toInstant();
      }
    }

    return compatibleOccurrence.toInstant();
  };

  let candidate = occurrenceOn(localDate);

  if (Temporal.Instant.compare(candidate, referenceInstant) <= 0) {
    localDate = localDate.add({ days: 1 });
    candidate = occurrenceOn(localDate);
  }

  return candidate;
};
