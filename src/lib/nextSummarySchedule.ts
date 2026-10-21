import { Temporal } from '@js-temporal/polyfill';
import { summaryDayValues, type SummaryConfiguration } from './summaryConfiguration';

export const isSummaryScheduleEligible = (configuration: SummaryConfiguration) =>
  configuration.summaryDeliveryEnabled;

export const calculateNextSummaryAt = (
  configuration: SummaryConfiguration,
  referenceInstant: Temporal.Instant
): Temporal.Instant | null => {
  if (!isSummaryScheduleEligible(configuration)) {
    return null;
  }

  const localReference = referenceInstant.toZonedDateTimeISO(configuration.userTimeZone);
  let localDate = localReference.toPlainDate();

  const occurrenceOn = (date: Temporal.PlainDate) => {
    const day = summaryDayValues[date.dayOfWeek - 1];
    const summaryTime = Temporal.PlainTime.from(
      configuration.summaryTimesByDay?.[day] ?? configuration.summaryTime
    );
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
