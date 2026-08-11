import { calendarSectionHasEvents, type CalendarSection } from './calendar';
import {
  commuteTrafficDescription,
  type CommuteTrafficLevel
} from './commuteTraffic';
import type { SummarySection, UserTimeZone } from './summaryConfiguration';
import type { WeatherDisplayForecast } from './weatherForecast';
import type {
  SummarySectionPresentationState,
  SummarySectionPresentationStateFor
} from './summarySectionPresentation';
import type { TodoSection, TodoTask, TodoUrgency } from './todo';

export const dailySummarySectionOrder = ['weather', 'commute', 'calendar', 'todo'] as const;

type ActiveContentSummarySection<Content> = {
  status: 'active';
  content: Content;
  detail?: string;
};

type ActiveTextSummarySection<Content> =
  | ActiveContentSummarySection<Content>
  | { status: 'active'; content?: never; detail: string };

type InactiveSummarySection<Status extends SummarySectionPresentationState> =
  Status extends 'unavailable'
    ? { status: Status; reason: string }
    : { status: Status; detail: string };

type InactiveSummarySectionFor<Section extends SummarySection> = {
  [Status in Exclude<SummarySectionPresentationStateFor<Section>, 'active'>]:
    InactiveSummarySection<Status>;
}[Exclude<SummarySectionPresentationStateFor<Section>, 'active'>];

type DailySummarySectionInput<Section extends SummarySection, Content> =
  | ActiveContentSummarySection<Content>
  | InactiveSummarySectionFor<Section>;

type CalendarSummarySectionInput =
  | ActiveTextSummarySection<CalendarSection>
  | { status: 'empty'; detail: string; content?: CalendarSection }
  | InactiveSummarySection<Exclude<
      SummarySectionPresentationStateFor<'calendar'>,
      'active' | 'empty'
    >>;

export type DailySummaryInput = {
  userTimeZone: UserTimeZone;
  generatedAt: Date;
  openDailyUrl: string;
  sections: {
    weather: ActiveTextSummarySection<WeatherDisplayForecast> | InactiveSummarySectionFor<'weather'>;
    commute: DailySummarySectionInput<'commute', CommuteSection>;
    calendar: CalendarSummarySectionInput;
    todo: DailySummarySectionInput<'todo', TodoSection>;
  };
};

export type { CommuteTrafficLevel } from './commuteTraffic';

export type CommuteSection = {
  label: 'Commute';
  estimates: Array<{
    routeName: string;
    originLabel?: string;
    destinationLabel?: string;
    outcome: 'available' | 'unavailable';
    durationMinutes?: number;
    trafficLevel?: CommuteTrafficLevel;
    trafficDescription?: string;
  }>;
};

export type RenderedDailySummary = {
  html: string;
  text: string;
};

export type DailySummaryDeliveryKind = 'scheduled' | 'test';

export const dailySummarySubject = (
  kind: DailySummaryDeliveryKind,
  generatedAt: Date,
  userTimeZone: string
) => {
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: userTimeZone
  }).format(generatedAt);
  const dayAndMonth = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: userTimeZone
  }).format(generatedAt);

  return `${kind === 'test' ? 'Test · ' : ''}Your Daily Summary · ${weekday}, ${dayAndMonth}`;
};

type SummarySectionContent = {
  weather: WeatherDisplayForecast;
  commute: CommuteSection;
  calendar: CalendarSection;
  todo: TodoSection;
};

type RenderedSectionFor<Section extends SummarySection> = {
  key: Section;
  label: string;
  content?: SummarySectionContent[Section];
} & (
  | { status: 'active'; detail?: string }
  | {
      status: Exclude<SummarySectionPresentationState, 'active'>;
      message: string;
    }
);

type RenderedSection = {
  [Section in SummarySection]: RenderedSectionFor<Section>;
}[SummarySection];

const fixedSectionLabels: Record<SummarySection, string> = {
  weather: 'Weather',
  commute: 'Commute',
  calendar: 'Calendar',
  todo: 'Todo'
};

