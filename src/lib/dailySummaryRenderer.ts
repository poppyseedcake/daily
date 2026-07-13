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
  commuteSection?: CommuteSection | null;
  todoSection: TodoSection | null;
};

export type CommuteSection = {
  label: 'Commute';
  estimates: Array<
    { routeName: string; outcome: 'available'; durationMinutes: number }
    | { routeName: string; outcome: 'unavailable' }
  >;
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
  if (section === 'commute' && input.commuteSection !== undefined) {
    if (input.commuteSection) {
      return [renderCommuteSection(input.commuteSection)];
    }

    const sectionState = input.sections.commute;
    return sectionState.status === 'unavailable'
      ? [renderUnavailableSection(sectionState.label, sectionState.reason)]
      : [];
  }

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

  if (section === 'calendar' && input.calendarSection && hasCalendarEvents(input.calendarSection)) {
    return [renderCalendarSection(input.calendarSection)];
  }

  const sectionState = input.sections[section];

  return sectionState.status === 'available'
    ? [renderAvailableSection(sectionState.label, sectionState.detail)]
    : [renderUnavailableSection(sectionState.label, sectionState.reason)];
};

const renderCommuteSection = (section: CommuteSection): RenderedSection => ({
  label: section.label,
  html: `<ul>${section.estimates.map((estimate) => `<li>${escapeHtml(estimate.routeName)}: ${estimate.outcome === 'available' ? `${estimate.durationMinutes} minutes` : 'unavailable'}</li>`).join('')}</ul>`,
  text: section.estimates
    .map((estimate) => `${estimate.routeName}: ${estimate.outcome === 'available' ? `${estimate.durationMinutes} minutes` : 'unavailable'}`)
    .join('\n')
});

const hasCalendarEvents = (calendarSection: CalendarSection) =>
  Boolean(calendarSection.today) || calendarSection.weekAhead.length > 0;

const renderCalendarSection = (calendarSection: CalendarSection): RenderedSection => {
  const today = calendarSection.today ? renderCalendarDay(calendarSection.today) : null;
  const weekAhead = calendarSection.weekAhead.map(renderCalendarDay);
  const html = [
    today?.html,
    weekAhead.length > 0
      ? `<h3>Week Ahead</h3>${weekAhead.map((day) => day.html).join('')}`
      : null
  ]
    .filter(Boolean)
    .join('');
  const text = [
    today?.text,
    weekAhead.length > 0 ? `Week Ahead\n${weekAhead.map((day) => day.text).join('\n\n')}` : null
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    label: calendarSection.label,
    html,
    text
  };
};

const renderCalendarDay = (day: CalendarSection['weekAhead'][number]) => {
  const htmlEvents = [
    ...day.allDayEvents.map(
      (event) =>
        `<li>All day ${escapeHtml(event.title)} <span>(${escapeHtml(event.calendarLabel)})</span></li>`
    ),
    ...day.timedEvents.map(
      (event) =>
        `<li><time>${escapeHtml(event.localStartTime)}</time> ${escapeHtml(event.title)} <span>(${escapeHtml(event.calendarLabel)})</span></li>`
    )
  ];
  const textEvents = [
    ...day.allDayEvents.map((event) => `All day ${event.title} (${event.calendarLabel})`),
    ...day.timedEvents.map(
      (event) => `${event.localStartTime} ${event.title} (${event.calendarLabel})`
    )
  ];

  return {
    html: `<h4>${escapeHtml(day.label)}</h4><ul>${htmlEvents.join('')}</ul>`,
    text: `${day.label}\n${textEvents.join('\n')}`
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
