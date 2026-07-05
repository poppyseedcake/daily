import { describe, expect, test } from 'vitest';
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
  test('renders Visitor and User setup through the same Daily Summary input shape', () => {
    const visitorPreview = buildDailySummaryPreviewInput({
      configuration,
      todoCategories,
      todoTasks
    });
    const userPreview = buildDailySummaryPreviewInput({
      configuration,
      todoCategories,
      todoTasks
    });

    expect(renderDailySummary(visitorPreview).text).toBe(renderDailySummary(userPreview).text);
    expect(renderDailySummary(userPreview).text).toContain('Mock Weather');
    expect(renderDailySummary(userPreview).text).toContain('Mock Commute');
    expect(renderDailySummary(userPreview).text).toContain('Demo Calendar');
    expect(renderDailySummary(userPreview).text).toContain('Buy coffee !');
    expect(renderDailySummary(userPreview).text).toContain('Work\nDraft update !');
  });

  test('keeps provider placeholders out of the persisted User setup shape', () => {
    const preview = buildDailySummaryPreviewInput({
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

    expect(preview.sections.weather).toMatchObject({ label: 'Mock Weather' });
    expect(preview.sections.commute).toMatchObject({ label: 'Mock Commute' });
    expect(preview.sections.calendar).toMatchObject({ label: 'Demo Calendar' });
    expect(persistedUserSetup).not.toHaveProperty('weather');
    expect(persistedUserSetup).not.toHaveProperty('commute');
    expect(persistedUserSetup).not.toHaveProperty('calendar');
    expect(persistedUserSetup).not.toHaveProperty('sections');
  });

  test('omits empty Todo content instead of rendering it as unavailable in preview', () => {
    const preview = buildDailySummaryPreviewInput({
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
