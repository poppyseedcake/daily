import { Temporal } from '@js-temporal/polyfill';
import { describe, expect, test } from 'vitest';
import { calculateNextSummaryAt } from './nextSummarySchedule';
import { defaultSummaryConfiguration } from './summaryConfiguration';

const eligibleConfiguration = (overrides: Partial<typeof defaultSummaryConfiguration> = {}) => ({
  ...defaultSummaryConfiguration,
  ...overrides
});

const nextAt = (reference: string, summaryTime: string, userTimeZone: 'Europe/Warsaw' | 'America/New_York' | 'UTC') =>
  calculateNextSummaryAt(
    eligibleConfiguration({ summaryTime, userTimeZone }),
    Temporal.Instant.from(reference)
  )?.toString();

describe('next Daily Summary schedule', () => {
  test('uses each local weekday time, including when tomorrow is earlier than today', () => {
    const configuration = {
      ...defaultSummaryConfiguration,
      userTimeZone: 'Europe/Warsaw',
      summaryTimesByDay: {
        monday: '09:00', tuesday: '06:00', wednesday: '07:00', thursday: '07:00',
        friday: '07:00', saturday: '10:00', sunday: '10:00'
      }
    };

    expect(calculateNextSummaryAt(configuration, Temporal.Instant.from('2026-06-22T05:00:00Z'))?.toString())
      .toBe('2026-06-22T07:00:00Z');
    expect(calculateNextSummaryAt(configuration, Temporal.Instant.from('2026-06-22T07:00:00Z'))?.toString())
      .toBe('2026-06-23T04:00:00Z');
  });

  test.each([
    ['2026-06-22T01:00:00Z', '22:00', '2026-06-22T02:00:00Z'],
    ['2026-03-08T06:00:00Z', '02:30', '2026-03-08T07:00:00Z'],
    ['2026-03-08T07:00:00Z', '02:30', '2026-03-09T10:00:00Z'],
    ['2026-11-01T04:00:00Z', '01:30', '2026-11-01T05:30:00Z'],
    ['2026-11-01T05:30:00Z', '01:30', '2026-11-02T11:00:00Z']
  ])('resolves weekday times across local dates and DST at %s', (reference, sunday, expected) => {
    const configuration = {
      ...defaultSummaryConfiguration,
      userTimeZone: 'America/New_York',
      summaryTimesByDay: {
        monday: '06:00', tuesday: '07:00', wednesday: '07:00', thursday: '07:00',
        friday: '07:00', saturday: '10:00', sunday
      }
    };
    expect(calculateNextSummaryAt(configuration, Temporal.Instant.from(reference))?.toString()).toBe(expected);
  });

  test('schedules the local Summary Time strictly after the reference instant', () => {
    expect(nextAt('2026-06-22T04:59:59Z', '07:00', 'Europe/Warsaw')).toBe(
      '2026-06-22T05:00:00Z'
    );
    expect(nextAt('2026-06-22T05:00:00Z', '07:00', 'Europe/Warsaw')).toBe(
      '2026-06-23T05:00:00Z'
    );
    expect(nextAt('2026-06-22T05:00:01Z', '07:00', 'Europe/Warsaw')).toBe(
      '2026-06-23T05:00:00Z'
    );
  });

  test('uses the User local date even when it differs from the UTC date', () => {
    expect(nextAt('2026-06-22T01:00:00Z', '22:00', 'America/New_York')).toBe(
      '2026-06-22T02:00:00Z'
    );
  });

  test('moves a spring-forward Summary Time forward and returns to it the following day', () => {
    expect(nextAt('2026-03-08T06:00:00Z', '02:30', 'America/New_York')).toBe(
      '2026-03-08T07:00:00Z'
    );
    expect(nextAt('2026-03-08T07:00:00Z', '02:30', 'America/New_York')).toBe(
      '2026-03-09T06:30:00Z'
    );
  });

  test('uses the earlier fall-back occurrence once, then schedules the following day', () => {
    expect(nextAt('2026-11-01T04:00:00Z', '01:30', 'America/New_York')).toBe(
      '2026-11-01T05:30:00Z'
    );
    expect(nextAt('2026-11-01T05:30:00Z', '01:30', 'America/New_York')).toBe(
      '2026-11-02T06:30:00Z'
    );
  });

  test('uses Summary Delivery as the only schedule eligibility control', () => {
    const reference = Temporal.Instant.from('2026-06-22T00:00:00Z');

    expect(
      calculateNextSummaryAt(
        eligibleConfiguration({ summaryDeliveryEnabled: false }),
        reference
      )
    ).toBeNull();
    expect(
      calculateNextSummaryAt(
        eligibleConfiguration({
          sectionPauses: { weather: true, commute: true, calendar: true, todo: true }
        }),
        reference
      )?.toString()
    ).toBe('2026-06-22T07:00:00Z');
  });

  test('leaves Users with disabled Summary Delivery unscheduled', () => {
    const reference = Temporal.Instant.from('2026-06-22T00:00:00Z');

    expect(
      calculateNextSummaryAt(
        eligibleConfiguration({ summaryDeliveryEnabled: false }),
        reference
      )
    ).toBeNull();
  });
});
