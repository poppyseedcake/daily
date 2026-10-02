<script lang="ts">
  import { ArrowDown, ArrowRight, ArrowUp, CalendarDays, Cloud, CloudSun, House, ListTodo, MapPin, Route } from '@lucide/svelte';
  import DailyLogo from '$lib/components/DailyLogo.svelte';

  let { section = null }: { section?: 'weather' | 'commute' | 'calendar' | null } = $props();
  const days = ['Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'];
  const calendar = [
    { day: 'Friday', events: [{ time: '09:30', title: 'Team meeting', color: '#aedc65' }, { time: '14:00', title: 'Project review', color: '#aedc65' }] },
    { day: 'Saturday', events: [{ time: '10:00', title: 'Coffee with a friend', color: '#aedc65' }] },
    { day: 'Monday', events: [{ time: '11:00', title: 'Design workshop', color: '#d46b63' }] }
  ];
  const taskGroups = [
    { name: 'Home', tasks: [{ title: 'Water the plants', urgency: 'low' }, { title: 'Order a desk lamp', urgency: 'medium' }] },
    { name: 'Work', tasks: [{ title: 'Send the proposal', urgency: 'high' }, { title: 'Review the budget', urgency: 'medium' }] },
    { name: 'Personal', tasks: [{ title: 'Book a check-up', urgency: 'low' }] }
  ];
</script>

