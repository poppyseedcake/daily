<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { CalendarDays, CloudSun, ListTodo, MapPin } from '@lucide/svelte';
  import DailyLogo from '$lib/components/DailyLogo.svelte';
  import SummaryExample from './SummaryExample.svelte';

  let { onfinish, isVisitor }: { onfinish: () => void; isVisitor: boolean } = $props();
  let dialog = $state<HTMLDialogElement>();
  let guide = $state<HTMLElement>();
  let heading = $state<HTMLHeadingElement>();
  let touring = $state(false);
  let step = $state(0);
  let viewportWidth = $state(0);
  let viewportHeight = $state(0);
  let targetRect = $state<{ left: number; top: number; width: number; height: number } | null>(null);
  let guidePosition = $state({ left: 0, top: 0 });
  const steps = $derived([
    { title: 'Todo', target: '[data-onboarding-target="todo"]', text: 'Add tasks, organise them into groups and set their urgency. Open tasks appear in your email.' },
    { title: 'Weather', target: '[data-summary-section="weather"]', text: 'Choose a city to include its weather forecast in your email.' },
    { title: 'Commute', target: '[data-summary-section="commute"]', text: 'Save driving routes and choose their weekdays. Daily includes the travel time for each route.' },
    { title: 'Calendar', target: '[data-summary-section="calendar"]', text: 'Connect Google Calendar and select the calendars whose events you want in your email.' },
    { title: 'Mail delivery', target: '[data-onboarding-target="delivery"]', text: isVisitor
      ? 'Set the delivery time and time zone. Sign in with Google to receive emails. You can pause delivery at any time.'
      : 'Set the delivery time and time zone for your email. You can pause delivery at any time.' }
  ]);
  const current = $derived(steps[step]);
  const exampleSection = $derived(step === 1 ? 'weather' : step === 2 ? 'commute' : step === 3 ? 'calendar' : null);
  const features = [
    { icon: ListTodo, name: 'Todo', text: 'Your open tasks' },
    { icon: CloudSun, name: 'Weather', text: 'A forecast for your city' },
    { icon: MapPin, name: 'Commute', text: 'Travel times for your driving routes' },
    { icon: CalendarDays, name: 'Calendar', text: 'Events from your Google calendars' }
  ];

  function positionGuide() {
    if (!touring || !guide) return;
    const target = document.querySelector<HTMLElement>(current.target);
    if (!target) { targetRect = null; return; }
    const box = target.getBoundingClientRect();
    targetRect = { left: box.left - 5, top: box.top - 5, width: box.width + 10, height: box.height + 10 };
    const size = guide.getBoundingClientRect();
    if (viewportWidth < 760) {
      guidePosition = { left: 16, top: Math.max(16, viewportHeight - size.height - 24) };
      return;
    }
    const left = Math.max(16, Math.min(box.right - size.width, viewportWidth - size.width - 16));
    const below = box.bottom + 18;
    const above = box.top - size.height - 18;
    const top = below + size.height <= viewportHeight - 16 ? below : above >= 16 ? above : Math.max(16, viewportHeight - size.height - 16);
    guidePosition = { left, top };
  }

  async function showTarget() {
    await tick();
    if (!touring || !dialog?.open) return;
    const target = document.querySelector<HTMLElement>(current.target);
    target?.scrollIntoView({ block: viewportWidth < 760 ? 'start' : 'center', inline: 'center', behavior: 'instant' });
    if (viewportWidth < 760) window.scrollBy({ top: -24, behavior: 'instant' });
    positionGuide();
    heading?.focus({ preventScroll: true });
  }

  // Measure after the modal, scroll lock and mobile spacing settle.
  $effect(() => {
    touring; step; viewportWidth; viewportHeight;
    if (!touring) return;
    const timer = window.setTimeout(() => void showTarget(), 0);
    return () => window.clearTimeout(timer);
  });

  onMount(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const scrollPosition = { left: window.scrollX, top: window.scrollY };
    const originalOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dialog?.showModal();
    heading?.focus({ preventScroll: true });
    const observer = new ResizeObserver(positionGuide);
    const board = document.querySelector('.daily-board-shell');
    if (board) observer.observe(board);
    window.addEventListener('scroll', positionGuide, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', positionGuide, true);
      dialog?.close();
      document.documentElement.style.overflow = originalOverflow;
      window.scrollTo(scrollPosition);
      const fallback = [...document.querySelectorAll<HTMLElement>('[aria-label="Open settings"], .daily-account-menu > summary, .daily-brand, .daily-mobile-brand')]
        .find((element) => element.getClientRects().length > 0);
      const returnFocus = previousFocus?.isConnected && previousFocus !== document.body ? previousFocus : fallback;
      returnFocus?.focus({ preventScroll: true });
    };
  });
</script>

<svelte:window bind:innerWidth={viewportWidth} bind:innerHeight={viewportHeight} onresize={positionGuide} />