const sectionAccentColors: Record<SummarySection, string> = {
  weather: '#4d733e',
  commute: '#3568ad',
  calendar: '#70519a',
  todo: '#4d733e'
};

const commuteTrafficColors: Record<CommuteTrafficLevel, string> = {
  light: '#4d7a53',
  moderate: '#c18b24',
  heavy: '#b24b3f'
};

const stateLabels = {
  paused: 'Paused',
  unconfigured: 'Not configured',
  empty: 'Nothing scheduled',
  unavailable: 'Unavailable'
} as const;

export const renderDailySummary = (input: DailySummaryInput): RenderedDailySummary => {
  const sections = dailySummarySectionOrder.map((key) => resolveSection(input, key));
  const generatedAt = input.generatedAt;
  const generatedTimestamp = formatGeneratedTimestamp(generatedAt, input.userTimeZone);
  const openDailyUrl = canonicalOpenDailyUrl(input.openDailyUrl);

  return {
    html: renderHtml({
      sections,
      generatedAt,
      generatedTimestamp,
      userTimeZone: input.userTimeZone,
      openDailyUrl
    }),
    text: renderText({
      sections,
      generatedTimestamp,
      userTimeZone: input.userTimeZone,
      openDailyUrl
    })
  };
};

const resolveSection = (input: DailySummaryInput, key: SummarySection): RenderedSection => {
  const state = input.sections[key];
  const label = fixedSectionLabels[key];
  const content = 'content' in state ? state.content : undefined;
  const renderedContent = {
    key,
    label,
    ...(content ? { content } : {})
  };

  if (state.status === 'active') {
    return {
      ...renderedContent,
      status: 'active',
      ...('detail' in state ? { detail: state.detail } : {})
    } as RenderedSection;
  }

  return {
    ...renderedContent,
    status: state.status,
    message: state.status === 'unavailable' ? state.reason : state.detail
  } as RenderedSection;
};

