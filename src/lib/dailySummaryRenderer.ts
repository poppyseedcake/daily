import { Temporal } from '@js-temporal/polyfill';
import { calendarSectionHasEvents, type CalendarSection } from './calendar';
import {
  commuteTrafficDescription,
  type CommuteTrafficLevel
} from './commuteTraffic';
import type { SummarySection, UserTimeZone } from './summaryConfiguration';
import { weatherPrecipitationIntensityForCode, type WeatherDisplayForecast } from './weatherForecast';
import { workspaceGreeting } from './workspaceGreeting';
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
  userName?: string;
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

export function dailySummarySubject(kind: 'scheduled', generatedAt: Date, userTimeZone: string): string;
export function dailySummarySubject(kind: 'test', generatedAt: Date, userTimeZone: string, attemptId: string): string;
export function dailySummarySubject(
  kind: DailySummaryDeliveryKind,
  generatedAt: Date,
  userTimeZone: string,
  attemptId?: string
) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: userTimeZone
  }).format(generatedAt);
  const dayAndMonth = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: userTimeZone
  }).format(generatedAt);

  const testTime = kind === 'test' ? ` · ${new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    timeZone: userTimeZone
  }).format(generatedAt)}` : '';

  // Repeated test messages must start separate Gmail conversations, otherwise
  // Gmail hides unchanged sections as quoted content behind its ellipsis.
  const testReference = kind === 'test' ? ` · #${attemptId}` : '';
  return `${kind === 'test' ? 'Test · ' : ''}Your Daily Summary · ${weekday}, ${dayAndMonth}${testTime}${testReference}`;
}

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
  weather: '#5b7750',
  commute: '#63799b',
  calendar: '#5b7750',
  todo: '#5b7750'
};

