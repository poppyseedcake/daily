import type { SummaryConfiguration, SummarySection } from './summaryConfiguration';
import type { CalendarSection } from './calendar';
import {
  type TodoSection,
  type TodoTask,
  type TodoUrgency
} from './todo';

export type DailySummarySectionState =
  | {
      status: 'available';
      label: string;
      detail: string;
    }
  | {
      status: 'unavailable';
      label: string;
      reason: string;
    };

export type DailySummaryInput = {
  configuration: SummaryConfiguration;
  sections: Record<SummarySection, DailySummarySectionState>;
  calendarSection?: CalendarSection | null;
  todoSection: TodoSection | null;
};

export type RenderedDailySummary = {
  html: string;
  text: string;
};

const sectionOrder: SummarySection[] = ['weather', 'commute', 'calendar', 'todo'];

const themeStyles = {
  light: {
    article: 'background-color:#ffffff;color:#1c1917',
    section: 'border:1px solid #e7e5e4;background-color:#fafaf9'
  },
  dark: {
    article: 'background-color:#111827;color:#f9fafb',
    section: 'border:1px solid #374151;background-color:#1f2937'
  }
} as const;

export const renderDailySummary = (input: DailySummaryInput): RenderedDailySummary => {
  const visibleSections = sectionOrder
    .filter((section) => input.configuration.sections[section])
    .flatMap((section) => buildVisibleSection(input, section));

  const htmlSections = visibleSections
    .map((section) => {
      return `<section style="${themeStyles[input.configuration.summaryTheme].section};padding:16px;margin:0 0 12px;border-radius:8px"><h2>${escapeHtml(section.label)}</h2>${section.html}</section>`;
    })
    .join('');

  const textSections = visibleSections
    .map((section) => `${section.label}\n${section.text}`)
    .join('\n\n');

  return {
    html: `<article style="${themeStyles[input.configuration.summaryTheme].article};font-family:Arial,sans-serif;padding:24px">${htmlSections}</article>`,
    text: textSections
  };
};

type RenderedSection = {
  label: string;
  html: string;
  text: string;
};

const buildVisibleSection = (
  input: DailySummaryInput,
  section: SummarySection
): RenderedSection[] => {
  if (section === 'todo') {
    if (input.todoSection) {
      return [renderTodoSection(input.todoSection)];
    }

    const sectionState = input.sections.todo;

    if (sectionState.status === 'unavailable') {
      return [renderUnavailableSection(sectionState.label, sectionState.reason)];
    }

    return [];
  }

  if (section === 'calendar' && input.calendarSection) {
    return [renderCalendarSection(input.calendarSection)];
  }

  const sectionState = input.sections[section];

  return sectionState.status === 'available'
    ? [renderAvailableSection(sectionState.label, sectionState.detail)]
    : [renderUnavailableSection(sectionState.label, sectionState.reason)];
};

const renderCalendarSection = (calendarSection: CalendarSection): RenderedSection => {
  const html = calendarSection.days
    .map(
      (day) =>
        `<h3>${escapeHtml(day.label)}</h3><ul>${day.events.map((event) => `<li><time>${escapeHtml(event.localStartTime)}</time> ${escapeHtml(event.title)} <span>(${escapeHtml(event.calendarLabel)})</span></li>`).join('')}</ul>`
    )
    .join('');
  const text = calendarSection.days
    .map(
      (day) =>
        `${day.label}\n${day.events.map((event) => `${event.localStartTime} ${event.title} (${event.calendarLabel})`).join('\n')}`
    )
    .join('\n\n');

  return {
    label: calendarSection.label,
    html,
    text
  };
};

const renderAvailableSection = (label: string, detail: string): RenderedSection => ({
  label,
  html: `<p>${escapeHtml(detail)}</p>`,
  text: detail
});

const renderUnavailableSection = (label: string, reason: string): RenderedSection => ({
  label,
  html: `<p>${escapeHtml(reason)}</p>`,
  text: reason
});

const renderTodoSection = (todoSection: TodoSection): RenderedSection => {
  const uncategorizedHtml =
    todoSection.uncategorizedTasks.length > 0
      ? renderTodoTaskListHtml(todoSection.uncategorizedTasks)
      : '';
  const groupedHtml = todoSection.categoryGroups
    .map(
      (group) =>
        `<h3>${escapeHtml(group.category.name)}</h3>${renderTodoTaskListHtml(group.tasks)}`
    )
    .join('');
  const uncategorizedText = todoSection.uncategorizedTasks.map(renderTodoTaskText).join('\n');
  const groupedText = todoSection.categoryGroups
    .map(
      (group) =>
        `${group.category.name}\n${group.tasks.map(renderTodoTaskText).join('\n')}`
    )
    .join('\n\n');
  const text = [uncategorizedText, groupedText].filter(Boolean).join('\n\n');

  return {
    label: todoSection.label,
    html: `${uncategorizedHtml}${groupedHtml}`,
    text
  };
};

const renderTodoTaskListHtml = (tasks: TodoTask[]) =>
  `<ul>${tasks.map((task) => `<li>${escapeHtml(task.title)}${renderUrgencyMarkHtml(task.urgency)}</li>`).join('')}</ul>`;

const renderUrgencyMarkHtml = (urgency: TodoUrgency) => {
  const mark = urgencyMark(urgency);

  if (!mark) {
    return '';
  }

  return ` <span aria-label="${urgencyLabel(urgency)}">${mark}</span>`;
};

const renderTodoTaskText = (task: TodoTask) =>
  [task.title, urgencyMark(task.urgency)].filter(Boolean).join(' ');

const urgencyLabel = (urgency: TodoUrgency) =>
  urgency === 'high' ? 'High urgency' : urgency === 'medium' ? 'Medium urgency' : 'Low urgency';

const urgencyMark = (urgency: TodoUrgency) =>
  urgency === 'high' ? '!' : urgency === 'medium' ? '!' : '';

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
