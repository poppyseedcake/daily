import { calendarSectionHasEvents, type CalendarSection } from './calendar';
import {
  commuteTrafficDescription,
  type CommuteTrafficLevel
} from './commuteTraffic';
import type { SummaryConfiguration, SummarySection } from './summaryConfiguration';
import type { WeatherDisplayForecast } from './weatherForecast';
import type {
  SummarySectionPresentationState,
  SummarySectionPresentationStateFor
} from './summarySectionPresentation';
import type { TodoSection, TodoTask, TodoUrgency } from './todo';

export const dailySummarySectionOrder = ['weather', 'commute', 'calendar', 'todo'] as const;

export type DailySummarySectionStatus = SummarySectionPresentationState | 'available';

export type DailySummarySectionStateFor<Section extends SummarySection> =
  | {
      status: Exclude<SummarySectionPresentationStateFor<Section>, 'unavailable'> | 'available';
      label: string;
      detail?: string;
    }
  | {
      status: 'unavailable';
      label: string;
      reason: string;
      detail?: string;
    };

export type DailySummarySectionState = {
  [Section in SummarySection]: DailySummarySectionStateFor<Section>;
}[SummarySection];

export type DailySummaryInput = {
  configuration: SummaryConfiguration;
  generatedAt?: Date;
  openDailyUrl?: string;
  sections: {
    [Section in SummarySection]: DailySummarySectionStateFor<Section>;
  };
  weatherSection?: WeatherDisplayForecast | null;
  calendarSection?: CalendarSection | null;
  commuteSection?: CommuteSection | null;
  todoSection: TodoSection | null;
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

type RenderedSection = {
  key: SummarySection;
  label: string;
  status: Exclude<DailySummarySectionStatus, 'available'>;
  detail?: string;
  reason?: string;
  weatherSection?: WeatherDisplayForecast | null;
  calendarSection?: CalendarSection | null;
  commuteSection?: CommuteSection | null;
  todoSection?: TodoSection | null;
};

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
  const generatedAt = input.generatedAt ?? new Date();
  const generatedTimestamp = formatGeneratedTimestamp(generatedAt, input.configuration.userTimeZone);
  const openDailyUrl = canonicalOpenDailyUrl(input.openDailyUrl);

  return {
    html: renderHtml({
      sections,
      generatedAt,
      generatedTimestamp,
      userTimeZone: input.configuration.userTimeZone,
      openDailyUrl
    }),
    text: renderText({
      sections,
      generatedTimestamp,
      userTimeZone: input.configuration.userTimeZone,
      openDailyUrl
    })
  };
};