<dialog bind:this={dialog} class="daily-onboarding" class:daily-onboarding--tour={touring} aria-labelledby="onboarding-title" oncancel={(event) => { event.preventDefault(); onfinish(); }}>
  {#if !touring}
    <div class="welcome">
      <section class="welcome__intro">
        <DailyLogo />
        <h2 id="onboarding-title" tabindex="-1" bind:this={heading}>Your daily summary, by email.</h2>
        <p>Daily brings your tasks, weather, driving times and calendar events into one email, delivered at the time you choose.</p>
        <ul>{#each features as feature}<li><feature.icon size={19} aria-hidden="true" /><div><strong>{feature.name}</strong><span>{feature.text}</span></div></li>{/each}</ul>
        {#if isVisitor}<p class="welcome__visitor">Explore without an account. Sign in with Google to receive emails.</p>{/if}
        <footer><button class="secondary" onclick={onfinish}>Skip</button><button class="primary" onclick={() => touring = true}>Show me</button></footer>
      </section>
      <div class="welcome__example"><SummaryExample /></div>
    </div>
  {:else}
    {#if targetRect}<div class="spotlight" style:left={`${targetRect.left}px`} style:top={`${targetRect.top}px`} style:width={`${targetRect.width}px`} style:height={`${targetRect.height}px`} aria-hidden="true"></div>{/if}
    <section bind:this={guide} class="guide" style:left={`${guidePosition.left}px`} style:top={`${guidePosition.top}px`}>
      <h2 id="onboarding-title" tabindex="-1" bind:this={heading}>{current.title}</h2>
      <p>{current.text}</p>
      {#if exampleSection}<div class="guide__example"><SummaryExample section={exampleSection} /></div>{/if}
      <footer><button class="secondary" onclick={onfinish}>Skip</button><span class="progress" aria-label={`Step ${step + 1} of ${steps.length}`}>{step + 1} / {steps.length}</span><div>{#if step > 0}<button class="secondary" onclick={() => step -= 1}>Back</button>{/if}<button class="primary" onclick={() => step < steps.length - 1 ? step += 1 : onfinish()}>{step === steps.length - 1 ? 'Done' : 'Next'}</button></div></footer>
    </section>
  {/if}
</dialog>

<style>
  .daily-onboarding { position: fixed; inset: 0; width: 100%; max-width: none; height: 100%; max-height: none; padding: 24px; margin: 0; border: 0; background: transparent; color: #18201c; overflow-y: auto; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
  /* Keep the top reachable when the welcome panel is taller than the viewport. */
  .daily-onboarding[open]:not(.daily-onboarding--tour) { display: grid; place-items: safe center; }
  .daily-onboarding::backdrop { background: #18201c70; }
  .daily-onboarding--tour { padding: 0; overflow: hidden; }
  .daily-onboarding--tour::backdrop { background: transparent; }
  .welcome { width: min(1160px, 100%); display: grid; grid-template-columns: minmax(340px, .9fr) minmax(0, 1.7fr); border-radius: 16px; overflow: hidden; background: #fff; box-shadow: 0 20px 64px #18201c29; }
  .welcome__intro { padding: 32px; }
  h2 { margin: 0; color: #172d52; letter-spacing: -.025em; font-weight: 650; line-height: 1.2; }
  h2:focus { outline: none; }
  .welcome h2 { margin: 30px 0 14px; font-size: 32px; }
  p { margin: 0; color: #626c5c; font-size: 14px; line-height: 1.6; }
  ul { display: grid; gap: 16px; margin: 28px 0; padding: 0; list-style: none; }
  li { display: flex; align-items: center; gap: 13px; }
  li :global(svg) { color: #587542; flex-shrink: 0; }
  li strong, li span { display: block; font-size: 13px; line-height: 1.4; }
  li strong { font-weight: 650; }
  li span { margin-top: 3px; color: #626c5c; font-size: 12px; }
  .welcome__visitor { font-size: 12px; }
  .welcome__example { display: grid; align-items: center; padding: 28px; background: #f2f5ee; }
  footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 24px; }
  footer > div { display: flex; align-items: center; gap: 8px; }
  button { min-height: 40px; padding: 10px 14px; border: 0; border-radius: 8px; font-size: 13px; font-weight: 600; line-height: 1.4; cursor: pointer; }
  .primary { background: #587542; color: #fff; transition: background var(--duration-quick, 150ms) var(--ease-smooth-out, cubic-bezier(0.22, 1, 0.36, 1)); }
  .primary:hover { background: #496238; }
  .secondary { background: transparent; color: #626c5c; transition: background var(--duration-quick, 150ms) var(--ease-smooth-out, cubic-bezier(0.22, 1, 0.36, 1)), color var(--duration-quick, 150ms) var(--ease-smooth-out, cubic-bezier(0.22, 1, 0.36, 1)); }
  .secondary:hover { background: #f2f5ee; color: #18201c; }
  button:focus-visible { outline: 2px solid #587542; outline-offset: 3px; }
  .spotlight { position: fixed; border: 2px solid #587542; border-radius: 10px; box-shadow: 0 0 0 300vmax #18201c66; pointer-events: none; }
  .guide { position: fixed; width: 420px; max-width: calc(100vw - 32px); max-height: calc(100dvh - 32px); overflow: auto; padding: 24px; background: #fff; border-radius: 12px; box-shadow: 0 12px 40px #18201c29; }
  .guide h2 { font-size: 23px; margin-bottom: 12px; }
  .guide p { font-size: 14px; }
  .guide__example { margin-top: 16px; }
  .guide footer { margin-top: 20px; gap: 8px; }
  .guide footer .secondary { padding-inline: 8px; }
  .progress { color: #626c5c; font-size: 11px; margin-right: auto; }
  @media (max-width: 1000px) {
    .welcome { grid-template-columns: 1fr; width: min(720px, 100%); }
  }
  @media (max-width: 759px) {
    :global(body:has(.daily-onboarding--tour[open]) .daily-board-shell) { padding-bottom: 60vh; }
    .guide { width: calc(100vw - 32px); max-height: calc(100dvh - 160px); overflow: auto; padding: 20px; }
  }
  @media (max-width: 600px) {
    .daily-onboarding { padding: 16px; }
    .daily-onboarding[open]:not(.daily-onboarding--tour) { display: block; }
    .welcome { grid-template-columns: 1fr; border-radius: 12px; }
    .welcome__intro { padding: 24px; }
    .welcome h2 { font-size: 29px; margin-top: 26px; }
    .welcome__example { padding: 24px; }
  }
</style>
