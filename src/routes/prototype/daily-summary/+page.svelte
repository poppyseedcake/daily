<!--
  PROTOTYPE — three Daily Summary email directions based on supplied briefing references,
  switchable with ?variant=.

  A / MORNING BRIEF: icon-led, editorial stack of four useful sections.
  B / DAILY GRID: one connected four-quadrant planning sheet.
  C / DAY STACK: a compact, vertical day sequence for narrow screens.
-->

<script lang="ts">
  import { dev } from '$app/environment';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import {
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    CalendarDays,
    Check,
    ChevronLeft,
    ChevronRight,
    CloudSun,
    ExternalLink,
    House,
    ListTodo,
    MapPin,
    Route
  } from '@lucide/svelte';

  type Variant = 'a' | 'b' | 'c';

  const variants: Array<{ key: Variant; name: string; description: string }> = [
    { key: 'a', name: 'Morning Brief', description: 'reference one · section stack' },
    { key: 'b', name: 'Daily Grid', description: 'reference two · planning sheet' },
    { key: 'c', name: 'Day Stack', description: 'hybrid · vertical sequence' }
  ];

  const tasks = [
    { title: 'Send revised proposal', category: 'Work', urgency: 'High' },
    { title: 'Book dentist appointment', category: 'Personal', urgency: 'Medium' },
    { title: 'Pick up the parcel', category: 'Errands', urgency: '' }
  ];

  const weather = { current: '18°', high: '23°', low: '14°' };

  const todoGroups = Array.from(new Set(tasks.map((task) => task.category)))
    .map((category) => ({
      category,
      tasks: tasks.filter((task) => task.category === category)
    }))
    .filter((group) => group.tasks.length > 0);

  const urgencyLabel = (urgency: string) => urgency || 'Low';
  const urgencyClass = (urgency: string) => `${urgencyLabel(urgency).toLowerCase()}-dot`;

  const tasksPerPage = 2;
  type TodoGroup = (typeof todoGroups)[number];
  let taskPages = $state<Record<string, number>>({});

  const taskPageCount = (group: TodoGroup) => Math.max(1, Math.ceil(group.tasks.length / tasksPerPage));
  const taskPage = (category: string) => taskPages[category] ?? 0;
  const visibleTasks = (group: TodoGroup) => {
    const page = Math.min(taskPage(group.category), taskPageCount(group) - 1);
    const start = page * tasksPerPage;
    return group.tasks.slice(start, start + tasksPerPage);
  };
  const setTaskPage = (category: string, page: number) => {
    taskPages[category] = page;
  };

  const calendarToday = new Date();
  calendarToday.setHours(0, 0, 0, 0);
  const calendarDayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
  const calendarDateKey = (date: Date) =>
    [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  const addCalendarDays = (date: Date, days: number) => {
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + days);
    return nextDate;
  };
  const calendarDays = Array.from({ length: 7 }, (_, index) => {
    const date = addCalendarDays(calendarToday, index);
    return {
      key: calendarDateKey(date),
      label: calendarDayFormatter.format(date).toUpperCase(),
      day: date.getDate(),
      isToday: index === 0
    };
  });
  const calendarWeekNumber = (() => {
    const date = new Date(Date.UTC(calendarToday.getFullYear(), calendarToday.getMonth(), calendarToday.getDate()));
    const dayNumber = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNumber);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  })();
  const events = [
    { dayOffset: 0, time: '09:30', title: 'Design sync', detail: 'Google Meet', color: '#4f6f9f' },
    { dayOffset: 2, time: '14:00', title: 'Dentist appointment', detail: 'Marszałkowska 18', color: '#d6a52d' },
    { dayOffset: 5, time: '18:30', title: 'Dinner with Marta', detail: 'Personal', color: '#617d49' }
  ].map((event) => {
    const date = addCalendarDays(calendarToday, event.dayOffset);
    return {
      ...event,
      date: calendarDateKey(date),
      dayLabel: calendarDayFormatter.format(date).toUpperCase()
    };
  });
  const weekEvents = events.filter((event) => calendarDays.some((day) => day.key === event.date));

  const requestedVariant = $derived(page.url.searchParams.get('variant')?.toLowerCase());
  const variant = $derived<Variant>(
    requestedVariant === 'b' || requestedVariant === 'c' ? requestedVariant : 'a'
  );
  const variantIndex = $derived(variants.findIndex((item) => item.key === variant));

  const setVariant = (next: Variant) => {
    const nextUrl = new URL(page.url);
    nextUrl.searchParams.set('variant', next);
    replaceState(nextUrl, page.state);
  };

  const cycleVariant = (direction: -1 | 1) => {
    const nextIndex = (variantIndex + direction + variants.length) % variants.length;
    setVariant(variants[nextIndex].key);
  };

  const handleKeydown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === 'ArrowLeft') cycleVariant(-1);
    if (event.key === 'ArrowRight') cycleVariant(1);
  };
