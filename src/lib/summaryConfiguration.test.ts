import { describe, expect, test } from 'vitest';
import {
  canPreviewDailySummary,
  defaultSummaryConfiguration,
  summaryConfigurationSchema
} from './summaryConfiguration';

describe('summary configuration validation', () => {
  test('keeps Daily Summary preview available independently of Summary Delivery', () => {
    expect(canPreviewDailySummary(defaultSummaryConfiguration)).toBe(true);
    expect(
      canPreviewDailySummary({
        ...defaultSummaryConfiguration,
        summaryDeliveryEnabled: false
      })
    ).toBe(true);
  });

  test('defaults User Time Zone to the database persistence contract', () => {
    expect(defaultSummaryConfiguration.userTimeZone).toBe('UTC');
  });

  test('defaults every Summary Section pause setting to not paused', () => {
    expect(defaultSummaryConfiguration.sectionPauses).toEqual({
      weather: false,
      commute: false,
      calendar: false,
      todo: false
    });
  });

  test('adds pause defaults when none are provided', () => {
    const { sectionPauses, ...legacyConfiguration } = defaultSummaryConfiguration;

    expect(summaryConfigurationSchema.parse(legacyConfiguration)).toEqual(defaultSummaryConfiguration);
    expect(sectionPauses).toEqual({
      weather: false,
      commute: false,
      calendar: false,
      todo: false
    });
  });

  test('accepts editable Summary Configuration controls', () => {
    const configuration = summaryConfigurationSchema.parse({
      summaryTime: '18:45',
      userTimeZone: 'America/New_York',
      summaryDeliveryEnabled: false,
      sectionPauses: {
        weather: true,
        commute: false,
        calendar: true,
        todo: false
      }
    });

    expect(configuration.summaryTime).toBe('18:45');
    expect(configuration.userTimeZone).toBe('America/New_York');
    expect(configuration.sectionPauses.weather).toBe(true);
  });

  test('accepts any valid IANA time zone and rejects unknown zones', () => {
    expect(
      summaryConfigurationSchema.safeParse({
        ...defaultSummaryConfiguration,
        userTimeZone: 'Asia/Tokyo'
      }).success
    ).toBe(true);
    expect(
      summaryConfigurationSchema.safeParse({
        ...defaultSummaryConfiguration,
        userTimeZone: 'Not/A_Time_Zone'
      }).success
    ).toBe(false);
  });

  test('rejects invalid user-facing Summary Configuration mutations', () => {
    const result = summaryConfigurationSchema.safeParse({
      summaryTime: 'morning',
      userTimeZone: '',
      summaryDeliveryEnabled: true,
      sectionPauses: {
        weather: 'sometimes',
        commute: false,
        calendar: false,
        todo: false
      }
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const errorPaths = result.error.issues.map((issue) => issue.path.join('.'));

      expect(errorPaths).toContain('summaryTime');
      expect(errorPaths).toContain('userTimeZone');
      expect(errorPaths).toContain('sectionPauses.weather');
    }
  });

  test('rejects removed Summary Theme and section-enabled settings', () => {
    const legacy = {
      ...defaultSummaryConfiguration,
      summaryTheme: 'light',
      sections: { weather: true, commute: true, calendar: true, todo: true }
    };

    expect(summaryConfigurationSchema.safeParse(legacy).success).toBe(false);
  });
});
