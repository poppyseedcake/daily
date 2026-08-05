import { describe, expect, test } from 'vitest';
import {
  dailySummaryAppearanceSchema,
  resolveSummarySectionPresentationState,
  summarySectionPresentationSchema,
  type UnpausedSummarySectionPresentationStateFor
} from './summarySectionPresentation';

describe('Summary Section presentation contract', () => {
  test('accepts only states supported by each Summary Section', () => {
    expect(
      summarySectionPresentationSchema.parse({
        weather: 'unconfigured',
        commute: 'empty',
        calendar: 'active',
        todo: 'paused'
      })
    ).toEqual({
      weather: 'unconfigured',
      commute: 'empty',
      calendar: 'active',
      todo: 'paused'
    });
  });

  test.each([
    ['weather', 'empty'],
    ['todo', 'unconfigured']
  ] as const)('rejects %s as %s', (section, state) => {
    const result = summarySectionPresentationSchema.safeParse({
      weather: 'active',
      commute: 'active',
      calendar: 'active',
      todo: 'active',
      [section]: state
    });

    expect(result.success).toBe(false);
  });

  test('keeps Paused distinct and gives the explicit pause choice precedence', () => {
    expect(resolveSummarySectionPresentationState('weather', true, 'unconfigured')).toBe('paused');
    expect(resolveSummarySectionPresentationState('todo', true, 'empty')).toBe('paused');
    expect(resolveSummarySectionPresentationState('calendar', false, 'empty')).toBe('empty');
    expect(() =>
      resolveSummarySectionPresentationState(
        'weather',
        false,
        'paused' as unknown as UnpausedSummarySectionPresentationStateFor<'weather'>
      )
    ).toThrow('Paused Summary Section state requires an explicit pause choice.');
  });

  test('preserves section-specific state types in the resolver', () => {
    resolveSummarySectionPresentationState('weather', false, 'unconfigured');
    resolveSummarySectionPresentationState('todo', false, 'empty');

    if (false) {
      // @ts-expect-error Weather does not support the empty state.
      resolveSummarySectionPresentationState('weather', false, 'empty');
      // @ts-expect-error Todo does not support the unconfigured state.
      resolveSummarySectionPresentationState('todo', false, 'unconfigured');
    }
  });

  test('pins the product to one Daily Summary Appearance', () => {
    expect(dailySummaryAppearanceSchema.parse('daily-grid')).toBe('daily-grid');
    expect(dailySummaryAppearanceSchema.safeParse('dark').success).toBe(false);
  });
});