const renderHtml = ({
  sections,
  generatedAt,
  generatedTimestamp,
  userTimeZone,
  openDailyUrl
}: {
  sections: RenderedSection[];
  generatedAt: Date;
  generatedTimestamp: string;
  userTimeZone: string;
  openDailyUrl: string;
}) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @media only screen and (max-width: 620px) {
        .daily-grid-cell { display: block !important; width: 100% !important; }
        .daily-grid-cell-inner { min-height: 0 !important; }
        .daily-summary-shell { width: 100% !important; }
      }
      .daily-screen-reader-only {
        position: absolute !important;
        width: 1px !important;
        height: 1px !important;
        padding: 0 !important;
        margin: -1px !important;
        overflow: hidden !important;
        clip: rect(0, 0, 0, 0) !important;
        white-space: nowrap !important;
        border: 0 !important;
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#f7f8f5;color:#172019;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background-color:#f7f8f5;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table class="daily-summary-shell" role="presentation" width="680" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:680px;border-collapse:collapse;background-color:#ffffff;border:1px solid #d9ded8;">
            <tr>
              <td style="padding:34px 34px 27px;border-bottom:1px solid #d9ded8;background-color:#ffffff;">
                <p style="margin:0 0 14px;color:#172019;font-size:30px;line-height:1.1;font-weight:700;letter-spacing:-0.03em;">Good morning</p>
                <p style="margin:0;color:#68756a;font-size:14px;line-height:1.5;">Generated: <time datetime="${escapeHtml(generatedAt.toISOString())}">${escapeHtml(generatedTimestamp)}</time></p>
              </td>
            </tr>
            <tr>
              <td style="padding:0;background-color:#d9ded8;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="1" border="0" style="width:100%;border-collapse:separate;background-color:#d9ded8;">
                  <tr>
                    ${renderSectionCell(sections[0]!)}
                    ${renderSectionCell(sections[1]!)}
                  </tr>
                  <tr>
                    ${renderSectionCell(sections[2]!)}
                    ${renderSectionCell(sections[3]!)}
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 34px 25px;border-top:1px solid #d9ded8;background-color:#ffffff;color:#68756a;font-size:13px;line-height:1.5;">
                <p style="margin:0 0 10px;">Daily · ${escapeHtml(userTimeZone)}</p>
                <p style="margin:0;"><a href="${escapeHtml(openDailyUrl)}" style="color:#356b38;text-decoration:underline;">Open Daily</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const renderSectionCell = (section: RenderedSection) => {
  const accentColor = sectionAccentColors[section.key];
  const content = renderSectionHtmlContent(section);

  return `<td class="daily-grid-cell" width="50%" valign="top" data-summary-section="${section.key}" style="width:50%;padding:0;background-color:#ffffff;">
      <div class="daily-grid-cell-inner" role="region" aria-labelledby="daily-${section.key}-heading" style="min-height:250px;padding:25px 24px 24px;background-color:#ffffff;overflow-wrap:anywhere;word-break:break-word;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
          <tr>
            <td aria-hidden="true" valign="top" style="padding:0 10px 0 0;color:${accentColor};font-size:18px;line-height:1;">${sectionGlyph(section.key)}</td>
            <td valign="top"><h2 id="daily-${section.key}-heading" style="margin:0;color:${accentColor};font-size:18px;line-height:1.2;font-weight:700;">${escapeHtml(section.label)}</h2></td>
          </tr>
        </table>
        <div style="padding-top:22px;color:#172019;font-size:14px;line-height:1.5;">${content}</div>
      </div>
    </td>`;
};

const renderSectionHtmlContent = (section: RenderedSection): string => {
  if (section.status !== 'active') {
    if (section.key === 'calendar' && section.status === 'empty' && section.content) {
      return `${renderStateHtml(section)}${renderCalendarHtml(section.content)}`;
    }

    return renderStateHtml(section);
  }

  const detail = section.detail ? `<p style="margin:0 0 13px;color:#68756a;font-size:13px;line-height:1.5;">${escapeHtml(section.detail)}</p>` : '';

  switch (section.key) {
    case 'weather':
      return section.content
        ? renderWeatherHtml(section.content)
        : detail;
    case 'commute':
      return `${detail}${section.content ? renderCommuteHtml(section.content) : ''}`;
    case 'calendar':
      return `${detail}${section.content && calendarSectionHasEvents(section.content) ? renderCalendarHtml(section.content) : ''}`;
    case 'todo':
      return `${detail}${section.content ? renderTodoHtml(section.content) : ''}`;
  }
};

const renderWeatherHtml = (weather: WeatherDisplayForecast) => `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;">
        <tr>
          <td width="68" valign="middle" style="width:68px;padding:0 12px 0 0;">
            <img src="${escapeHtml(weather.iconUrl)}" alt="" width="56" height="56" style="display:block;width:56px;height:56px;" />
          </td>
          <td valign="middle" style="padding:0;">
            <p style="margin:0;color:#172019;font-size:26px;line-height:1.1;font-weight:700;"><span class="daily-screen-reader-only">Current </span>${escapeHtml(formatMetric(weather.currentTemperatureCelsius))}C</p>
            <p style="margin:4px 0 0;color:#68756a;font-size:13px;line-height:1.4;">${escapeHtml(weather.conditionText)}</p>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="padding:17px 0 0;color:#68756a;font-size:13px;line-height:1.5;">
            Low ${escapeHtml(formatMetric(weather.minimumTemperatureCelsius))}C, high ${escapeHtml(formatMetric(weather.maximumTemperatureCelsius))}C. Chance of precipitation ${escapeHtml(formatMetric(weather.maximumPrecipitationProbabilityPercent))}%. Wind up to ${escapeHtml(formatMetric(weather.maximumWindSpeedKmh))} km/h.
          </td>
        </tr>
        ${weather.summary ? `<tr><td colspan="2" style="padding:13px 0 0;color:#172019;font-size:13px;line-height:1.5;">${escapeHtml(weather.summary)}</td></tr>` : ''}
      </table>`;

const renderStateHtml = (section: RenderedSection) => {
  if (section.status === 'active') return '';

  return `<p style="margin:0 0 8px;color:#68756a;font-size:11px;line-height:1.3;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(stateLabels[section.status])}</p><p style="margin:0;color:#172019;font-size:14px;line-height:1.5;">${escapeHtml(section.message)}</p>`;
};

const renderCommuteHtml = (section: CommuteSection) => {
  if (section.estimates.length === 0) {
    return '<p style="margin:0;color:#68756a;">No Commute Estimates.</p>';
  }

  const routeHierarchy = section.estimates
    .filter((estimate) => estimate.originLabel || estimate.destinationLabel)
    .map(renderCommuteRouteHierarchyHtml)
    .join('');
  const estimates = section.estimates.map((estimate) => {
    if (estimate.outcome !== 'available') {
      return `<li style="margin:0 0 9px;padding:0;">${escapeHtml(estimate.routeName)}: Commute estimate unavailable.</li>`;
    }

    const minutes = formatMinutes(estimate.durationMinutes);
    const trafficDescription = trafficDescriptionFor(estimate);
    const trafficLevel = estimate.trafficLevel;
    const duration = trafficLevel
      ? `<span style="color:${commuteTrafficColors[trafficLevel]};">${minutes}</span>`
      : minutes;
    const accessibleRouteResult = `${estimate.routeName}: ${minutes}`;
    const hiddenTraffic = trafficDescription
      ? `<span class="daily-screen-reader-only">${escapeHtml(trafficDescription)}</span>`
      : '';

    return `<li style="margin:0 0 9px;padding:0;"><span aria-label="${escapeHtml(accessibleRouteResult)}">${escapeHtml(estimate.routeName)}: ${duration}</span>${hiddenTraffic}</li>`;
  }).join('');

  return `${routeHierarchy}<ul style="margin:0;padding:0 0 0 18px;">${estimates}</ul>`;
};

const renderCommuteRouteHierarchyHtml = (estimate: CommuteSection['estimates'][number]) => {
  const originLabel = estimate.originLabel ?? 'Home';
  const destinationLabel = estimate.destinationLabel ?? estimate.routeName;
  const routeHierarchyLabel = `Home: ${originLabel} → ${estimate.routeName}: ${destinationLabel}`;

  return `<div role="group" aria-label="${escapeHtml(routeHierarchyLabel)}" style="margin:0 0 12px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;"><tr><td valign="top" style="width:46%;padding:0 10px 0 0;"><p style="margin:0;color:#68756a;font-size:11px;line-height:1.3;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;">Home</p><p style="margin:3px 0 0;color:#172019;font-size:13px;line-height:1.4;">${escapeHtml(originLabel)}</p></td><td aria-hidden="true" valign="middle" style="width:8%;padding:0;color:#68756a;text-align:center;font-size:14px;line-height:1;">→</td><td valign="top" style="width:46%;padding:0 0 0 10px;"><p style="margin:0;color:#68756a;font-size:11px;line-height:1.3;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;">${escapeHtml(estimate.routeName)}</p><p style="margin:3px 0 0;color:#172019;font-size:13px;line-height:1.4;">${escapeHtml(destinationLabel)}</p></td></tr></table></div>`;
};

const renderCalendarHtml = (section: CalendarSection) => {
  const today = section.today ? renderCalendarDayHtml(section.today) : '';
  const weekAhead = section.weekAhead.length > 0
    ? `<h3 style="margin:0 0 7px;color:#68756a;font-size:12px;line-height:1.3;font-weight:700;">Week Ahead</h3>${section.weekAhead.map(renderCalendarDayHtml).join('')}`
    : '';

  return `${today}${weekAhead}`;
};

const renderCalendarDayHtml = (day: NonNullable<CalendarSection['today']>) => {
  const events = [
    ...day.allDayEvents.map(
      (event) => `<li style="margin:0 0 4px;">${calendarEventMarkerHtml(event.calendarColor)}All day ${escapeHtml(event.title)} <span style="color:#68756a;">(${escapeHtml(event.calendarLabel)})</span></li>`
    ),
    ...day.timedEvents.map(
      (event) => `<li style="margin:0 0 4px;">${calendarEventMarkerHtml(event.calendarColor)}<time>${escapeHtml(event.localStartTime)}</time> ${escapeHtml(event.title)} <span style="color:#68756a;">(${escapeHtml(event.calendarLabel)})</span></li>`
    )
  ];

  return `<div style="margin:0 0 13px;"><h3 style="margin:0 0 5px;color:#68756a;font-size:12px;line-height:1.3;font-weight:700;">${escapeHtml(day.label)}</h3><ul style="margin:0;padding:0 0 0 18px;">${events.join('')}</ul></div>`;
};

const renderTodoHtml = (section: TodoSection) => {
  const groups = [
    ...(section.uncategorizedTasks.length > 0
      ? [{ label: 'Uncategorized', tasks: section.uncategorizedTasks }]
      : []),
    ...section.categoryGroups.map((group) => ({ label: group.category.name, tasks: group.tasks }))
  ];

  return groups.map((group) => `<div style="margin:0 0 13px;">
      <h3 style="margin:0 0 5px;color:#68756a;font-size:12px;line-height:1.3;font-weight:700;">${escapeHtml(group.label)}</h3>
      <ul style="margin:0;padding:0 0 0 18px;">${group.tasks.map((task) => `<li style="margin:0 0 5px;">${escapeHtml(task.title)}${renderUrgencyHtml(task.urgency)}</li>`).join('')}</ul>
    </div>`).join('');
};

const renderUrgencyHtml = (urgency: TodoUrgency) =>
  ` <span aria-hidden="true" style="color:${urgencyDotColors[urgency]};">${urgencyDotGlyphs[urgency]}</span><span class="daily-screen-reader-only">${escapeHtml(urgencyLabel(urgency))}</span>`;

const renderText = ({
  sections,
  generatedTimestamp,
  userTimeZone,
  openDailyUrl
}: {
  sections: RenderedSection[];
  generatedTimestamp: string;
  userTimeZone: string;
  openDailyUrl: string;
}) => [
  'Good morning',
  `Generated: ${generatedTimestamp} (${userTimeZone})`,
  '',
  ...sections.flatMap((section) => [section.label, renderSectionTextContent(section), '']),
  `Daily · ${userTimeZone}`,
  `Open Daily: ${openDailyUrl}`
].join('\n').trim();

const renderSectionTextContent = (section: RenderedSection): string => {
  if (section.status !== 'active') {
    const stateText = renderStateText(section);

    return section.key === 'calendar' && section.status === 'empty' && section.content
      ? `${stateText}\n\n${renderCalendarText(section.content)}`
      : stateText;
  }

  const detail = section.detail ? [section.detail] : [];

  switch (section.key) {
    case 'weather':
      return section.content
        ? renderWeatherText(section.content)
        : detail.join('\n');
    case 'commute':
      return [
        ...detail,
        section.content ? renderCommuteText(section.content) : ''
      ].filter(Boolean).join('\n');
    case 'calendar':
      return [
        ...detail,
        section.content && calendarSectionHasEvents(section.content)
          ? renderCalendarText(section.content)
          : ''
      ].filter(Boolean).join('\n');
    case 'todo':
      return [
        ...detail,
        section.content ? renderTodoText(section.content) : ''
      ].filter(Boolean).join('\n');
  }
};

const renderWeatherText = (weather: WeatherDisplayForecast) => [
  `Current ${formatMetric(weather.currentTemperatureCelsius)}C · ${weather.conditionText}`,
  `Low ${formatMetric(weather.minimumTemperatureCelsius)}C, high ${formatMetric(weather.maximumTemperatureCelsius)}C.`,
  `Chance of precipitation ${formatMetric(weather.maximumPrecipitationProbabilityPercent)}%.`,
  `Wind up to ${formatMetric(weather.maximumWindSpeedKmh)} km/h.`,
  ...(weather.summary ? [weather.summary] : [])
].join('\n');

const renderCommuteText = (section: CommuteSection) => {
  const estimates = section.estimates.map((estimate) => estimate.outcome === 'available'
    ? `${estimate.routeName}: ${formatMinutes(estimate.durationMinutes)}${trafficDescriptionFor(estimate) ? ` — ${trafficDescriptionFor(estimate)}` : ''}`
    : `${estimate.routeName}: Commute estimate unavailable.`);
  const routeHierarchy = section.estimates
    .filter((estimate) => estimate.originLabel || estimate.destinationLabel)
    .map((estimate) => [
      `Home: ${estimate.originLabel ?? 'Home'}`,
      '→',
      estimate.routeName,
      estimate.destinationLabel ?? estimate.routeName
    ].join('\n'));

  return [
    ...estimates,
    ...(routeHierarchy.length > 0 ? ['', ...routeHierarchy] : [])
  ].join('\n');
};

const renderCalendarText = (section: CalendarSection) => [
  ...(section.today ? [renderCalendarDayText(section.today)] : []),
  ...(section.weekAhead.length > 0
    ? [`Week Ahead\n${section.weekAhead.map(renderCalendarDayText).join('\n\n')}`]
    : [])
].join('\n\n');

const renderCalendarDayText = (day: NonNullable<CalendarSection['today']>) => [
    day.label,
    ...day.allDayEvents.map((event) => `All day ${event.title} (${event.calendarLabel})`),
    ...day.timedEvents.map((event) => `${event.localStartTime} ${event.title} (${event.calendarLabel})`)
  ].join('\n');

const renderStateText = (section: RenderedSection) => {
  if (section.status === 'active') return '';

  return `${stateLabels[section.status]}\n${section.message}`;
};

const renderTodoText = (section: TodoSection) => [
  ...(section.uncategorizedTasks.length > 0
    ? [`Uncategorized\n${section.uncategorizedTasks.map(renderTodoTaskText).join('\n')}`]
    : []),
  ...section.categoryGroups.map((group) => `${group.category.name}\n${group.tasks.map(renderTodoTaskText).join('\n')}`)
].join('\n\n');

const renderTodoTaskText = (task: TodoTask) => `${task.title} — ${urgencyLabel(task.urgency)}`;

const formatMinutes = (durationMinutes: number | undefined) =>
  `${Number.isFinite(durationMinutes) ? Math.round(durationMinutes!) : '—'} minutes`;

const formatMetric = (value: number) =>
  Number.isInteger(value) ? value.toString() : value.toFixed(1).replace(/\.0$/, '');

const trafficDescriptionFor = (estimate: CommuteSection['estimates'][number]) =>
  estimate.trafficDescription ?? (estimate.trafficLevel ? commuteTrafficDescription(estimate.trafficLevel) : null);

const urgencyLabel = (urgency: TodoUrgency) =>
  urgency === 'high' ? 'High urgency' : urgency === 'medium' ? 'Medium urgency' : 'Low urgency';

const urgencyDotColors: Record<TodoUrgency, string> = {
  high: '#c76856',
  medium: '#d6a52d',
  low: '#91a1a2'
};

const urgencyDotGlyphs: Record<TodoUrgency, string> = {
  high: '●',
  medium: '●',
  low: '○'
};

const calendarEventMarkerHtml = (calendarColor: string | null | undefined) => {
  const color = /^#[0-9a-f]{6}$/i.test(calendarColor ?? '') ? calendarColor : '#d9ded8';
  return `<span aria-hidden="true" style="display:inline-block;width:8px;height:8px;background-color:${color};"></span> `;
};

const sectionGlyph = (section: SummarySection) =>
  section === 'weather' ? '☼' : section === 'commute' ? '→' : section === 'calendar' ? '□' : '○';

const formatGeneratedTimestamp = (date: Date, userTimeZone: string) => {
  const localDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: userTimeZone
  }).format(date);
  const localTime = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: userTimeZone
  }).format(date);

  return `${localDate} at ${localTime}`;
};

const canonicalOpenDailyUrl = (value: string) => {
  try {
    const url = new URL(value, 'http://daily.local');

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return '/';
    }

    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return value.startsWith('/') ? '/' : url.toString();
  } catch {
    return '/';
  }
};

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