</script>

<svelte:head>
  <title>Daily Summary prototypes</title>
  <meta name="description" content="Daily Summary email prototypes." />
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<main class="summary-lab">
  <div class="lab-header">
    <div>
      <p class="lab-kicker">Daily / email directions</p>
      <h1>Briefing, in Daily.</h1>
    </div>
    <p class="lab-note">synthetic example data</p>
  </div>

  <div class="preview-stage">
    <div class="mail-chrome">
      <div class="chrome-dots" aria-hidden="true"><span></span><span></span><span></span></div>
      <div class="chrome-subject">Your Daily Summary · Friday, 31 July</div>
      <div class="chrome-meta">to Alex · 07:00</div>
    </div>

    {#if variant === 'a'}
      <article class="email email-a" aria-label="Morning Brief email prototype">
        <header class="a-head">
          <div class="a-brand"><span class="brand-mark">D</span><span>Daily</span></div>
          <time>07:00</time>
          <h2>Good morning, Alex</h2>
          <p>Friday, 31 July</p>
        </header>

        <section class="a-section weather-section" aria-label="Weather">
          <div class="a-icon weather-icon"><CloudSun size={24} strokeWidth={1.7} /></div>
          <div class="a-section-copy"><h3>Weather</h3><p>Partly cloudy · Warsaw</p><small>Feels like 18° · Wind 6 km/h</small></div>
          <strong class="a-value">18°</strong>
        </section>

        <section class="a-section" aria-label="Commute">
          <div class="a-icon route-icon"><Route size={23} strokeWidth={1.7} /></div>
          <div class="a-section-copy"><h3>Commute</h3><p>24 min to Rondo Daszyńskiego</p><small>via Route S79 · Light traffic</small></div>
          <span class="a-time">08:55</span>
        </section>

        <section class="a-section agenda-section" aria-label="Calendar">
          <div class="a-icon calendar-icon"><CalendarDays size={22} strokeWidth={1.7} /></div>
          <div class="a-section-copy"><h3>Calendar</h3><div class="a-event-list">{#each events as event}<div><time>{event.time}</time><span>{event.title}</span></div>{/each}</div></div>
        </section>

        <section class="a-section todo-section" aria-label="Todo Tasks">
          <div class="a-icon todo-icon"><ListTodo size={23} strokeWidth={1.7} /></div>
          <div class="a-section-copy"><h3>Todo</h3><div class="a-task-list">{#each tasks as task}<div><span class="mini-check"><Check size={10} /></span><span>{task.title}</span></div>{/each}</div></div>
        </section>

        <footer class="email-footer a-footer"><span>Daily · Europe/Warsaw</span><a href="/">Open Daily <ExternalLink size={12} /></a></footer>
      </article>
    {:else if variant === 'b'}
      <article class="email email-b" aria-label="Daily Grid email prototype">
        <header class="b-head">
          <div class="b-brand"><span class="brand-mark">D</span><span>Daily</span></div>
          <div><h2>Good morning, Alex</h2><p>Friday, 31 July</p></div>
          <time>07:00</time>
        </header>

        <div class="b-grid">
          <section class="b-cell b-weather" aria-label="Weather">
            <div class="b-cell-title"><CloudSun size={18} /><span>Weather</span></div>
            <div class="b-weather-main"><CloudSun class="b-weather-icon" size={46} strokeWidth={1.35} /><strong>{weather.current}</strong><div><span>Warsaw</span><small>Wind 6 km/h</small><small>Partly cloudy</small></div><div class="b-temp-range" aria-label={`Daily temperature range: maximum ${weather.high}, minimum ${weather.low}`}><span class="b-temp-high"><ArrowUp size={11} /><strong>{weather.high}</strong></span><span class="b-temp-low"><ArrowDown size={11} /><strong>{weather.low}</strong></span></div></div>
          </section>
          <section class="b-cell b-commute" aria-label="Commute">
            <div class="b-cell-title"><Route size={18} /><span>Commute</span></div>
            <div class="b-commute-main">
              <div class="b-commute-result b-traffic-clear"><strong>24</strong><span>min</span></div>
              <div class="b-commute-route" role="img" aria-label="24 minutes from Home in Mokotów to Office in Rondo Daszyńskiego">
                <div class="b-commute-stop"><House size={21} strokeWidth={1.7} aria-hidden="true" /><span><strong>Home</strong><small>Mokotów</small></span></div>
                <div class="b-commute-connector" aria-hidden="true"><ArrowRight class="b-route-arrow" size={17} strokeWidth={1.6} /></div>
                <div class="b-commute-stop b-commute-stop-destination"><MapPin size={21} strokeWidth={1.7} aria-hidden="true" /><span><strong>Office</strong><small>Rondo Daszyńskiego</small></span></div>
              </div>
            </div>
          </section>
          <section class="b-cell b-calendar" aria-label="Calendar">
            <div class="b-cell-title"><CalendarDays size={18} /><span>Calendar</span><small class="b-week-number">WEEK {calendarWeekNumber}</small></div>
            <div class="b-week" aria-label="Next seven days">
              {#each calendarDays as day}
                <span class:today={day.isToday} aria-current={day.isToday ? 'date' : undefined}>{day.label}<br />{#if day.isToday}<strong>{day.day}</strong>{:else}<small>{day.day}</small>{/if}</span>
              {/each}
            </div>
            <div class="b-events" aria-label="Calendar events this week">
              {#each weekEvents as event}
                <div>
                  <span class="b-event-day">{event.dayLabel}</span>
                  <div class="b-event-line"><time>{event.time}</time><strong>{event.title}</strong></div>
                </div>
              {/each}
            </div>
          </section>
          <section class="b-cell b-todo" aria-label="Todo Tasks">
            <div class="b-cell-title"><ListTodo size={18} /><span>Todo</span></div>
            <div class="b-task-groups">
              {#each todoGroups as group}
                <section class="b-task-group" aria-label={`${group.category} tasks`}>
                  <div class="b-group-heading"><span>{group.category}</span></div>
                  <div class="b-task-list">
                    {#each visibleTasks(group) as task}
                      <div class="b-priority b-task-row">
                        <span class={urgencyClass(task.urgency)} role="img" aria-label={`${urgencyLabel(task.urgency)} priority`}></span>
                        <strong>{task.title}</strong>
                      </div>
                    {/each}
                  </div>
                  {#if taskPageCount(group) > 1}
                    <nav class="b-task-pagination" aria-label={`${group.category} task pages`}>
                      <button type="button" class="b-page-arrow" aria-label={`Previous ${group.category} tasks`} disabled={taskPage(group.category) === 0} onclick={() => setTaskPage(group.category, Math.max(0, taskPage(group.category) - 1))}><ChevronLeft size={12} /></button>
                      <div class="b-page-dots">
                        {#each Array(taskPageCount(group)) as _, pageIndex}
                          <button type="button" class:active={taskPage(group.category) === pageIndex} class="b-page-dot" aria-label={`${group.category} task page ${pageIndex + 1}`} aria-current={taskPage(group.category) === pageIndex ? 'page' : undefined} onclick={() => setTaskPage(group.category, pageIndex)}></button>
                        {/each}
                      </div>
                      <button type="button" class="b-page-arrow" aria-label={`Next ${group.category} tasks`} disabled={taskPage(group.category) === taskPageCount(group) - 1} onclick={() => setTaskPage(group.category, Math.min(taskPageCount(group) - 1, taskPage(group.category) + 1))}><ChevronRight size={12} /></button>
                    </nav>
                  {/if}
                </section>
              {/each}
            </div>
          </section>
        </div>

        <footer class="email-footer b-footer"><span>Daily · Europe/Warsaw</span><a href="/">Open Daily <ExternalLink size={12} /></a></footer>
      </article>
    {:else}
      <article class="email email-c" aria-label="Day Stack email prototype">
        <header class="c-head">
          <div class="c-brand"><span class="brand-mark">D</span><span>Daily</span></div>
          <div class="c-date"><strong>31</strong><span>FRI<br />JUL</span></div>
          <time>07:00</time>
        </header>

        <div class="c-greeting"><h2>Good morning, Alex</h2><span><MapPin size={13} /> Warsaw</span></div>

        <div class="c-stack">
          <section class="c-row c-weather-row" aria-label="Weather"><div class="c-rail-icon"><CloudSun size={21} /></div><div class="c-row-main"><strong>18°</strong><span>Partly cloudy</span></div><small>Feels 18°<br />Wind 6 km/h</small></section>
          <section class="c-row c-commute-row" aria-label="Commute"><div class="c-rail-icon"><Route size={20} /></div><div class="c-row-main"><strong>24 min</strong><span>Rondo Daszyńskiego</span></div><small>Route S79<br />08:55</small></section>
          <section class="c-row c-calendar-row" aria-label="Calendar"><div class="c-rail-icon"><CalendarDays size={20} /></div><div class="c-row-main c-agenda-main"><strong>Calendar</strong>{#each events as event}<div><time>{event.time}</time><i style={`--event-color:${event.color}`}></i><span>{event.title}</span></div>{/each}</div></section>
          <section class="c-row c-todo-row" aria-label="Todo Tasks"><div class="c-rail-icon"><ListTodo size={20} /></div><div class="c-row-main c-todo-main"><strong>Todo</strong>{#each tasks as task}<div><span class="mini-check"><Check size={10} /></span><span>{task.title}</span>{#if task.urgency}<em>{task.urgency}</em>{/if}</div>{/each}</div></section>
        </div>

        <footer class="email-footer c-footer"><span>Daily · Europe/Warsaw</span><a href="/">Open Daily <ExternalLink size={12} /></a></footer>
      </article>
    {/if}
  </div>

  <p class="lab-caption">{variants[variantIndex].description}</p>
</main>

{#if dev}
  <nav class="prototype-switcher" aria-label="Prototype variants">
    <button class="switch-arrow" aria-label="Previous variant" onclick={() => cycleVariant(-1)}><ArrowLeft size={17} /></button>
    <div class="switch-label"><span class="switch-key">{variant.toUpperCase()}</span><span><strong>{variants[variantIndex].name}</strong><small>← →</small></span></div>
    <button class="switch-arrow" aria-label="Next variant" onclick={() => cycleVariant(1)}><ArrowRight size={17} /></button>
  </nav>
{/if}

<style>
  :global(body) { background: #f6f3ed; color: #18201c; }
  :global(*) { box-sizing: border-box; }

  .summary-lab { min-height: 100vh; padding: 34px 24px 108px; }
  .lab-header, .preview-stage, .lab-caption { width: min(100%, 1060px); margin: 0 auto; }
  .lab-header { display: flex; align-items: end; justify-content: space-between; gap: 28px; margin-bottom: 24px; }
  .lab-kicker { margin: 0 0 9px; color: #587542; font-size: 10px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
  .lab-header h1 { margin: 0; font-size: clamp(27px, 3vw, 37px); letter-spacing: -.05em; line-height: 1; font-weight: 760; }
  .lab-note { margin: 0 0 2px; color: #8a9388; font-size: 11px; }
  .preview-stage { overflow: hidden; border: 1px solid #d6dad2; border-radius: 16px; background: #fff; box-shadow: 0 24px 70px rgba(49, 59, 47, .11), 0 2px 7px rgba(49, 59, 47, .07); }
  .mail-chrome { display: grid; grid-template-columns: 82px 1fr auto; align-items: center; min-height: 43px; padding: 0 17px; border-bottom: 1px solid #e5e8e2; background: #fbfcfa; color: #8b928a; font-size: 11px; }
  .chrome-dots { display: flex; gap: 5px; }.chrome-dots span { width: 7px; height: 7px; border-radius: 50%; background: #d7ddd5; }.chrome-subject { color: #596257; font-weight: 650; }.chrome-meta { color: #9aa29a; }
  .email { max-width: 790px; margin: 0 auto; overflow: hidden; }.brand-mark { display: grid; place-items: center; width: 25px; height: 25px; border-radius: 7px; background: #587542; color: #fff; font-size: 14px; font-weight: 800; }
  .email-footer { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 20px 40px 23px; font-size: 10px; }.email-footer a { display: inline-flex; align-items: center; gap: 5px; color: inherit; font-weight: 750; text-decoration: none; }
  .mini-check { display: grid; place-items: center; flex: 0 0 auto; width: 16px; height: 16px; border: 1px solid #9bad97; border-radius: 50%; color: #69895b; }

  /* A — Morning Brief */
  .email-a { color: #243025; background: #fff; }.a-head { display: grid; grid-template-columns: 1fr auto; gap: 13px; padding: 30px 40px 28px; }.a-brand { display: inline-flex; align-items: center; gap: 9px; font-size: 14px; font-weight: 800; }.a-head > time { justify-self: end; padding-top: 6px; color: #8b9489; font-size: 10px; }.a-head h2 { grid-column: 1 / -1; margin: 28px 0 0; font-size: 31px; letter-spacing: -.05em; line-height: 1; }.a-head p { grid-column: 1 / -1; margin: -3px 0 0; color: #697568; font-size: 13px; }
  .a-section { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: start; gap: 16px; margin: 0 40px; padding: 23px 0; border-top: 1px solid #dfe5dc; }.a-icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 9px; background: #eef3ea; color: #658553; }.route-icon { color: #617ca4; background: #edf1f7; }.calendar-icon { color: #7a6c9a; background: #f1eef6; }.todo-icon { color: #72876b; background: #f1f4ef; }.a-section-copy h3 { margin: 0 0 7px; font-size: 14px; letter-spacing: -.02em; }.a-section-copy > p { margin: 0; font-size: 12px; font-weight: 650; }.a-section-copy > small { display: block; margin-top: 5px; color: #788277; font-size: 10px; line-height: 1.4; }.a-value { color: #304329; font-size: 29px; letter-spacing: -.06em; }.a-time { padding-top: 4px; color: #718467; font-size: 11px; font-weight: 800; }.a-event-list, .a-task-list { display: grid; gap: 7px; }.a-event-list > div { display: flex; gap: 10px; color: #667267; font-size: 11px; }.a-event-list time { min-width: 35px; color: #859084; font-variant-numeric: tabular-nums; }.a-task-list > div { display: flex; align-items: center; gap: 8px; font-size: 11px; }.a-footer { margin-top: 3px; border-top: 1px solid #dfe5dc; color: #9ba49a; }.a-footer a { color: #587542; }

  /* B — Daily Grid */
  .email-b { color: #243025; background: #fbfcfa; }.b-head { display: grid; grid-template-columns: 1fr auto 1fr; align-items: start; gap: 20px; padding: 28px 40px; border-bottom: 1px solid #dfe5dc; }.b-brand { display: inline-flex; align-items: center; gap: 9px; padding-top: 2px; font-size: 14px; font-weight: 800; }.b-head h2 { margin: 0; font-size: 25px; letter-spacing: -.045em; line-height: 1.05; }.b-head p { margin: 6px 0 0; color: #748074; font-size: 11px; }.b-head > time { justify-self: end; color: #8b9489; font-size: 10px; }
  .b-grid { display: grid; grid-template-columns: 1fr 1fr; background: #dfe5dc; gap: 1px; }.b-cell { min-height: 237px; padding: 27px 30px; background: #fbfcfa; }.b-cell-title { display: flex; align-items: center; gap: 8px; color: #5b7750; font-size: 10px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }.b-weather-main { display: grid; grid-template-columns: 52px auto 1fr; align-items: center; gap: 10px; margin-top: 31px; }.b-weather-icon { color: #7b9c63; }.b-weather-main > strong { color: #263923; font-size: 45px; letter-spacing: -.08em; }.b-weather-main > div { display: grid; gap: 5px; border-left: 1px solid #d8e0d6; padding-left: 13px; }.b-weather-main span { font-size: 12px; font-weight: 700; }.b-weather-main small { color: #798479; font-size: 10px; }.b-commute .b-cell-title { color: #63799b; }.b-week { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; margin-top: 24px; color: #8c958a; font-size: 8px; font-weight: 800; letter-spacing: .08em; text-align: center; }.b-week small { color: #697568; font-size: 11px; letter-spacing: 0; }.b-week .today { color: #587542; }.b-week .today strong { display: grid; place-items: center; width: 25px; height: 25px; margin: 5px auto 0; border-radius: 50%; background: #587542; color: #fff; font-size: 12px; letter-spacing: 0; }.b-events { display: grid; gap: 12px; margin-top: 19px; }.b-events > div { display: grid; gap: 4px; font-size: 10px; }.b-event-day { color: #8c958a; font-size: 8px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }.b-event-line { display: grid; grid-template-columns: max-content 1fr; align-items: center; gap: 8px; }.b-events time { color: #7b877a; font-size: 9px; font-variant-numeric: tabular-nums; white-space: nowrap; }.b-events strong { font-weight: 650; }.b-priority { display: grid; grid-template-columns: 8px 1fr auto; align-items: center; gap: 10px; min-height: 39px; margin-top: 9px; padding: 0 12px; border: 1px solid #e2e7df; border-radius: 8px; }.b-priority > span { width: 7px; height: 7px; border-radius: 50%; }.high-dot { background: #c76856; }.medium-dot { background: #d6a52d; }.low-dot { background: #91a1a2; }.b-priority strong { font-size: 11px; font-weight: 650; }.b-footer { border-top: 1px solid #dfe5dc; color: #9ba49a; }.b-footer a { color: #587542; }

  .b-temp-range { display: flex; align-items: center; gap: 16px; margin-top: 11px; color: #748174; font-size: 10px; }.b-temp-range > span { display: inline-flex; align-items: center; gap: 4px; }.b-temp-range strong { font-size: 11px; font-weight: 700; }.b-temp-high { color: #b96553; }.b-temp-low { color: #657ea6; }
  .b-todo .b-cell-title { margin-bottom: 24px; }.b-task-groups { display: grid; gap: 10px; }.b-task-group { display: grid; gap: 0; }.b-group-heading { padding-bottom: 0; color: #7a8679; font-size: 9px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }.b-task-list { display: grid; gap: 0; margin: -6px 0 0 28px; }.b-todo .b-priority { grid-template-columns: 8px 1fr; min-height: 31px; margin-top: 0; padding: 0 0 0 1px; border: 0; border-bottom: 1px solid #e5e9e3; border-radius: 0; gap: 9px; }.b-todo .b-priority:last-child { border-bottom: 0; }.b-todo .b-priority strong { overflow: hidden; font-size: 10px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }.b-todo .low-dot { background: transparent; border: 1.5px solid #91a1a2; }
  .b-task-pagination { display: flex; align-items: center; justify-content: center; gap: 7px; min-height: 22px; margin: 5px 0 0 28px; }.b-page-arrow { display: grid; place-items: center; width: 20px; height: 20px; padding: 0; border: 0; background: transparent; color: #7a8679; cursor: pointer; font: inherit; }.b-page-arrow:not(:disabled):hover { color: #587542; }.b-page-arrow:disabled { color: #d1d9cf; cursor: default; }.b-page-arrow:focus-visible, .b-page-dot:focus-visible { outline: 2px solid #a9c88e; outline-offset: 2px; }.b-page-dots { display: flex; align-items: center; gap: 5px; }.b-page-dot { width: 5px; height: 5px; padding: 0; border: 1px solid #aeb9aa; border-radius: 50%; background: transparent; cursor: pointer; }.b-page-dot.active { border-color: #587542; background: #587542; }

  .b-weather-main > .b-temp-range { display: flex; grid-column: 1 / 3; grid-row: 2; align-items: center; justify-content: center; gap: 16px; margin-top: -6px; border-left: 0; padding-left: 0; }.b-weather-main > .b-temp-range > span { font-size: 10px; font-weight: 400; }

  .b-week-number { margin-left: auto; color: #8c958a; font-size: 8px; font-weight: 800; letter-spacing: .08em; }
  .b-week .today strong { display: grid; place-items: center; width: 25px; height: 25px; margin: 5px auto 0; border-radius: 50%; background: #587542; color: #fff; font-size: 11px; line-height: 1; }
  .b-week > span > small, .b-week > span > strong { display: grid; place-items: center; width: 25px; height: 25px; margin: 5px auto 0; line-height: 1; }

  .b-commute-main { display: grid; grid-template-columns: 1fr; align-items: start; gap: 18px; margin-top: 31px; }.b-commute-result { display: flex; align-items: baseline; gap: 4px; white-space: nowrap; }.b-commute-result strong { font-size: 50px; font-weight: 760; letter-spacing: -.09em; line-height: .85; }.b-commute-result span { font-size: 13px; font-weight: 750; }.b-traffic-clear { color: #4f8a57; }.b-traffic-slow { color: #c08a2c; }.b-traffic-heavy { color: #c55d50; }.b-commute-route { display: grid; grid-template-columns: auto minmax(26px, 1fr) auto; align-items: center; gap: 8px; min-width: 0; }.b-commute-stop { display: flex; align-items: center; gap: 7px; min-width: 0; color: #5b78a5; }.b-commute-stop > span { display: grid; gap: 3px; min-width: 0; }.b-commute-stop strong { overflow: hidden; color: #354239; font-size: 11px; font-weight: 760; text-overflow: ellipsis; white-space: nowrap; }.b-commute-stop small { overflow: hidden; color: #8b958b; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }.b-commute-stop-destination { color: #718575; }.b-commute-connector { display: flex; align-items: center; justify-content: flex-end; height: 1px; min-width: 26px; color: #5f7eb4; background: #cbd6e5; }.b-route-arrow { margin-right: -1px; padding-left: 4px; background: #fbfcfa; }
  .b-commute-main { gap: 8px; }.b-commute-result { margin-top: 6px; }

  /* C — Day Stack */
  .email-c { color: #243025; background: #fffaf4; }.c-head { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 27px 40px; border-bottom: 1px solid #e5dfd6; }.c-brand { display: inline-flex; align-items: center; gap: 9px; font-size: 14px; font-weight: 800; }.c-date { display: flex; align-items: center; gap: 7px; }.c-date strong { color: #2d3d29; font-size: 31px; letter-spacing: -.09em; }.c-date span { color: #788377; font-size: 9px; font-weight: 800; letter-spacing: .09em; line-height: 1.2; }.c-head time { justify-self: end; color: #8d958c; font-size: 10px; }.c-greeting { display: flex; align-items: baseline; justify-content: space-between; gap: 20px; padding: 29px 40px 26px; }.c-greeting h2 { margin: 0; font-size: 27px; letter-spacing: -.05em; }.c-greeting span { display: inline-flex; align-items: center; gap: 5px; color: #758175; font-size: 10px; }.c-stack { margin: 0 40px; border-top: 1px solid #dedfd8; }.c-row { display: grid; grid-template-columns: 46px 1fr auto; gap: 14px; padding: 19px 0; border-bottom: 1px solid #dedfd8; }.c-rail-icon { display: grid; place-items: center; width: 33px; height: 33px; border-radius: 50%; background: #eef3ea; color: #668456; }.c-commute-row .c-rail-icon { color: #617ca4; background: #edf1f7; }.c-calendar-row .c-rail-icon { color: #7b6c9b; background: #f1eef6; }.c-todo-row .c-rail-icon { color: #6b8563; background: #f0f3ed; }.c-row-main { display: grid; align-content: center; gap: 5px; }.c-row-main > strong { font-size: 14px; letter-spacing: -.02em; }.c-row-main > span { color: #647061; font-size: 11px; }.c-row > small { align-self: center; color: #7c867b; font-size: 9px; line-height: 1.5; text-align: right; }.c-agenda-main > div, .c-todo-main > div { display: grid; grid-template-columns: 38px 5px 1fr; align-items: center; gap: 8px; font-size: 10px; }.c-agenda-main time { color: #7c867b; font-variant-numeric: tabular-nums; }.c-agenda-main i { width: 5px; height: 5px; border-radius: 50%; background: var(--event-color); }.c-todo-main > div { grid-template-columns: 16px 1fr auto; }.c-todo-main .mini-check { width: 15px; height: 15px; }.c-todo-main em { color: #a36753; font-size: 9px; font-style: normal; }.c-footer { border-top: 0; color: #9b9d95; }.c-footer a { color: #587542; }

  .lab-caption { margin-top: 14px; color: #8a9289; font-size: 10px; text-align: center; }
  .prototype-switcher { position: fixed; left: 50%; bottom: 21px; z-index: 10; display: flex; align-items: center; gap: 3px; min-width: 238px; padding: 6px; transform: translateX(-50%); border: 1px solid #303a31; border-radius: 14px; background: #202921; box-shadow: 0 10px 28px rgba(28, 38, 29, .25); color: #fff; }.switch-arrow { display: grid; place-items: center; width: 33px; height: 33px; border: 0; border-radius: 9px; background: transparent; color: #c6d0c1; cursor: pointer; }.switch-arrow:hover { background: #354237; color: #fff; }.switch-arrow:focus-visible { outline: 2px solid #a9c88e; outline-offset: 2px; }.switch-label { display: flex; align-items: center; gap: 9px; flex: 1; padding: 0 5px; }.switch-key { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 7px; background: #a9c68a; color: #1d2a1f; font-size: 10px; font-weight: 850; }.switch-label span:last-child { display: flex; flex-direction: column; gap: 2px; }.switch-label strong { color: #f3f6ef; font-size: 11px; }.switch-label small { color: #9fac9a; font-size: 9px; }

  @media (max-width: 700px) {
    .summary-lab { padding: 22px 12px 105px; }.lab-header { display: block; margin: 0 5px 18px; }.lab-header h1 { font-size: 28px; }.lab-note { margin-top: 8px; }
    .mail-chrome { grid-template-columns: 48px 1fr; padding: 0 12px; }.chrome-meta { display: none; }.chrome-subject { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.email-footer { align-items: flex-start; flex-direction: column; gap: 10px; padding: 17px 22px 20px; }
    .a-head { padding: 24px 22px; }.a-head h2 { margin-top: 20px; font-size: 27px; }.a-section { grid-template-columns: 34px 1fr; gap: 12px; margin: 0 22px; padding: 20px 0; }.a-value, .a-time { display: none; }.a-section-copy h3 { font-size: 13px; }.a-section-copy > p { font-size: 11px; }.a-section-copy > small { font-size: 9px; }
    .b-head { grid-template-columns: 1fr auto; padding: 24px 22px; }.b-head > div:nth-child(2) { grid-column: 1 / -1; grid-row: 2; margin-top: 20px; }.b-head h2 { font-size: 24px; }.b-head > time { grid-column: 2; }.b-grid { grid-template-columns: 1fr; }.b-cell { min-height: 0; padding: 24px 22px; }.b-weather-main, .b-commute-main { margin-top: 22px; }.b-commute-main { gap: 14px; }.b-commute-result strong { font-size: 44px; }.b-commute-route { gap: 6px; }.b-commute-stop { gap: 5px; }.b-commute-stop small { font-size: 8px; }.b-week { max-width: 320px; }.b-footer { margin-top: 1px; }
    .c-head { padding: 24px 22px; }.c-greeting { padding: 25px 22px 22px; }.c-greeting h2 { font-size: 24px; }.c-stack { margin: 0 22px; }.c-row { grid-template-columns: 40px 1fr; gap: 10px; }.c-row > small { display: none; }.c-agenda-main > div { grid-template-columns: 36px 5px 1fr; }.c-todo-main > div { grid-template-columns: 16px 1fr auto; }
  }

  @media (max-width: 700px) { .email-b .b-commute-main { gap: 8px; } }

  @media (prefers-reduced-motion: reduce) { .prototype-switcher, .switch-arrow { transition: none; } }
</style>
