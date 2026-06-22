import type { SummaryConfiguration, SummarySection } from './summaryConfiguration';

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
    .map((section) => input.sections[section]);

  const htmlSections = visibleSections
    .map((section) => {
      const body = section.status === 'available' ? section.detail : section.reason;

      return `<section style="${themeStyles[input.configuration.summaryTheme].section};padding:16px;margin:0 0 12px;border-radius:8px"><h2>${escapeHtml(section.label)}</h2><p>${escapeHtml(body)}</p></section>`;
    })
    .join('');

  const textSections = visibleSections
    .map((section) => {
      const body = section.status === 'available' ? section.detail : section.reason;

      return `${section.label}\n${body}`;
    })
    .join('\n\n');

  return {
    html: `<article style="${themeStyles[input.configuration.summaryTheme].article};font-family:Arial,sans-serif;padding:24px">${htmlSections}</article>`,
    text: textSections
  };
};

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
