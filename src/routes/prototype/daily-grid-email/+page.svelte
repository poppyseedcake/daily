<!--
  PROTOTYPE — production-fidelity Daily Grid email validation harness.
  Four content/state cases are switchable with ?case=; presentation checks use ?mode= and ?width=.
  This is deliberately separate from the production renderer and must not ship as implementation code.
-->

<script lang="ts">
  import { dev } from '$app/environment';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';

  type SectionState = 'active' | 'paused' | 'unconfigured' | 'empty' | 'unavailable';
  type CaseKey = 'representative' | 'extremes' | 'states-a' | 'states-b';
  type Mode = 'html' | 'blocked' | 'text';
  type PreviewWidth = 'wide' | 'narrow';
  type SectionKey = 'weather' | 'commute' | 'calendar' | 'todo';

  type PrototypeCase = {
    name: string;
    description: string;
    states: Record<SectionKey, SectionState>;
  };

  const cases: Record<CaseKey, PrototypeCase> = {
    representative: {
      name: 'Representative day',
      description: 'All four sections active with ordinary production-shaped content.',
      states: { weather: 'active', commute: 'active', calendar: 'active', todo: 'active' }
    },
    extremes: {
      name: 'Content extremes',
      description: 'Five routes, a dense seven-day calendar, long labels, and many Todo Tasks.',
      states: { weather: 'active', commute: 'active', calendar: 'active', todo: 'active' }
    },
    'states-a': {
      name: 'State matrix A',
      description: 'Paused Weather, unconfigured Commute, empty Calendar, unavailable Todo.',
      states: { weather: 'paused', commute: 'unconfigured', calendar: 'empty', todo: 'unavailable' }
    },
    'states-b': {
      name: 'State matrix B',
      description: 'Unavailable Weather, empty Commute, unconfigured Calendar, paused Todo.',
      states: { weather: 'unavailable', commute: 'empty', calendar: 'unconfigured', todo: 'paused' }
    }
  };

  const caseKeys = Object.keys(cases) as CaseKey[];
  const requestedCase = $derived(page.url.searchParams.get('case') as CaseKey | null);
  const caseKey = $derived<CaseKey>(requestedCase && requestedCase in cases ? requestedCase : 'representative');
  const requestedMode = $derived(page.url.searchParams.get('mode'));
  const mode = $derived<Mode>(requestedMode === 'blocked' || requestedMode === 'text' ? requestedMode : 'html');
  const width = $derived<PreviewWidth>(page.url.searchParams.get('width') === 'narrow' ? 'narrow' : 'wide');
  const selectedCase = $derived(cases[caseKey]);

  const setQuery = (key: string, value: string) => {
    const next = new URL(page.url);
    next.searchParams.set(key, value);
    replaceState(next, page.state);
  };

  const cycleCase = (direction: -1 | 1) => {
    const index = caseKeys.indexOf(caseKey);
    setQuery('case', caseKeys[(index + direction + caseKeys.length) % caseKeys.length]);
  };

  const stateCopy: Record<SectionKey, Record<Exclude<SectionState, 'active'>, string>> = {
    weather: {
      paused: 'Weather is paused.',
      unconfigured: 'Choose a Weather Location to see today’s forecast.',
      empty: 'No weather details are available for today.',
      unavailable: 'Weather is temporarily unavailable.'
    },
    commute: {
      paused: 'Commute is paused.',
      unconfigured: 'Add a Commute Route to see travel times.',
      empty: 'No Commute Routes are scheduled for today.',
      unavailable: 'Commute is temporarily unavailable.'
    },
    calendar: {
      paused: 'Calendar is paused.',
      unconfigured: 'Connect Google Calendar to see the Week Ahead.',
      empty: 'No Calendar Events in the Week Ahead.',
      unavailable: 'Calendar is temporarily unavailable.'
    },
    todo: {
      paused: 'Todo is paused.',
      unconfigured: 'Set up Todo to see active Todo Tasks.',
      empty: 'No active Todo Tasks.',
      unavailable: 'Todo is temporarily unavailable.'
    }
  };

  const escapeHtml = (value: string) => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

  const icon = (body: string, color: string, size = 20) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const icons = {
    weather: icon('<path d="M12 2v2M4.93 4.93l1.42 1.42M2 12h2M20 12h2M17.66 6.34l1.41-1.41"/><path d="M8.5 18H6a4 4 0 1 1 1.2-7.82A5 5 0 0 1 17 12c0 .34-.03.67-.1 1"/><path d="M13 16h6M16 13v6"/>', '#66875a'),
    commute: icon('<path d="M6 5h10a3 3 0 0 1 0 6H8a3 3 0 0 0 0 6h10"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="17" r="2"/>', '#647faa'),
    calendar: icon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>', '#66875a'),
    todo: icon('<path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>', '#66875a'),
    house: icon('<path d="M3 11l9-8 9 8v10H3V11Z"/><path d="M9 21v-7h6v7"/>', '#6683b2', 25),
    pin: icon('<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>', '#728b78', 25),
    weatherLarge: '<svg xmlns="http://www.w3.org/2000/svg" width="58" height="58" viewBox="0 0 58 58" fill="none" stroke="#26382a" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M29 8V3M16 13l-4-4M10 26H5M42 13l4-4M47 26h5"/><path d="M20 35a11 11 0 0 1 20-5 9 9 0 1 1 2 17H18a7 7 0 1 1 2-12Z"/></svg>'
  };

  const imageTag = (svg: string, alt: string, width: number, className = '') => `<span ${className ? `class="${className}" ` : ''}${alt ? `role="img" aria-label="${alt}"` : 'aria-hidden="true"'} style="display:block;width:${width}px;height:${width}px">${svg}</span>`;

  const statePanel = (key: SectionKey, state: SectionState) => {
    if (state === 'active') return '';
    const eyebrow = state === 'unavailable' ? 'TRY AGAIN LATER' : state.toUpperCase();
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:38px 0 9px;color:#8a9588;font:800 9px/1.2 Arial,sans-serif;letter-spacing:1.2px">${eyebrow}</td></tr><tr><td style="padding:0 0 25px;color:#354138;font:700 13px/1.55 Arial,sans-serif">${escapeHtml(stateCopy[key][state])}</td></tr></table>`;
  };

  const weatherContent = (extreme: boolean) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="61" valign="middle" style="padding-top:42px">${imageTag(icons.weatherLarge, 'Partly cloudy', 58, 'weather-image')}</td><td width="76" valign="middle" style="padding:42px 8px 0 7px;border-right:1px solid #dce3da;color:#263923;font:800 45px/.9 Arial,sans-serif;letter-spacing:-3px">18°</td><td valign="middle" style="padding:42px 0 0 13px"><div style="color:#334037;font:800 12px/1.2 Arial,sans-serif">Warsaw</div><div style="padding-top:7px;color:#879286;font:400 10px/1.2 Arial,sans-serif">Wind 6 km/h</div><div style="padding-top:7px;color:#879286;font:400 10px/1.2 Arial,sans-serif">Rain 20%</div><div style="padding-top:7px;color:#879286;font:400 10px/1.2 Arial,sans-serif">Partly cloudy</div></td></tr><tr><td colspan="2" style="padding:9px 0 0 9px"><span style="color:#c26b58;font:700 11px/1 Arial,sans-serif">↑&nbsp; 23°</span><span style="padding-left:14px;color:#6b83ac;font:700 11px/1 Arial,sans-serif">↓&nbsp; 14°</span></td><td style="padding-top:9px"></td></tr>${extreme ? '<tr><td colspan="3" style="padding-top:15px;color:#687467;font:400 10px/1.45 Arial,sans-serif">Clouds break around noon before a breezy, brighter afternoon.</td></tr>' : ''}</table>`;

  const commuteRows = (extreme: boolean) => {
    const routes = extreme
      ? [
          ['Rondo Daszyńskiego office and client workshop', '58', '#b24b3f', 'red'],
          ['Warsaw Chopin Airport — departures', '34', '#c18b24', 'yellow'],
          ['Żoliborz coworking studio', '26', '#4d7a53', 'green'],
          ['Primary school afternoon pickup', '41', '#b24b3f', 'red'],
          ['Mokotów physiotherapy clinic', '23', '#4d7a53', 'green']
        ]
      : [
          ['Office', '24', '#4d7a53', 'green'],
          ['Gym', '31', '#c18b24', 'yellow']
        ];
    if (!extreme) {
      return `<tr><td colspan="3" style="padding-top:17px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="28">${imageTag(icons.house, '', 25, 'content-image')}</td><td width="70" style="padding-left:7px"><div style="color:#354239;font:800 11px/1.2 Arial,sans-serif">Home</div><div style="padding-top:5px;color:#929b91;font:400 9px/1.2 Arial,sans-serif">Mokotów</div></td><td align="center" style="padding:0 3px;color:#6e8ab5;font:400 34px/1 Arial,sans-serif;white-space:nowrap">⟶</td><td width="28" style="padding-left:5px">${imageTag(icons.pin, '', 25, 'content-image')}</td><td width="104" style="padding-left:7px"><div style="color:#354239;font:800 11px/1.2 Arial,sans-serif">Office</div><div style="padding-top:5px;color:#929b91;font:400 9px/1.2 Arial,sans-serif;white-space:nowrap">Rondo Daszyńskiego</div></td></tr></table></td></tr>`;
    }
    return routes.map(([name, minutes, color, level], index) => `<tr><td style="padding:${index === 0 ? '14px' : '10px'} 0 0;color:#354239;font:700 10px/1.35 Arial,sans-serif">${escapeHtml(name)}</td><td align="right" style="padding:${index === 0 ? '14px' : '10px'} 0 0;color:${color};font:800 13px/1 Arial,sans-serif"><span class="sr-only" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden">${level} traffic, </span>${minutes} min</td></tr>`).join('');
  };

  const commuteContent = (extreme: boolean) => extreme
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td colspan="2" style="padding-top:25px;color:#4f8a57;font:800 35px/.9 Arial,sans-serif;letter-spacing:-2px">5 <span style="font-size:11px;letter-spacing:0">routes</span></td></tr>${commuteRows(true)}</table>`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding-top:39px;color:#4f8a57;font:800 50px/.85 Arial,sans-serif;letter-spacing:-4px">24<span style="display:inline-block;margin-left:6px;font-size:13px;letter-spacing:0">min</span></td></tr>${commuteRows(false)}</table>`;

  const calendarContent = (extreme: boolean) => {
    const events = extreme
      ? [
          ['TODAY · 09:00', 'Quarterly planning workshop with the entire product and operations group'],
          ['TODAY · ALL DAY', 'Marta’s birthday'],
          ['MON · 08:30', 'Dentist appointment and follow-up consultation'],
          ['TUE · 13:00', 'Platform reliability review'],
          ['WED · 17:45', 'Parent meeting at primary school'],
          ['THU · 10:15', 'Budget review with external accounting partner'],
          ['FRI · 18:30', 'Dinner reservation · Stary Dom']
        ]
      : [
          ['SUN · 09:30', 'Design sync'],
          ['MON · 14:00', 'Dentist appointment'],
          ['THU · 18:30', 'Dinner with Marta']
        ];
    const days = [['SUN', '2'], ['MON', '3'], ['TUE', '4'], ['WED', '5'], ['THU', '6'], ['FRI', '7'], ['SAT', '8']];
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${days.map(([day, date], index) => `<td align="center" width="14.28%" style="padding-top:25px;color:${index === 0 ? '#587542' : '#8b958a'};font:800 8px/1.2 Arial,sans-serif;letter-spacing:.8px">${day}<span style="display:block;width:25px;height:25px;margin:6px auto 0;border-radius:50%;background:${index === 0 ? '#587542' : 'transparent'};color:${index === 0 ? '#fff' : '#6e796d'};font:800 11px/25px Arial,sans-serif;letter-spacing:0">${date}</span></td>`).join('')}</tr><tr><td colspan="7" style="padding-top:18px">${events.map(([when, title]) => {
      const [day, time] = when.split(' · ');
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td colspan="2" style="padding:${extreme ? '4px' : '5px'} 0 5px;color:#8b958a;font:800 8px/1.2 Arial,sans-serif;letter-spacing:.8px">${day}</td></tr><tr><td width="${extreme ? '42' : '29'}" valign="top" style="color:#8b958a;font:400 9px/1.35 Arial,sans-serif;white-space:nowrap">${time}</td><td valign="top" style="padding-left:4px;color:#344037;font:700 ${extreme ? '9px' : '10px'}/1.35 Arial,sans-serif">${escapeHtml(title)}</td></tr></table>`;
    }).join('')}</td></tr></table>`;
  };

  const todoContent = (extreme: boolean) => {
    const groups = extreme
      ? [
          ['UNCATEGORIZED', ['Renew passport before the autumn trip', 'Call building administrator about the basement leak']],
          ['WORK', ['Send revised proposal to international partners', 'Prepare interview notes for the engineering candidate', 'Review the third-quarter infrastructure estimate']],
          ['PERSONAL', ['Book annual health check', 'Order replacement filter for the kitchen tap', 'Return library books and collect reserved title']]
        ]
      : [
          ['WORK', ['Send revised proposal']],
          ['PERSONAL', ['Book dentist appointment']],
          ['ERRANDS', ['Pick up the parcel']]
        ];
    return groups.map(([group, tasks], groupIndex) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:${groupIndex === 0 ? '25px' : extreme ? '12px' : '18px'} 0 5px;color:#647061;font:800 10px/1.2 Arial,sans-serif;letter-spacing:.9px">${group}</td></tr>${(tasks as string[]).map((task, index) => {
      const urgencyIndex = extreme ? index : groupIndex;
      const dotColor = urgencyIndex === 0 ? '#c76856' : urgencyIndex === 1 ? '#d6a52d' : '#91a1a2';
      return `<tr><td style="padding:5px 0 5px 27px;color:#354138;font:700 ${extreme ? '9px' : '10px'}/1.35 Arial,sans-serif"><span aria-label="${urgencyIndex === 0 ? 'High' : urgencyIndex === 1 ? 'Medium' : 'Low'} urgency" style="display:inline-block;width:8px;height:8px;margin-left:-22px;margin-right:10px;border:${urgencyIndex === 2 ? `1.5px solid ${dotColor}` : '0'};border-radius:50%;background:${urgencyIndex === 2 ? 'transparent' : dotColor};vertical-align:middle"></span>${escapeHtml(task)}</td></tr>`;
    }).join('')}</table>`).join('');
  };

  const sectionContent = (key: SectionKey, state: SectionState, extreme: boolean) => {
    if (state !== 'active') return statePanel(key, state);
    if (key === 'weather') return weatherContent(extreme);
    if (key === 'commute') return commuteContent(extreme);
    if (key === 'calendar') return calendarContent(extreme);
    return todoContent(extreme);
  };

  const sectionCell = (key: SectionKey, title: string, state: SectionState, extreme: boolean) => `<td class="stack" width="50%" valign="top" style="width:50%;padding:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td class="cell" valign="top" style="min-height:237px;padding:27px 30px 30px;border:1px solid #dfe5dc;background:#fbfcfa"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="22">${imageTag(icons[key], '', 18, 'content-image')}</td><td style="padding-left:8px;color:${key === 'commute' ? '#63799b' : '#5b7750'};font:800 10px/1.2 Arial,sans-serif;letter-spacing:1px;text-transform:uppercase">${title}</td>${key === 'calendar' ? '<td align="right" style="color:#8c958a;font:800 8px/1.2 Arial,sans-serif;letter-spacing:.8px">WEEK 31</td>' : ''}</tr></table>${sectionContent(key, state, extreme)}</td></tr></table></td>`;

  const buildEmailHtml = (prototypeCase: PrototypeCase, blockImages: boolean) => {
    const extreme = prototypeCase === cases.extremes;
    const s = prototypeCase.states;
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media only screen and (max-width:620px){.shell{width:100%!important}.stack{display:block!important;width:100%!important}.cell{height:auto!important;min-height:0!important;padding:24px 22px 28px!important}.header-cell{padding:25px 22px!important}.desktop-greeting{display:none!important}.mobile-greeting-row{display:table-row!important}.header-greeting{font-size:23px!important}.footer-cell{padding:20px 22px!important}}${blockImages ? '.weather-image,.content-image{display:none!important}' : ''}</style></head><body style="margin:0;padding:0;background:#f5f7f3"><div style="display:none;max-height:0;overflow:hidden;color:#f5f7f3">Weather, commute, calendar, and todo for Friday 31 July.</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f5f7f3"><tr><td align="center" style="padding:18px 10px"><table role="presentation" class="shell" width="680" cellpadding="0" cellspacing="0" style="width:680px;max-width:680px;border-collapse:collapse;background:#fbfcfa"><tr><td class="header-cell" style="padding:27px 34px 26px;border-bottom:1px solid #dfe5dc;background:#fbfcfa;color:#263129"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="31%" valign="top"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="25" height="25" align="center" style="border-radius:7px;background:#587542;color:#fff;font:800 14px/25px Arial,sans-serif">D</td><td style="padding-left:9px;color:#263129;font:800 14px/25px Arial,sans-serif">Daily</td></tr></table></td><td class="desktop-greeting" width="45%" valign="top"><div class="header-greeting" style="color:#263129;font:400 25px/1.05 Arial,sans-serif;letter-spacing:-1px">Good morning, Alex</div><div style="padding-top:7px;color:#7d887c;font:400 11px/1.2 Arial,sans-serif">Friday, 31 July</div></td><td width="24%" align="right" valign="top" style="padding-top:4px;color:#919a90;font:400 10px/1 Arial,sans-serif">07:00</td></tr><tr class="mobile-greeting-row" style="display:none"><td colspan="3" style="padding-top:22px"><div class="header-greeting" style="color:#263129;font:400 25px/1.05 Arial,sans-serif;letter-spacing:-1px">Good morning, Alex</div><div style="padding-top:7px;color:#7d887c;font:400 11px/1.2 Arial,sans-serif">Friday, 31 July</div></td></tr></table></td></tr><tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${sectionCell('weather', 'Weather', s.weather, extreme)}${sectionCell('commute', 'Commute', s.commute, extreme)}</tr><tr>${sectionCell('calendar', 'Calendar', s.calendar, extreme)}${sectionCell('todo', 'Todo', s.todo, extreme)}</tr></table></td></tr><tr><td class="footer-cell" style="padding:20px 34px 22px;border-top:1px solid #dfe5dc;background:#fbfcfa;color:#a0aaa0;font:400 10px/1.5 Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td>Daily · Europe/Warsaw</td><td align="right"><a href="https://example.com" style="color:#587542;font-weight:800;text-decoration:none">Open Daily ↗</a></td></tr></table></td></tr></table></td></tr></table></body></html>`;
  };

  const stateText = (key: SectionKey, state: SectionState) => state === 'active' ? '' : stateCopy[key][state];
  const buildText = (prototypeCase: PrototypeCase) => {
    const extreme = prototypeCase === cases.extremes;
    const s = prototypeCase.states;
    const weather = s.weather === 'active' ? `18°C · Partly cloudy · Warsaw\nHigh 23° · Low 14° · Rain 20% · Wind 18 km/h\n${extreme ? 'Clouds break around noon before a breezy, brighter afternoon.' : 'A mild, partly cloudy start with a brighter afternoon.'}` : stateText('weather', s.weather);
    const commute = s.commute === 'active' ? (extreme ? 'Rondo Daszyńskiego office and client workshop: 58 min · red traffic\nWarsaw Chopin Airport — departures: 34 min · yellow traffic\nŻoliborz coworking studio: 26 min · green traffic\nPrimary school afternoon pickup: 41 min · red traffic\nMokotów physiotherapy clinic: 23 min · green traffic' : 'Office: 24 min · green traffic\nGym: 31 min · yellow traffic') : stateText('commute', s.commute);
    const calendar = s.calendar === 'active' ? (extreme ? 'Today 09:00 · Quarterly planning workshop with the entire product and operations group\nToday All day · Marta’s birthday\nMonday 08:30 · Dentist appointment and follow-up consultation\nTuesday 13:00 · Platform reliability review\nWednesday 17:45 · Parent meeting at primary school\nThursday 10:15 · Budget review with external accounting partner\nFriday 18:30 · Dinner reservation · Stary Dom' : 'Today 09:30 · Design sync\nMonday 14:00 · Dentist appointment\nThursday 18:30 · Dinner with Marta') : stateText('calendar', s.calendar);
    const todo = s.todo === 'active' ? (extreme ? '[High urgency] Renew passport before the autumn trip\n[Medium urgency] Call building administrator about the basement leak\n\nWORK\n[High urgency] Send revised proposal to international partners\n[Medium urgency] Prepare interview notes for the engineering candidate\n[Low urgency] Review the third-quarter infrastructure estimate\n\nPERSONAL\n[High urgency] Book annual health check\n[Medium urgency] Order replacement filter for the kitchen tap\n[Low urgency] Return library books and collect reserved title' : 'WORK\n[High urgency] Send revised proposal\n\nPERSONAL\n[Medium urgency] Book dentist appointment\n\nERRANDS\n[Low urgency] Pick up the parcel') : stateText('todo', s.todo);
    return `DAILY\nGood morning, Alex\nFriday, 31 July · 07:00 · Europe/Warsaw\n\nWEATHER\n${weather}\n\nCOMMUTE\n${commute}\n\nCALENDAR · WEEK AHEAD\n${calendar}\n\nTODO\n${todo}\n\nOpen Daily: https://example.com`;
  };

  const emailHtml = $derived(buildEmailHtml(selectedCase, mode === 'blocked'));
  const plainText = $derived(buildText(selectedCase));
</script>

<svelte:head>
  <title>Production-fidelity Daily Grid prototype</title>
  <meta name="description" content="Throwaway validation harness for the production Daily Grid email." />
</svelte:head>

<main class="lab">
  <header class="lab-header">
    <div>
      <p class="eyebrow">Prototype · production-fidelity validation</p>
      <h1>Does the Daily Grid hold?</h1>
      <p>{selectedCase.description}</p>
    </div>
    <div class="coverage" aria-label="Section state coverage">
      {#each Object.entries(selectedCase.states) as [section, state]}
        <span><b>{section}</b> {state}</span>
      {/each}
    </div>
  </header>

  <nav class="view-controls" aria-label="Email validation views">
    <div class="control-group" aria-label="Presentation mode">
      {#each ['html', 'blocked', 'text'] as option}
        <button class:active={mode === option} type="button" onclick={() => setQuery('mode', option)}>{option === 'blocked' ? 'Images blocked' : option}</button>
      {/each}
    </div>
    {#if mode !== 'text'}
      <div class="control-group" aria-label="Preview width">
        {#each ['wide', 'narrow'] as option}
          <button class:active={width === option} type="button" onclick={() => setQuery('width', option)}>{option}</button>
        {/each}
      </div>
    {/if}
  </nav>

  <section class:preview-narrow={width === 'narrow'} class="preview" aria-label={`${selectedCase.name} ${mode} preview`}>
    {#if mode === 'text'}
      <pre>{plainText}</pre>
    {:else}
      <iframe title={`${selectedCase.name} email`} srcdoc={emailHtml}></iframe>
    {/if}
  </section>

  <aside class="verdict-prompt">
    <strong>Review question</strong>
    <span>Does the hierarchy remain clear in this case, or is any section too loud, too quiet, or ambiguous?</span>
  </aside>
</main>

{#if dev}
  <nav class="case-switcher" aria-label="Prototype cases">
    <button aria-label="Previous case" onclick={() => cycleCase(-1)}>←</button>
    <div><span>{caseKeys.indexOf(caseKey) + 1} / {caseKeys.length}</span><strong>{selectedCase.name}</strong></div>
    <button aria-label="Next case" onclick={() => cycleCase(1)}>→</button>
  </nav>
{/if}

<style>
  :global(body) { margin: 0; background: #e8ece6; color: #202820; font-family: ui-sans-serif, system-ui, sans-serif; }
  :global(*) { box-sizing: border-box; }
  button { font: inherit; }
  .lab { min-height: 100vh; padding: 36px 24px 120px; }
  .lab-header, .view-controls, .preview, .verdict-prompt { width: min(100%, 1120px); margin-inline: auto; }
  .lab-header { display: flex; justify-content: space-between; align-items: end; gap: 36px; margin-bottom: 24px; }
  .eyebrow { margin: 0 0 9px; color: #587542; font-size: 10px; font-weight: 850; letter-spacing: .14em; text-transform: uppercase; }
  h1 { margin: 0; font-size: clamp(28px, 4vw, 44px); letter-spacing: -.055em; line-height: 1; }
  .lab-header p:last-child { margin: 11px 0 0; color: #667164; font-size: 13px; }
  .coverage { display: grid; grid-template-columns: repeat(2, auto); gap: 6px 15px; padding: 13px 15px; border: 1px solid #ccd3c9; border-radius: 10px; background: #f7f8f5; color: #697368; font-size: 10px; }
  .coverage span { display: flex; justify-content: space-between; gap: 10px; }.coverage b { color: #2d382e; text-transform: capitalize; }
  .view-controls { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 13px; }
  .control-group { display: flex; gap: 3px; padding: 3px; border: 1px solid #cbd2c8; border-radius: 9px; background: #f4f6f2; }
  .control-group button { border: 0; border-radius: 6px; padding: 8px 12px; background: transparent; color: #6e786d; font-size: 10px; font-weight: 800; text-transform: uppercase; cursor: pointer; }.control-group button.active { background: #2d382f; color: #f5f7f2; }
  .preview { min-height: 780px; padding: 26px; overflow: auto; border: 1px solid #cbd2c8; border-radius: 16px; background: #dfe4dc; box-shadow: 0 26px 70px rgba(40, 51, 41, .12); }
  .preview iframe { display: block; width: 100%; min-height: 1250px; margin: 0 auto; border: 0; background: #eef1ec; }.preview.preview-narrow iframe { width: 390px; max-width: 100%; min-height: 1950px; }
  .preview pre { width: min(100%, 680px); min-height: 720px; margin: 0 auto; padding: 34px; white-space: pre-wrap; background: #fff; color: #202620; font: 13px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace; box-shadow: 0 7px 22px rgba(40, 51, 41, .1); }
  .verdict-prompt { display: flex; gap: 16px; margin-top: 15px; padding: 14px 16px; border: 1px solid #d1d8ce; background: rgba(255,255,255,.55); color: #5e695e; font-size: 12px; }.verdict-prompt strong { color: #2b352c; white-space: nowrap; }
  .case-switcher { position: fixed; z-index: 20; left: 50%; bottom: 22px; transform: translateX(-50%); display: grid; grid-template-columns: 42px minmax(190px, auto) 42px; align-items: center; padding: 5px; border-radius: 14px; background: #202922; color: #f4f6f1; box-shadow: 0 14px 35px rgba(29, 37, 31, .28); }
  .case-switcher button { width: 42px; height: 42px; border: 0; border-radius: 10px; background: transparent; color: #d8e0d4; cursor: pointer; }.case-switcher button:hover { background: #354138; }
  .case-switcher div { display: flex; flex-direction: column; gap: 2px; padding: 0 9px; }.case-switcher span { color: #9eaa9c; font-size: 9px; }.case-switcher strong { font-size: 11px; }
  @media (max-width: 720px) { .lab { padding: 24px 10px 112px; }.lab-header { display: block; }.coverage { margin-top: 18px; }.view-controls { align-items: stretch; flex-direction: column; }.control-group { justify-content: center; }.preview { padding: 8px; border-radius: 11px; }.preview pre { padding: 22px 17px; }.verdict-prompt { align-items: flex-start; flex-direction: column; gap: 5px; } }
</style>
