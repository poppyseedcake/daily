import { describe, expect, test } from 'vitest';
import { defaultSummaryConfiguration, summaryConfigurationSchema } from './summaryConfiguration';

describe('summary configuration validation', () => {
  test('defaults User Time Zone to the database persistence contract', () => {
    expect(defaultSummaryConfiguration.userTimeZone).toBe('UTC');
  });

  test('accepts editable Summary Configuration controls', () => {
    const configuration = summaryConfigurationSchema.parse({
      summaryTime: '18:45',
      userTimeZone: 'America/New_York',
      summaryTheme: 'dark',
      summaryDeliveryEnabled: false,
      sections: {
        weather: false,
        commute: true,
        calendar: true,
        todo: false
      }
    });

    expect(configuration.summaryTime).toBe('18:45');
    expect(configuration.userTimeZone).toBe('America/New_York');
    expect(configuration.sections.weather).toBe(false);
    expect(configuration.sections.todo).toBe(false);
  });

  test('rejects invalid user-facing Summary Configuration mutations', () => {
    const result = summaryConfigurationSchema.safeParse({
      summaryTime: 'morning',
      userTimeZone: '',
      summaryTheme: 'sepia',
      summaryDeliveryEnabled: true,
      sections: {
        weather: true,
        commute: true,
        calendar: true,
        todo: true
      }
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const errorPaths = result.error.issues.map((issue) => issue.path.join('.'));

      expect(errorPaths).toContain('summaryTime');
      expect(errorPaths).toContain('userTimeZone');
      expect(errorPaths).toContain('summaryTheme');
    }
  });
});
