import { describe, expect, test, vi } from 'vitest';
import { buildDailySummaryPreviewInput } from './dailySummaryPreview';
import { renderDailySummary } from './dailySummaryRenderer';
import type { SummaryConfiguration } from './summaryConfiguration';
import type { TodoCategory, TodoTask } from './todo';

const configuration: SummaryConfiguration = {
  summaryTime: '18:45',
  userTimeZone: 'America/New_York',
  summaryTheme: 'light',
  summaryDeliveryEnabled: true,
  sections: {
    weather: true,
    commute: true,
    calendar: true,
    todo: true
  }
};

const todoCategories: TodoCategory[] = [{ id: 'category-work', name: 'Work', position: 1 }];
const todoTasks: TodoTask[] = [
  {
    id: 'todo-buy-coffee',
    title: 'Buy coffee',
    categoryId: null,
    urgency: 'medium',
    position: 1,
    completed: false
  },
  {
    id: 'todo-draft-update',
    title: 'Draft update',
    categoryId: 'category-work',
    urgency: 'high',
    position: 1,
    completed: false
  }
];

describe('Daily Summary preview input', () => {
  test('renders Visitor and User setup through the same Daily Summary input shape', async () => {
    const visitorPreview = await buildDailySummaryPreviewInput({
      configuration,
      todoCategories,
      todoTasks
    });
    const userPreview = await buildDailySummaryPreviewInput({
      configuration,
      todoCategories,
      todoTasks
    });

    expect(renderDailySummary(visitorPreview).text).toBe(renderDailySummary(userPreview).text);
    expect(renderDailySummary(userPreview).text).toContain('Choose a Weather Location to preview live weather.');
    expect(renderDailySummary(userPreview).text).toContain('Mock Commute');
    expect(renderDailySummary(userPreview).text).toContain('Demo Calendar');
    expect(renderDailySummary(userPreview).text).toContain('Buy coffee !');
    expect(renderDailySummary(userPreview).text).toContain('Work\nDraft update !');
  });

  test('renders live Weather from Weather Location coordinates in HTML and plain text', async () => {
    const forecastProvider = {
      fetchDailyForecast: vi.fn().mockResolvedValue({
        outcome: 'available',
        forecast: {
          dates: ['2026-07-07'],
          weatherCodes: [61],
          minimumTemperaturesCelsius: [12],
          maximumTemperaturesCelsius: [19],
          precipitationProbabilities: [80]
        }
      })
    };

    const preview = await buildDailySummaryPreviewInput({
      configuration,
      todoCategories,
      todoTasks,
      weatherLocation: {
        label: 'Warsaw, Masovian Voivodeship, Poland',
        latitude: 52.2297,
        longitude: 21.0122
      },
      weatherProvider: forecastProvider,
      now: new Date('2026-07-07T10:00:00.000Z')
    });
    const rendered = renderDailySummary(preview);

    expect(forecastProvider.fetchDailyForecast).toHaveBeenCalledWith({
      latitude: 52.2297,
      longitude: 21.0122,
      timeZone: 'America/New_York'
    });
    expect(rendered.text).toContain('Weather\nRainy. Low 12C, high 19C. Chance of precipitation 80%.');
    expect(rendered.html).toContain('Rainy. Low 12C, high 19C. Chance of precipitation 80%.');
    expect(rendered.text).not.toContain('Mock Weather');
  });

  test('omits disabled Weather and avoids live Weather provider work', async () => {
    const forecastProvider = {
      fetchDailyForecast: vi.fn().mockResolvedValue({
        outcome: 'available',
        forecast: {
          dates: ['2026-07-07'],
          weatherCodes: [61],
          minimumTemperaturesCelsius: [12],
          maximumTemperaturesCelsius: [19],
          precipitationProbabilities: [80]
        }
      })
    };

    const preview = await buildDailySummaryPreviewInput({
      configuration: {
        ...configuration,
        sections: {
          ...configuration.sections,
          weather: false
        }
      },
      todoCategories,
      todoTasks,
      weatherLocation: {
        label: 'Warsaw, Masovian Voivodeship, Poland',
        latitude: 52.2297,
        longitude: 21.0122
      },
      weatherProvider: forecastProvider,
      now: new Date('2026-07-07T10:00:00.000Z')
    });
    const rendered = renderDailySummary(preview);

    expect(forecastProvider.fetchDailyForecast).not.toHaveBeenCalled();
    expect(rendered.text).not.toContain('Weather');
    expect(rendered.html).not.toContain('Weather');
  });

  test('renders unavailable Weather from provider failure while keeping other sections visible', async () => {
    const forecastProvider = {
      fetchDailyForecast: vi.fn().mockResolvedValue({
        outcome: 'unavailable',
        reason: 'Live weather is unavailable right now.'
      })
    };

    const preview = await buildDailySummaryPreviewInput({
      configuration,
      todoCategories,
      todoTasks,
      weatherLocation: {
        label: 'Warsaw, Masovian Voivodeship, Poland',
        latitude: 52.2297,
        longitude: 21.0122
      },
      weatherProvider: forecastProvider,
      now: new Date('2026-07-07T10:00:00.000Z')
    });
    const rendered = renderDailySummary(preview);

    expect(rendered.text).toContain('Weather\nLive weather is unavailable right now.');
    expect(rendered.text).toContain('Mock Commute');
    expect(rendered.text).toContain('Demo Calendar');
    expect(rendered.text).toContain('Buy coffee !');
  });

  test('keeps provider placeholders out of the persisted User setup shape', async () => {
    const preview = await buildDailySummaryPreviewInput({
      configuration,
      todoCategories,
      todoTasks
    });

    const persistedUserSetup = {
      summaryConfiguration: configuration,
      todoCategories,
      todoTasks,
      nextTodoId: 3
    };

    expect(preview.sections.commute).toMatchObject({ label: 'Mock Commute' });
    expect(preview.sections.calendar).toMatchObject({ label: 'Demo Calendar' });
    expect(persistedUserSetup).not.toHaveProperty('weather');
    expect(persistedUserSetup).not.toHaveProperty('commute');
    expect(persistedUserSetup).not.toHaveProperty('calendar');
    expect(persistedUserSetup).not.toHaveProperty('sections');
  });

  test('omits empty Todo content instead of rendering it as unavailable in preview', async () => {
    const preview = await buildDailySummaryPreviewInput({
      configuration: {
        ...configuration,
        sections: {
          weather: false,
          commute: false,
          calendar: false,
          todo: true
        }
      },
      todoCategories,
      todoTasks: []
    });

    const rendered = renderDailySummary(preview);

    expect(rendered.html).not.toContain('Todo');
    expect(rendered.text).not.toContain('Todo');
    expect(rendered.text).not.toContain('No active Todo Tasks.');
  });
});