<article aria-label={section ? `Example ${section} email section` : 'Example Daily Summary'} class="summary-example" class:summary-example--excerpt={section !== null}>
  {#if !section}
    <header>
      <div class="email-brand"><DailyLogo /></div>
      <div><h3>Good morning, Alex</h3><p>Friday, 2 October</p></div>
      <time>07:00</time>
    </header>
  {/if}
  <div class="email-grid">
    {#if !section || section === 'weather'}
      <section class="email-cell weather">
        <h4><CloudSun size={18} aria-hidden="true" />Weather</h4>
        <div class="weather-main">
          <Cloud class="weather-icon" size={46} strokeWidth={1.5} aria-hidden="true" />
          <strong class="temperature" aria-label="Current 22.7 degrees Celsius">22.7°</strong>
          <div class="weather-details"><strong>Wroclaw</strong><span>Wind 10.2 km/h</span><span>Cloudy</span><span>Precip. 0%</span></div>
          <div class="temperature-range"><span class="high"><ArrowUp size={12} aria-hidden="true" />22.7°</span><span class="low"><ArrowDown size={12} aria-hidden="true" />10°</span></div>
        </div>
        <p class="weather-summary">Mostly cloudy and dry through the evening, with light winds and temperatures cooling steadily.</p>
      </section>
    {/if}
    {#if !section || section === 'commute'}
      <section class="email-cell commute">
        <h4><Route size={18} aria-hidden="true" />Commute</h4>
        <p class="travel-time" aria-label="Home to Office: 25 minutes, light traffic"><strong>25</strong><span>min</span></p>
        <div class="route">
          <div class="stop"><House size={21} strokeWidth={1.7} aria-hidden="true" /><div><strong>Home</strong><span>Maple Street</span></div></div>
          <div class="route-arrow" aria-hidden="true"><span></span><ArrowRight size={18} strokeWidth={1.5} /></div>
          <div class="stop destination"><MapPin size={21} strokeWidth={1.7} aria-hidden="true" /><div><strong>Office</strong><span>Park Avenue</span></div></div>
        </div>
      </section>
    {/if}
    {#if !section || section === 'calendar'}
      <section class="email-cell calendar">
        <h4><CalendarDays size={18} aria-hidden="true" />Calendar<span class="week-number">Week 40</span></h4>
        <div class="week" aria-label="Sample week, Friday 2 to Thursday 8 October">
          {#each days as day, index}<div class:today={index === 0}><span>{day}</span><strong>{index + 2}</strong></div>{/each}
        </div>
        <div class="events">
          {#each calendar as day}
            <div><h5>{day.day}</h5>{#each day.events as event}<div class="event"><time>{event.time}</time><span class="calendar-color" style:background={event.color} aria-hidden="true"></span><strong>{event.title}</strong></div>{/each}</div>
          {/each}
        </div>
      </section>
    {/if}
    {#if !section}
      <section class="email-cell todo">
        <h4><ListTodo size={18} aria-hidden="true" />Todo</h4>
        <div class="task-groups">
          {#each taskGroups as group}
            <div><h5>{group.name}</h5><ul>{#each group.tasks as task}<li><span class="urgency" class:high={task.urgency === 'high'} class:medium={task.urgency === 'medium'} class:low={task.urgency === 'low'} role="img" aria-label={`${task.urgency} urgency`}></span><strong>{task.title}</strong></li>{/each}</ul></div>
          {/each}
        </div>
      </section>
    {/if}
  </div>
  {#if !section}<footer><span>Daily · Europe/Warsaw</span><span class="open-daily">Open Daily <ArrowUp size={10} aria-hidden="true" /></span></footer>{/if}
</article>

<style>
  .summary-example { width: 100%; background: #fbfcfa; color: #243025; font-family: Arial, Helvetica, sans-serif; }
  header { display: grid; grid-template-columns: 1fr auto 1fr; align-items: start; gap: 12px; padding: 24px; border-bottom: 1px solid #dfe5dc; }
  .email-brand :global(.daily-logo) { gap: 6px; font-size: 13px; }
  .email-brand :global(.daily-logo img) { width: 25px; height: 25px; }
  header h3 { margin: 0; font-size: 21px; font-weight: 500; letter-spacing: -.04em; line-height: 1.2; text-align: center; }
  header p { margin: 6px 0 0; color: #748074; font-size: 10px; line-height: 1.5; text-align: center; }
  header > time { color: #8b9489; font-size: 10px; line-height: 1.5; text-align: right; }
  .email-grid { display: grid; grid-template-columns: 1fr 1fr; }
  .email-cell { min-width: 0; padding: 24px 22px; border-bottom: 1px solid #dfe5dc; container-type: inline-size; }
  .email-cell:nth-child(odd) { border-right: 1px solid #dfe5dc; }
  h4 { display: flex; align-items: center; gap: 8px; margin: 0; color: #5b7750; font-size: 10px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; line-height: 18px; }
  h4 :global(svg) { flex: 0 0 auto; }
  .commute h4 { color: #63799b; }
  .weather-main { display: grid; grid-template-columns: 46px auto minmax(0, 1fr); align-items: center; gap: 10px; margin-top: 31px; }
  .weather-main :global(.weather-icon) { color: #7b9c63; }
  .temperature { color: #263923; font-size: 40px; font-weight: 700; letter-spacing: -.04em; line-height: 1.15; white-space: nowrap; }
  .weather-details { display: grid; gap: 5px; padding-left: 13px; border-left: 1px solid #d8e0d6; }
  .weather-details strong { font-size: 12px; line-height: 1.3; }
  .weather-details span { color: #798479; font-size: 10px; line-height: 1.4; }
  .temperature-range { display: flex; grid-column: 1 / 3; align-items: center; justify-content: center; gap: 16px; margin-top: -2px; font-size: 11px; line-height: 1.4; font-weight: 700; }
  .temperature-range span { display: flex; align-items: center; gap: 3px; }
  .high { color: #b96553; }
  .low { color: #657ea6; }
  .weather-summary { margin: 8px 0 0; color: #748074; font-size: 11px; line-height: 1.5; }
  .travel-time { display: flex; align-items: baseline; gap: 4px; margin: 31px 0 10px; color: #4d7a53; line-height: 1; }
  .travel-time strong { font-size: 50px; font-weight: 700; letter-spacing: -.04em; line-height: .85; }
  .travel-time span { font-size: 13px; font-weight: 700; }
  .route { display: grid; grid-template-columns: minmax(0, 1fr) 14% minmax(0, 1fr); align-items: center; gap: 8px; }
  .stop { display: flex; align-items: center; gap: 7px; min-width: 0; }
  .stop :global(svg) { color: #637fa9; flex-shrink: 0; }
  .stop strong, .stop span { display: block; }
  .stop strong { font-size: 11px; line-height: 1.3; font-weight: 700; color: #354239; }
  .stop span { margin-top: 3px; color: #8b958b; font-size: 9px; line-height: 1.4; }
  .destination :global(svg) { color: #7a8c7b; }
  .route-arrow { display: flex; align-items: center; color: #5f7eb4; }
  .route-arrow span { flex: 1; border-top: 1px solid #cbd6e5; margin-right: -6px; }
  .route-arrow :global(svg) { flex-shrink: 0; }
  .week-number { margin-left: auto; color: #8c958a; font-size: 8px; font-weight: 800; letter-spacing: .08em; }
  .week { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; margin: 24px 0 19px; text-align: center; }
  .week span { display: block; color: #8c958a; font-size: 8px; font-weight: 800; letter-spacing: .08em; line-height: 1.3; text-transform: uppercase; }
  .week strong { display: grid; place-items: center; width: 25px; height: 25px; margin: 5px auto 0; color: #697568; font-size: 11px; line-height: 25px; }
  .week .today span { color: #587542; }
  .week .today strong { border-radius: 50%; background: #587542; color: #fff; }
  h5 { margin: 0 0 4px; color: #8c958a; font-size: 8px; font-weight: 800; letter-spacing: .08em; line-height: 1.3; text-transform: uppercase; }
  .events { display: grid; gap: 12px; }
  .event { display: grid; grid-template-columns: 34px 8px minmax(0, 1fr); align-items: baseline; gap: 5px; line-height: 1.5; }
  .event time { color: #7b877a; font-size: 9px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .event strong { font-size: 10px; font-weight: 600; }
  .calendar-color { width: 8px; height: 8px; }
  .task-groups { display: grid; gap: 14px; margin-top: 24px; }
  .task-groups h5 { color: #7a8679; font-size: 9px; }
  ul { margin: 0 0 0 28px; padding: 0; list-style: none; }
  li { display: grid; grid-template-columns: 9px 1fr; gap: 12px; align-items: center; padding: 7px 0; font-size: 10px; line-height: 1.5; }
  li + li { border-top: 1px solid #e5e9e3; }
  li strong { font-weight: 600; }
  .urgency { width: 5px; height: 5px; border-radius: 50%; }
  .urgency.high { background: #c76856; }
  .urgency.medium { background: #d6a52d; }
  .urgency.low { border: 1px solid #91a1a2; }
  footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 24px; color: #748074; font-size: 10px; line-height: 1.5; }
  .open-daily { display: flex; align-items: center; gap: 2px; color: #587542; font-weight: 700; }
  .open-daily :global(svg) { transform: rotate(45deg); }
  .summary-example--excerpt .email-grid { grid-template-columns: 1fr; }
  .summary-example--excerpt .email-cell { padding: 20px; border: 0; }
  @container (max-width: 290px) {
    .weather-main { grid-template-columns: 38px auto minmax(0, 1fr); gap: 7px; }
    .weather-main :global(.weather-icon) { width: 38px; height: 38px; }
    .temperature { font-size: 34px; }
    .weather-details { padding-left: 8px; }
    .weather-details strong { font-size: 11px; }
    .weather-details span { font-size: 9px; }
  }
  @media (max-width: 759px) {
    .summary-example:not(.summary-example--excerpt) .email-grid { grid-template-columns: 1fr; }
    .email-cell:nth-child(odd) { border-right: 0; }
    header { grid-template-columns: 1fr auto; padding: 20px; }
    header > div:nth-child(2) { grid-column: 1 / -1; grid-row: 2; margin-top: 10px; }
    header > time { grid-column: 2; grid-row: 1; }
    .summary-example--excerpt .email-cell { padding: 16px; }
  }
</style>