const commuteTrafficColors: Record<CommuteTrafficLevel, string> = {
  light: '#4f8a57',
  moderate: '#c08a2c',
  heavy: '#c55d50'
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
  const { greeting } = workspaceGreeting(generatedAt, input.userTimeZone, input.userName);

  return {
    html: renderHtml({
      sections,
      generatedAt,
      greeting,
      generatedTimestamp,
      userTimeZone: input.userTimeZone,
      openDailyUrl
    }),
    text: renderText({
      sections,
      greeting,
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

// Critical presentation and hidden text stay inline: Gmail can discard head CSS.
const hiddenText = (value: string) => `<span class="daily-screen-reader-only" style="display:inline-block;width:0;height:0;max-height:0;max-width:0;padding:0;margin:0;overflow:hidden;font-size:0;line-height:0;white-space:nowrap;vertical-align:top;">${escapeHtml(value)}</span>`;

const emailIcon = (name: string, size: number, openDailyUrl: string) => {
  const url = openDailyUrl.startsWith('/') ? `/email-icons/${name}.png`
    : new URL(`email-icons/${name}.png`, openDailyUrl).toString();
  return `<img src="${escapeHtml(url)}" alt="" width="${size}" height="${size}" style="display:block;border:0;width:${size}px;height:${size}px;" />`;
};

type EmailContext = { generatedAt: Date; userTimeZone: string; openDailyUrl: string };

const localGenerationDate = (context: EmailContext) =>
  Temporal.Instant.fromEpochMilliseconds(context.generatedAt.getTime())
    .toZonedDateTimeISO(context.userTimeZone).toPlainDate();

const renderHtml = (context: EmailContext & {
  sections: RenderedSection[];
  generatedTimestamp: string;
  greeting: string;
}) => {
  const { sections, generatedAt, userTimeZone, openDailyUrl } = context;
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: userTimeZone }).format(generatedAt);
  const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: userTimeZone }).format(generatedAt);
  const date = `${weekday}, ${dayMonth}`;
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: userTimeZone
  }).format(generatedAt);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @media only screen and (min-width: 701px) {
        .daily-grid-row { display:table !important; width:100% !important; table-layout:fixed !important; }
        .daily-grid-cell { display:table-cell !important; width:50% !important; max-width:none !important; }
        .daily-grid-cell-left { border-right:1px solid #dfe5dc !important; }
      }
      @media only screen and (max-width: 700px) {
        .daily-grid-cell { display: block !important; width: 100% !important; max-width:none !important; box-sizing: border-box !important; border-right:0 !important; }
        .daily-grid-cell-inner { min-height: 0 !important; }
        .daily-summary-shell { width: 100% !important; }
        .daily-header { padding:24px 22px !important; }
        .daily-header-table { display:block !important; position:relative !important; }
        .daily-header-table > tbody, .daily-header-table > tbody > tr { display:block !important; }
        .daily-brand { display:block !important; width:100% !important; }
        .daily-greeting { display:block !important; width:100% !important; text-align:left !important; padding-top:20px !important; }
        .daily-time { display:block !important; position:absolute !important; top:0 !important; right:0 !important; width:auto !important; }
        .daily-grid-row { border-bottom:0 !important; }
        .daily-grid-cell { padding:24px 22px !important; border-bottom:1px solid #dfe5dc !important; }
        .daily-footer { padding:20px 22px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#ffffff;color:#243025;font-family:Inter,Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background-color:#ffffff;">
      <tr><td align="center" style="padding:24px 0;">
        <!--[if mso]><table role="presentation" width="790" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table class="daily-summary-shell" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:790px;table-layout:fixed;border-collapse:collapse;background-color:#fbfcfa;">
          <tr><td class="daily-header" style="padding:28px 40px;border-bottom:1px solid #dfe5dc;">
            <table class="daily-header-table" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
              <tr>
                <td class="daily-brand" width="22%" valign="top" style="width:22%;padding-top:2px;">
                  <table data-daily-brand role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                    <td align="center" width="25" height="25" style="width:25px;height:25px;border-radius:7px;background-color:#587542;color:#ffffff;font-size:14px;line-height:25px;font-weight:800;">D</td>
                    <td style="padding-left:9px;color:#243025;font-size:14px;line-height:25px;font-weight:800;">Daily</td>
                  </tr></table>
                </td>
                <td class="daily-greeting" width="56%" valign="top" align="center" style="width:56%;text-align:center;">
                  <h1 style="margin:0;color:#243025;font-size:25px;line-height:1.15;font-weight:500;letter-spacing:-0.04em;overflow-wrap:anywhere;word-break:break-word;word-wrap:break-word;">${escapeHtml(context.greeting)}</h1>
                  <p style="margin:6px 0 0;color:#748074;font-size:11px;line-height:1.5;"><time datetime="${escapeHtml(generatedAt.toISOString())}">${escapeHtml(date)}</time></p>
                </td>
                <td class="daily-time" width="22%" valign="top" align="right" style="width:22%;color:#8b9489;font-size:10px;line-height:1.5;">${escapeHtml(time)}</td>
              </tr>
            </table>
          </td></tr>
          <tr><td style="padding:0;">
            ${renderGridRow(sections.slice(0, 2), context)}
            ${renderGridRow(sections.slice(2, 4), context)}
          </td></tr>
          <tr><td class="daily-footer" style="padding:20px 40px 23px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tr>
              <td style="color:#748074;font-size:10px;line-height:1.5;">Daily · ${escapeHtml(userTimeZone)}</td>
              <td align="right" style="font-size:10px;line-height:1.5;"><a href="${escapeHtml(openDailyUrl)}" style="color:#587542;font-weight:700;text-decoration:none;">Open Daily &#8599;</a></td>
            </tr></table>
          </td></tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td></tr>
    </table>
  </body>
</html>`;
};

// Column width stacks without media queries; row-owned separators remain continuous.
// These column properties are supported by Gmail; Outlook gets conditional tables.
const renderGridRow = (sections: RenderedSection[], context: EmailContext) =>
  `<div class="daily-grid-row" style="width:100%;column-count:2;column-width:395px;column-gap:0;column-rule:1px solid #dfe5dc;border-bottom:1px solid #dfe5dc;">
    <!--[if mso]><table role="presentation" width="790" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;"><tr><![endif]-->
    ${sections.map((section, index) => `<!--[if mso]><td width="395" valign="top"${index === 0 ? ' style="border-right:1px solid #dfe5dc;"' : ''}><![endif]-->${renderSectionCell(section, context, index === 0)}<!--[if mso]></td><![endif]-->`).join('')}
    <!--[if mso]></tr></table><![endif]-->
  </div>`;

const renderSectionCell = (section: RenderedSection, context: EmailContext, left: boolean) => {
  const accentColor = sectionAccentColors[section.key];
  const week = section.key === 'calendar'
    ? `<td align="right" style="color:#8c958a;font-size:8px;line-height:18px;font-weight:800;letter-spacing:0.08em;">WEEK ${localGenerationDate(context).weekOfYear}</td>`
    : '';
  const contentGap = section.key === 'weather' || section.key === 'commute' ? 31 : 24;
  return `<div class="daily-grid-cell${left ? ' daily-grid-cell-left' : ''}" data-summary-section="${section.key}" style="display:block;break-inside:avoid;vertical-align:top;width:100%;box-sizing:border-box;padding:27px 30px;font-size:11px;line-height:1.5;background-color:transparent;">
    <div class="daily-grid-cell-inner" role="region" aria-labelledby="daily-${section.key}-heading" style="min-height:182px;overflow-wrap:anywhere;word-break:break-word;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tr>
        <td width="18" style="width:18px;padding-right:8px;">${emailIcon(section.key, 18, context.openDailyUrl)}</td>
        <td><h2 id="daily-${section.key}-heading" style="margin:0;color:${accentColor};font-size:10px;line-height:18px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;">${escapeHtml(section.label)}</h2></td>${week}
      </tr></table>
      <div style="padding-top:${contentGap}px;color:#243025;font-size:11px;line-height:1.5;">${renderSectionHtmlContent(section, context)}</div>
    </div>
  </div>`;
};

const renderSectionHtmlContent = (section: RenderedSection, context: EmailContext): string => {
  if (section.status !== 'active') {
    return section.key === 'calendar' && section.status === 'empty' && section.content
      ? `${renderCalendarStrip(context)}${renderStateHtml(section)}`
      : renderStateHtml(section);
  }
  if (!section.content) {
    return section.detail ? `<p style="margin:0;color:#748074;font-size:11px;line-height:1.5;">${escapeHtml(section.detail)}</p>` : '';
  }
  switch (section.key) {
    case 'weather': return renderWeatherHtml(section.content, context);
    case 'commute': return renderCommuteHtml(section.content, context);
    case 'calendar': return renderCalendarHtml(section.content, context);
    case 'todo': return renderTodoHtml(section.content);
  }
};

const weatherTemperatureFontSize = (temperature: number) => {
  const length = formatMetric(temperature).length;
  return length > 5 ? 30 : length > 4 ? 36 : length > 3 ? 40 : 45;
};

const weatherTemperatureWidth = (temperature: number) => {
  const value = formatMetric(temperature);
  return Math.ceil([...value].reduce((width, character) => width + (character === '.' ? 12 : character === '-' ? 16 : 25), 30) * weatherTemperatureFontSize(temperature) / 45);
};

const weatherPrecipitationIntensitySuffix = (weather: WeatherDisplayForecast) => {
  const intensity = weatherPrecipitationIntensityForCode(weather.dailyWeatherCode);
  return weather.maximumPrecipitationProbabilityPercent > 0 && intensity !== 'None' && intensity !== 'Unknown'
    ? ` (${intensity})` : '';
};

// Stored locations retain the full address; summaries need only the first label.
const compactLocationLabel = (label: string) => label.split(',').map((part) => part.trim()).find(Boolean) ?? label.trim();

const temperatureArrow = (direction: '↑' | '↓') =>
  `<span aria-hidden="true" style="display:inline-block;font-size:18px;line-height:1;font-weight:900;vertical-align:middle;">${direction}</span>`;

const renderWeatherHtml = (weather: WeatherDisplayForecast, context: EmailContext) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;border-collapse:collapse;">
    <tr>
      <td width="52" valign="middle" style="width:52px;padding-right:10px;">${emailIcon(weather.conditionCategory, 46, context.openDailyUrl)}</td>
      <td width="${weatherTemperatureWidth(weather.currentTemperatureCelsius)}" valign="middle" aria-label="Current ${escapeHtml(formatMetric(weather.currentTemperatureCelsius))} degrees Celsius" style="width:${weatherTemperatureWidth(weather.currentTemperatureCelsius)}px;padding-right:13px;white-space:nowrap;color:#263923;font-size:${weatherTemperatureFontSize(weather.currentTemperatureCelsius)}px;line-height:1.15;font-weight:700;letter-spacing:-0.04em;">${hiddenText('Current ')}${escapeHtml(formatMetric(weather.currentTemperatureCelsius))}°${hiddenText(' Celsius')}</td>
      <td valign="middle" style="padding-left:13px;border-left:1px solid #d8e0d6;">
        ${weather.locationLabel ? `<p style="margin:0 0 5px;font-size:12px;line-height:1.3;font-weight:700;">${escapeHtml(compactLocationLabel(weather.locationLabel))}</p>` : ''}
        <p style="margin:0 0 5px;color:#798479;font-size:10px;line-height:1.4;">Wind ${escapeHtml(formatMetric(weather.maximumWindSpeedKmh))} km/h</p>
        <p style="margin:0 0 5px;color:#798479;font-size:10px;line-height:1.4;">${escapeHtml(weather.conditionText)}</p>
        <p style="margin:0;color:#798479;font-size:10px;line-height:1.4;">Precip. ${escapeHtml(formatMetric(weather.maximumPrecipitationProbabilityPercent))}%${weatherPrecipitationIntensitySuffix(weather)}</p>
      </td>
    </tr>
    <tr><td colspan="2" align="center" style="padding-top:8px;font-size:11px;line-height:1.4;font-weight:700;">
      <span aria-label="High ${escapeHtml(formatMetric(weather.maximumTemperatureCelsius))} degrees Celsius" style="color:#b96553;">${hiddenText('High ')}${temperatureArrow('↑')} ${escapeHtml(formatMetric(weather.maximumTemperatureCelsius))}°</span>
      &nbsp;&nbsp;&nbsp; <span aria-label="Low ${escapeHtml(formatMetric(weather.minimumTemperatureCelsius))} degrees Celsius" style="color:#657ea6;">${hiddenText('Low ')}${temperatureArrow('↓')} ${escapeHtml(formatMetric(weather.minimumTemperatureCelsius))}°</span>
    </td><td></td></tr>
  </table>
  ${weather.summary ? `<p style="margin:8px 0 0;color:#748074;font-size:11px;line-height:1.5;">${escapeHtml(weather.summary)}</p>` : ''}`;

const renderStateHtml = (section: RenderedSection) => {
  if (section.status === 'active') return '';
  return `<p style="margin:0 0 8px;color:#748074;font-size:9px;line-height:1.3;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(stateLabels[section.status])}</p><p style="margin:0;color:#243025;font-size:11px;line-height:1.5;">${escapeHtml(section.message)}</p>`;
};

const renderCommuteHtml = (section: CommuteSection, context: EmailContext) => {
  if (section.estimates.length === 0) return '<p style="margin:0;color:#748074;">No Commute Estimates.</p>';
  return section.estimates.map((estimate, index) => {
    const color = estimate.trafficLevel ? commuteTrafficColors[estimate.trafficLevel] : '#354239';
    const result = estimate.outcome === 'available'
      ? `<p style="margin:6px 0 8px;color:${color};white-space:nowrap;line-height:1;" aria-label="${escapeHtml(`${estimate.routeName}: ${formatMinutes(estimate.durationMinutes)}${trafficDescriptionFor(estimate) ? ` — ${trafficDescriptionFor(estimate)}` : ''}`)}"><strong style="font-size:50px;line-height:0.85;font-weight:700;letter-spacing:-0.04em;">${Number.isFinite(estimate.durationMinutes) ? Math.round(estimate.durationMinutes!) : '—'}</strong><span style="font-size:13px;font-weight:700;"> min</span>${hiddenText(trafficDescriptionFor(estimate) ?? '')}</p>`
      : `<p aria-label="${escapeHtml(estimate.routeName)}: Commute estimate unavailable." style="margin:0 0 8px;color:#748074;font-size:11px;line-height:1.5;">Commute estimate unavailable.</p>`;
    return `<div style="${index > 0 ? 'margin-top:22px;padding-top:16px;border-top:1px solid #dfe5dc;' : ''}">${result}${renderCommuteRouteHierarchyHtml(estimate, context)}</div>`;
  }).join('');
};

const renderCommuteRouteHierarchyHtml = (estimate: CommuteSection['estimates'][number], context: EmailContext) => {
  const originLabel = compactLocationLabel(estimate.originLabel ?? 'Home');
  const destinationLabel = compactLocationLabel(estimate.destinationLabel ?? estimate.routeName);
  const arrowUrl = context.openDailyUrl.startsWith('/') ? '/email-icons/commute-arrow.png'
    : new URL('email-icons/commute-arrow.png', context.openDailyUrl).toString();
  const stop = (name: string, address: string, icon: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;border-collapse:collapse;"><tr><td width="28" valign="middle" style="width:28px;padding-right:7px;">${emailIcon(icon, 21, context.openDailyUrl)}</td><td><p style="margin:0;color:#354239;font-size:11px;line-height:1.3;font-weight:700;">${escapeHtml(name)}</p><p style="margin:3px 0 0;color:#8b958b;font-size:9px;line-height:1.4;">${escapeHtml(address)}</p></td></tr></table>`;
  return `<div role="group" aria-label="${escapeHtml(`Home: ${originLabel} → ${estimate.routeName}: ${destinationLabel}`)}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;border-collapse:collapse;"><tr>
    <td width="39%" valign="middle" style="width:39%;">${stop('Home', originLabel, 'house')}</td>
    <td width="22%" align="center" valign="middle" style="width:22%;padding:0 4px;"><img src="${escapeHtml(arrowUrl)}" alt="→" width="64" height="12" style="display:block;border:0;width:100%;max-width:64px;height:auto;" /></td>
    <td width="39%" valign="middle" style="width:39%;">${stop(estimate.routeName, destinationLabel, 'destination')}</td>
  </tr></table></div>`;
};

const renderCalendarStrip = (context: EmailContext) => {
  const today = localGenerationDate(context);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = today.add({ days: index });
    const label = date.toLocaleString('en-US', { weekday: 'short' }).toUpperCase();
    return `<td data-calendar-date="${date.toString()}" align="center" width="14.28%" style="width:14.28%;padding:0;color:${index === 0 ? '#587542' : '#8c958a'};font-size:8px;line-height:1.3;font-weight:800;letter-spacing:0.08em;">${label}<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:5px auto 0;"><tr><td align="center" width="25" height="25" ${index === 0 ? 'aria-current="date"' : ''} style="width:25px;height:25px;line-height:25px;letter-spacing:0;font-size:11px;${index === 0 ? 'border-radius:50%;background-color:#587542;color:#ffffff;' : 'color:#697568;'}">${date.day}</td></tr></table></td>`;
  });
  return `<table data-calendar-strip role="presentation" aria-label="Next seven days" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;border-collapse:collapse;margin-bottom:19px;"><tr>${days.join('')}</tr></table>`;
};

const renderCalendarHtml = (section: CalendarSection, context: EmailContext) =>
  `${renderCalendarStrip(context)}${[...(section.today ? [section.today] : []), ...section.weekAhead].filter((day) => day.allDayEvents.length + day.timedEvents.length > 0).map((day, index, days) => renderCalendarDayHtml(day, index === days.length - 1)).join('')}`;

const renderCalendarDayHtml = (day: NonNullable<CalendarSection['today']>, last: boolean) => {
  const events = [
    ...day.allDayEvents.map((event) => ({ ...event, time: 'All day' })),
    ...day.timedEvents.map((event) => ({ ...event, time: event.localStartTime }))
  ];
  if (events.length === 0) return '';
  return `<div style="margin:0 0 ${last ? 0 : 12}px;"><h3 style="margin:0 0 4px;color:#8c958a;font-size:8px;line-height:1.3;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(day.label)}</h3><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;border-collapse:collapse;">${events.map((event) => `<tr><td width="42" valign="top" style="width:42px;padding:0 8px 0 0;color:#7b877a;font-size:9px;line-height:1.5;white-space:nowrap;"><time>${escapeHtml(event.time)}</time></td><td valign="top" style="padding:0;font-size:10px;line-height:1.5;">${calendarEventMarkerHtml(event.calendarColor)}<strong style="font-weight:600;">${escapeHtml(event.title)}</strong><span style="color:#798479;font-size:9px;"> (${escapeHtml(event.calendarLabel)})</span></td></tr>`).join('')}</table></div>`;
};

const renderTodoHtml = (section: TodoSection) => {
  const groups = [
    ...(section.uncategorizedTasks.length > 0 ? [{ label: 'Uncategorized', tasks: section.uncategorizedTasks }] : []),
    ...section.categoryGroups.map((group) => ({ label: group.category.name, tasks: group.tasks }))
  ];
  return groups.map((group) => `<div style="margin:0 0 10px;">
    <h3 style="margin:0;color:#7a8679;font-size:9px;line-height:1.3;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(group.label)}</h3>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;border-collapse:collapse;margin-top:-6px;">${group.tasks.map((task, index) => `<tr>
      <td width="28" style="width:28px;padding:0;"></td>
      <td width="18" valign="top" style="width:18px;padding:7px 9px 7px 0;${index < group.tasks.length - 1 ? 'border-bottom:1px solid #e5e9e3;' : ''}">${renderUrgencyHtml(task.urgency)}</td>
      <td valign="top" style="padding:7px 0;font-size:10px;line-height:1.5;font-weight:600;${index < group.tasks.length - 1 ? 'border-bottom:1px solid #e5e9e3;' : ''}">${escapeHtml(task.title)}</td>
    </tr>`).join('')}</table>
  </div>`).join('');
};

const renderUrgencyHtml = (urgency: TodoUrgency) =>
  `<span data-urgency="${urgency}" aria-hidden="true" style="color:${urgencyDotColors[urgency]};font-size:12px;line-height:15px;">${urgencyDotGlyphs[urgency]}</span>${hiddenText(urgencyLabel(urgency))}`;

const renderText = ({
  sections,
  greeting,
  generatedTimestamp,
  userTimeZone,
  openDailyUrl
}: {
  sections: RenderedSection[];
  greeting: string;
  generatedTimestamp: string;
  userTimeZone: string;
  openDailyUrl: string;
}) => [
  greeting,
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
  ...(weather.locationLabel ? [compactLocationLabel(weather.locationLabel)] : []),
  `Current ${formatMetric(weather.currentTemperatureCelsius)}C · ${weather.conditionText}`,
  `Low ${formatMetric(weather.minimumTemperatureCelsius)}C, high ${formatMetric(weather.maximumTemperatureCelsius)}C.`,
  `Chance of precipitation ${formatMetric(weather.maximumPrecipitationProbabilityPercent)}%${weatherPrecipitationIntensitySuffix(weather)}.`,
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
      `Home: ${compactLocationLabel(estimate.originLabel ?? 'Home')}`,
      '→',
      estimate.routeName,
      compactLocationLabel(estimate.destinationLabel ?? estimate.routeName)
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
