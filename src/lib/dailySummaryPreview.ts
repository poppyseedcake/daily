import { buildDemoCalendarSection } from './demoCalendar';
import type { DailySummaryInput } from './dailySummaryRenderer';
import type { SummaryConfiguration } from './summaryConfiguration';
import { buildTodoSection, type TodoCategory, type TodoTask } from './todo';

export type DailySummaryPreviewSetup = {
  configuration: SummaryConfiguration;
  todoCategories: TodoCategory[];
  todoTasks: TodoTask[];
};

export const buildDailySummaryPreviewInput = ({
  configuration,
  todoCategories,
  todoTasks
}: DailySummaryPreviewSetup): DailySummaryInput => {
  const demoCalendar = buildDemoCalendarSection({ userTimeZone: configuration.userTimeZone });

  return {
    configuration,
    sections: {
      weather: {
        status: 'available',
        label: 'Mock Weather',
        detail: 'Mock provider data: 18C, clear, light wind.'
      },
      commute: {
        status: 'available',
        label: 'Mock Commute',
        detail: 'Mock provider data: 24 minutes by tram to the office.'
      },
      calendar: {
        status: 'available',
        label: demoCalendar.label,
        detail: demoCalendar.summaryDetail
      },
      todo: {
        status: 'available',
        label: 'Todo',
        detail: 'No active Todo Tasks.'
      }
    },
    todoSection: buildTodoSection(todoCategories, todoTasks)
  };
};
