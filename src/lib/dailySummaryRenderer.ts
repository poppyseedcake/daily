import type { SummaryConfiguration, SummarySection } from './summaryConfiguration';
import type { TodoCategory, TodoTask, TodoUrgency } from './todo';

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
  todoCategories?: TodoCategory[];
  todoTasks?: TodoTask[];
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
  if (section === 'todo' && input.todoTasks) {
    const todoSection = buildTodoSection(input.todoCategories ?? [], input.todoTasks);
    return todoSection ? [todoSection] : [];
  }

  const sectionState = input.sections[section];
  const body = sectionState.status === 'available' ? sectionState.detail : sectionState.reason;

  return [
    {
      label: sectionState.label,
      html: `<p>${escapeHtml(body)}</p>`,
      text: body
    }
  ];
};

const buildTodoSection = (
  categories: TodoCategory[],
  tasks: TodoTask[]
): RenderedSection | null => {
  if (tasks.length === 0) {
    return null;
  }

  const knownCategoryIds = new Set(categories.map((category) => category.id));
  const uncategorizedTasks = tasks
    .filter((task) => task.categoryId === null || !knownCategoryIds.has(task.categoryId))
    .toSorted((first, second) => first.position - second.position);
  const categoryGroups = categories
    .map((category) => ({
      category,
      tasks: tasksForCategory(tasks, category.id)
    }))
    .filter((group) => group.tasks.length > 0);

  const uncategorizedHtml =
    uncategorizedTasks.length > 0 ? renderTodoTaskListHtml(uncategorizedTasks) : '';
  const groupedHtml = categoryGroups
    .map(
      (group) =>
        `<h3>${escapeHtml(group.category.name)}</h3>${renderTodoTaskListHtml(group.tasks)}`
    )
    .join('');
  const uncategorizedText = uncategorizedTasks.map(renderTodoTaskText).join('\n');
  const groupedText = categoryGroups
    .map(
      (group) =>
        `${group.category.name}\n${group.tasks.map(renderTodoTaskText).join('\n')}`
    )
    .join('\n\n');
  const text = [uncategorizedText, groupedText].filter(Boolean).join('\n\n');

  return {
    label: 'Todo Tasks',
    html: `${uncategorizedHtml}${groupedHtml}`,
    text
  };
};

const tasksForCategory = (tasks: TodoTask[], categoryId: string | null) =>
  tasks
    .filter((task) => task.categoryId === categoryId)
    .toSorted((first, second) => first.position - second.position);

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