const resolveSection = (input: DailySummaryInput, key: SummarySection): RenderedSection => {
  const state = input.sections[key];
  const label = fixedSectionLabels[key];
  const explicitlyPaused = input.configuration.sectionPauses[key];
  const status = explicitlyPaused
    ? 'paused'
    : state.status === 'available'
      ? 'active'
      : state.status;
  const detail = explicitlyPaused
    ? state.status === 'paused'
      ? state.detail
      : `${label} is paused.`
    : state.detail;

  return {
    key,
    label,
    status,
    detail,
    ...(!explicitlyPaused && state.status === 'unavailable' ? { reason: state.reason } : {}),
    ...(key === 'weather' && !explicitlyPaused
      ? { weatherSection: input.weatherSection ?? null }
      : {}),
    ...(key === 'calendar' ? { calendarSection: input.calendarSection } : {}),
    ...(key === 'commute' ? { commuteSection: input.commuteSection } : {}),
    ...(key === 'todo' ? { todoSection: input.todoSection } : {})
  };
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
    if (section.key === 'calendar' && section.status === 'empty' && section.calendarSection) {
      return `${renderStateHtml(section)}${renderCalendarHtml(section.calendarSection)}`;
    }

    return renderStateHtml(section);
  }

  const detail = section.detail ? `<p style="margin:0 0 13px;color:#68756a;font-size:13px;line-height:1.5;">${escapeHtml(section.detail)}</p>` : '';

  switch (section.key) {
    case 'weather':
      return section.weatherSection
        ? renderWeatherHtml(section.weatherSection)
        : `${detail || '<p style="margin:0;color:#68756a;">Weather facts are ready.</p>'}`;
    case 'commute':
      return `${detail}${section.commuteSection ? renderCommuteHtml(section.commuteSection) : '<p style="margin:0;color:#68756a;">Commute facts are ready.</p>'}`;
    case 'calendar':
      return `${detail}${section.calendarSection && calendarSectionHasEvents(section.calendarSection) ? renderCalendarHtml(section.calendarSection) : '<p style="margin:0;color:#68756a;">Calendar facts are ready.</p>'}`;
    case 'todo':
      return `${detail}${section.todoSection ? renderTodoHtml(section.todoSection) : '<p style="margin:0;color:#68756a;">Todo facts are ready.</p>'}`;
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

  const message = section.reason ?? section.detail ?? defaultStateMessage(section.key, section.status);

  return `<p style="margin:0 0 8px;color:#68756a;font-size:11px;line-height:1.3;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(stateLabels[section.status])}</p><p style="margin:0;color:#172019;font-size:14px;line-height:1.5;">${escapeHtml(message)}</p>`;
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

    return section.key === 'calendar' && section.status === 'empty' && section.calendarSection
      ? `${stateText}\n\n${renderCalendarText(section.calendarSection)}`
      : stateText;
  }

  const detail = section.detail ? [section.detail] : [];

  switch (section.key) {
    case 'weather':
      return section.weatherSection
        ? renderWeatherText(section.weatherSection)
        : detail.join('\n') || 'Weather facts are ready.';
    case 'commute':
      return [
        ...detail,
        section.commuteSection ? renderCommuteText(section.commuteSection) : 'Commute facts are ready.'
      ].filter(Boolean).join('\n');
    case 'calendar':
      return [
        ...detail,
        section.calendarSection && calendarSectionHasEvents(section.calendarSection)
          ? renderCalendarText(section.calendarSection)
          : 'Calendar facts are ready.'
      ].filter(Boolean).join('\n');
    case 'todo':
      return [
        ...detail,
        section.todoSection ? renderTodoText(section.todoSection) : 'Todo facts are ready.'
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

  return `${stateLabels[section.status]}\n${section.reason ?? section.detail ?? defaultStateMessage(section.key, section.status)}`;
};

const renderTodoText = (section: TodoSection) => [
  ...(section.uncategorizedTasks.length > 0
    ? [`Uncategorized\n${section.uncategorizedTasks.map(renderTodoTaskText).join('\n')}`]
    : []),
  ...section.categoryGroups.map((group) => `${group.category.name}\n${group.tasks.map(renderTodoTaskText).join('\n')}`)
].join('\n\n');

const renderTodoTaskText = (task: TodoTask) => `${task.title} — ${urgencyLabel(task.urgency)}`;

const defaultStateMessage = (section: SummarySection, status: Exclude<DailySummarySectionStatus, 'available' | 'active'>) => {
  switch (status) {
    case 'paused':
      return `${fixedSectionLabels[section]} is paused.`;
    case 'unconfigured':
      return section === 'weather'
        ? 'Choose a Weather Location to include local weather.'
        : section === 'commute'
          ? 'Add a Commute Route to include commute estimates.'
          : 'Connect Google Calendar and select a Calendar to include Calendar Events.';
    case 'empty':
      return section === 'commute'
        ? 'No Commute Routes are scheduled today.'
        : section === 'calendar'
          ? 'No Calendar Events are scheduled in the Week Ahead.'
          : 'There are no active Todo Tasks.';
    case 'unavailable':
      return `${fixedSectionLabels[section]} is unavailable right now.`;
  }
};

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

const canonicalOpenDailyUrl = (value: string | undefined) => {
  if (!value) return '/';

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
