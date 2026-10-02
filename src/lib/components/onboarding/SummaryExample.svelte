<script lang="ts">
  import { CalendarDays, CloudSun, ListTodo, MapPin } from '@lucide/svelte';
</script>

<article aria-label="Example Daily Summary" class="summary-example">
  <header><strong>Daily</strong><span>Example email</span></header>
  <div class="summary-example__body">
    <h3>Daily Summary</h3>
    <section><h4><CloudSun size={17} aria-hidden="true" />Weather</h4><p><strong>16°</strong> Partly cloudy · Warsaw</p></section>
    <section><h4><MapPin size={17} aria-hidden="true" />Commute</h4><p>Home → Office <strong>25 min</strong></p><small>Moderate traffic</small></section>
    <section><h4><CalendarDays size={17} aria-hidden="true" />Calendar</h4><p><time>09:30</time> Team meeting</p><p><time>14:00</time> Project review</p></section>
    <section><h4><ListTodo size={17} aria-hidden="true" />Todo</h4><p>Finish the proposal</p><p>Book a dentist appointment</p></section>
  </div>
</article>

<style>
  .summary-example { width: 100%; border: 1px solid #dfe3dc; border-radius: 12px; background: #fff; overflow: hidden; color: #18201c; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 15px 22px; background: #f7f8f5; border-bottom: 1px solid #dfe3dc; }
  header strong { font-size: 14px; color: #172d52; }
  header span { font-size: 12px; color: #626c5c; }
  .summary-example__body { padding: 20px 24px; }
  h3 { margin: 0 0 20px; font-size: 23px; color: #172d52; font-weight: 650; letter-spacing: -.025em; line-height: 1.2; }
  section { border-top: 1px solid #e3e7dd; padding: 14px 0; }
  section:last-child { padding-bottom: 0; }
  h4 { display: flex; align-items: center; gap: 9px; margin: 0 0 9px; color: #496238; font-size: 12px; font-weight: 650; line-height: 1.4; }
  p { display: flex; align-items: baseline; gap: 10px; justify-content: space-between; margin: 5px 0 0; font-size: 12px; line-height: 1.5; }
  section:first-of-type p { justify-content: start; }
  section:first-of-type p strong { font-size: 27px; line-height: 1.1; font-weight: 500; }
  time, small { color: #626c5c; font-size: 11px; }
  small { display: block; margin-top: 5px; }
  time { min-width: 34px; }
  section:nth-of-type(3) p, section:nth-of-type(4) p { justify-content: start; }
</style>
