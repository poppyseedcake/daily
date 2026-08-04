<!--
  PROTOTYPE — three commute sections for the Daily Summary email, switchable with ?variant=.
  Question: which information hierarchy makes the commute useful at a glance?
  This is throwaway UI using in-memory sample data; it is not the production email renderer.
-->

<script lang="ts">
  import { dev } from '$app/environment';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import {
    ArrowLeft,
    ArrowRight,
    ArrowUpRight,
    CarFront,
    Clock3,
    House,
    MapPin,
    Route
  } from '@lucide/svelte';

  type Variant = 'a' | 'b' | 'c';

  const variants: Array<{ key: Variant; name: string; thesis: string }> = [
    {
      key: 'a',
      name: 'Decision first',
      thesis: 'Puts the number and leave-by time first, so the reader can decide in one scan.'
    },
    {
      key: 'b',
      name: 'Route timeline',
      thesis: 'Makes Home → Office the visual story, with time and traffic attached to the route.'
    },
    {
      key: 'c',
      name: 'Status card',
      thesis: 'Groups duration, traffic, and schedule into one calm card that reads like a status update.'
    }
  ];

  const commute = {
    duration: '24',
    from: 'Home',
    fromDetail: 'Mokotów',
    to: 'Office',
    toDetail: 'Rondo Daszyńskiego',
    distance: '12.4 km',
    traffic: 'Light traffic',
    leave: '08:31',
    arrive: '08:55',
    updated: 'Updated 06:45'
  };

  const parseVariant = (value: string | null): Variant =>
    value === 'b' || value === 'c' ? value : 'a';

  let variant = $state<Variant>(parseVariant(page.url.searchParams.get('variant')));
  const variantIndex = $derived(variants.findIndex((item) => item.key === variant));

  const setVariant = (next: Variant) => {
    variant = next;
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
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      cycleVariant(-1);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      cycleVariant(1);
    }
  };
</script>

<svelte:head>
  <title>Commute email prototypes</title>
  <meta name="description" content="Three commute section directions for the Daily Summary email." />
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<main class="commute-lab">
  <header class="lab-header">
    <div>
      <p class="lab-kicker">Daily / email direction</p>
      <h1>A commute section that answers “when should I leave?”</h1>
    </div>
    <p class="lab-note">synthetic sample · {commute.from} → {commute.to}</p>
  </header>

  <section class="preview-stage" aria-label="Email preview">
    <div class="mail-chrome">
      <div class="chrome-dots" aria-hidden="true"><span></span><span></span><span></span></div>
      <div class="chrome-subject">Your Daily Summary · Friday, 31 July</div>
      <div class="chrome-meta">to Alex · 07:00</div>
    </div>

    <article class={`email email--${variant}`} aria-label={`${variants[variantIndex].name} commute email prototype`}>
      <header class="email-header">
        <span class="email-brand"><span class="brand-mark">D</span>Daily</span>
        <span>Friday, 31 July · 07:00</span>
      </header>

      {#if variant === 'a'}
        <section class="commute-section commute-a" aria-labelledby="commute-a-title">
          <header class="section-heading">
            <div class="section-label"><span class="section-icon section-icon--blue"><Route size={17} strokeWidth={1.8} aria-hidden="true" /></span><h2 id="commute-a-title">Commute</h2></div>
            <span class="updated">{commute.updated}</span>
          </header>

          <div class="a-main">
            <div class="a-result">
              <div class="a-duration"><strong>{commute.duration}</strong><span>min</span></div>
              <span class="traffic-pill"><CarFront size={14} strokeWidth={1.9} aria-hidden="true" />{commute.traffic}</span>
            </div>

            <div class="a-route" aria-label={`${commute.duration} minutes from ${commute.from} to ${commute.to}`}>
              <div class="route-stop"><House size={21} strokeWidth={1.7} aria-hidden="true" /><span><strong>{commute.from}</strong><small>{commute.fromDetail}</small></span></div>
              <div class="route-connector" aria-hidden="true"><ArrowRight size={17} strokeWidth={1.6} /></div>
              <div class="route-stop route-stop--destination"><MapPin size={21} strokeWidth={1.7} aria-hidden="true" /><span><strong>{commute.to}</strong><small>{commute.toDetail}</small></span></div>
            </div>
          </div>

          <footer class="a-schedule">
            <span class="schedule-primary"><Clock3 size={15} strokeWidth={1.8} aria-hidden="true" />Leave by <strong>{commute.leave}</strong></span>
            <span>Arrive <strong>{commute.arrive}</strong></span>
            <a href="/" aria-label="Open route details">View route <ArrowUpRight size={13} strokeWidth={1.8} aria-hidden="true" /></a>
          </footer>
        </section>
      {:else if variant === 'b'}
        <section class="commute-section commute-b" aria-labelledby="commute-b-title">
          <header class="section-heading">
            <div class="section-label"><span class="section-icon section-icon--blue"><Route size={17} strokeWidth={1.8} aria-hidden="true" /></span><h2 id="commute-b-title">Commute</h2></div>
            <span class="section-kicker">YOUR ROUTE</span>
          </header>

          <div class="b-route" aria-label={`${commute.duration} minutes from ${commute.from} to ${commute.to}`}>
            <div class="b-stop">
              <span class="b-stop-icon"><House size={21} strokeWidth={1.7} aria-hidden="true" /></span>
              <small>FROM</small>
              <strong>{commute.from}</strong>
              <em>{commute.fromDetail}</em>
            </div>
            <div class="b-line" aria-hidden="true">
              <span class="b-line-track"><i></i><ArrowRight size={17} strokeWidth={1.6} /></span>
              <span class="b-line-result"><strong>{commute.duration}</strong><small>min</small></span>
            </div>
            <div class="b-stop b-stop--destination">
              <span class="b-stop-icon"><MapPin size={21} strokeWidth={1.7} aria-hidden="true" /></span>
              <small>TO</small>
              <strong>{commute.to}</strong>
              <em>{commute.toDetail}</em>
            </div>
          </div>

          <div class="b-details">
            <span><CarFront size={14} strokeWidth={1.9} aria-hidden="true" />{commute.traffic}</span>
            <span><Clock3 size={14} strokeWidth={1.9} aria-hidden="true" />Leave by <strong>{commute.leave}</strong></span>
            <span>Arrive <strong>{commute.arrive}</strong></span>
          </div>
        </section>
      {:else}
        <section class="commute-section commute-c" aria-labelledby="commute-c-title">
          <header class="section-heading">
            <div class="section-label"><span class="section-icon section-icon--green"><Route size={17} strokeWidth={1.8} aria-hidden="true" /></span><h2 id="commute-c-title">Commute</h2></div>
            <span class="status-badge"><i aria-hidden="true"></i>On time</span>
          </header>

          <div class="c-card">
            <div class="c-route-icon"><House size={25} strokeWidth={1.65} aria-hidden="true" /><span></span><MapPin size={21} strokeWidth={1.75} aria-hidden="true" /></div>
            <div class="c-copy">
              <span class="c-route-name">{commute.from} <b>→</b> {commute.to}</span>
              <div class="c-duration"><strong>{commute.duration}</strong><span>min</span></div>
              <span class="c-context"><CarFront size={13} strokeWidth={1.9} aria-hidden="true" />{commute.traffic} · {commute.distance}</span>
            </div>
            <div class="c-schedule">
              <span><small>LEAVE BY</small><strong>{commute.leave}</strong></span>
              <span><small>ARRIVE</small><strong>{commute.arrive}</strong></span>
            </div>
            <a href="/" class="c-open" aria-label="Open route details"><ArrowUpRight size={17} strokeWidth={1.8} aria-hidden="true" /></a>
          </div>

          <p class="c-hint"><Clock3 size={13} strokeWidth={1.8} aria-hidden="true" />Leave in about 14 min to arrive on time.</p>
        </section>
      {/if}

      <footer class="email-footer"><span>Daily · Europe/Warsaw</span><a href="/">Open Daily <ArrowUpRight size={12} strokeWidth={1.8} aria-hidden="true" /></a></footer>
    </article>
  </section>

  <section class="variant-note" aria-live="polite">
    <span class="variant-key">{variant.toUpperCase()}</span>
    <div><h2>{variants[variantIndex].name}</h2><p>{variants[variantIndex].thesis}</p></div>
    <span class="variant-counter">{variantIndex + 1} / {variants.length}</span>
  </section>
</main>

{#if dev}
  <nav class="prototype-switcher" aria-label="Commute email prototype variants">
    <button class="switch-arrow" type="button" aria-label="Previous variant" onclick={() => cycleVariant(-1)}><ArrowLeft size={17} /></button>
    <div class="switch-label"><span class="switch-key">{variant.toUpperCase()}</span><span><strong>{variants[variantIndex].name}</strong><small>← → to switch</small></span></div>
    <button class="switch-arrow" type="button" aria-label="Next variant" onclick={() => cycleVariant(1)}><ArrowRight size={17} /></button>
  </nav>
{/if}

<style>
  :global(*) { box-sizing: border-box; }
  :global(body) { background: #f4f1eb; color: #1e2821; }

  .commute-lab { min-height: 100vh; padding: 36px 24px 112px; }
  .lab-header, .preview-stage, .variant-note { width: min(100%, 1040px); margin-inline: auto; }
  .lab-header { display: flex; align-items: end; justify-content: space-between; gap: 28px; margin-bottom: 24px; }
  .lab-kicker { margin: 0 0 10px; color: #587542; font-size: 10px; font-weight: 850; letter-spacing: .16em; text-transform: uppercase; }
  .lab-header h1 { max-width: 680px; margin: 0; color: #1e2821; font-size: clamp(28px, 4vw, 44px); font-weight: 760; letter-spacing: -.055em; line-height: .99; }
  .lab-note { margin: 0 0 4px; color: #899188; font-size: 11px; white-space: nowrap; }

  .preview-stage { overflow: hidden; border: 1px solid #d5d9d2; border-radius: 16px; background: #fff; box-shadow: 0 24px 70px rgba(49, 59, 47, .1), 0 2px 7px rgba(49, 59, 47, .06); }
  .mail-chrome { display: grid; grid-template-columns: 82px 1fr auto; align-items: center; min-height: 44px; padding: 0 18px; border-bottom: 1px solid #e6e9e3; background: #fbfcfa; color: #98a098; font-size: 11px; }
  .chrome-dots { display: flex; gap: 5px; }.chrome-dots span { width: 7px; height: 7px; border-radius: 50%; background: #d9dfd7; }
  .chrome-subject { color: #5f6a60; font-weight: 650; }.chrome-meta { color: #a2aaa1; }
  .email { max-width: 820px; margin: 0 auto; color: #223026; background: #fff; }
  .email-header { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 27px 43px 25px; border-bottom: 1px solid #e4e8e1; color: #929b91; font-size: 10px; }
  .email-brand { display: inline-flex; align-items: center; gap: 9px; color: #263327; font-size: 14px; font-weight: 800; }.brand-mark { display: grid; place-items: center; width: 25px; height: 25px; border-radius: 7px; background: #587542; color: #fff; font-size: 14px; font-weight: 800; }
  .commute-section { padding: 30px 43px 0; }
  .section-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; }.section-label { display: flex; align-items: center; gap: 10px; }.section-label h2 { margin: 0; color: #334238; font-size: 14px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; }.section-icon { display: grid; place-items: center; width: 31px; height: 31px; border-radius: 9px; }.section-icon--blue { color: #5879ad; background: #edf2f9; }.section-icon--green { color: #648d60; background: #eef5ec; }.updated, .section-kicker { color: #9ba49c; font-size: 9px; font-weight: 750; letter-spacing: .12em; text-transform: uppercase; }

  /* A — result-led hierarchy */
  .commute-a { padding-bottom: 27px; }.a-main { display: grid; grid-template-columns: 190px 1fr; gap: 38px; align-items: center; padding: 36px 0 31px; }.a-result { display: grid; justify-items: start; gap: 12px; }.a-duration { display: flex; align-items: baseline; gap: 6px; color: #4f8a57; }.a-duration strong { font-size: 64px; font-weight: 760; letter-spacing: -.09em; line-height: .85; }.a-duration span { font-size: 15px; font-weight: 750; }.traffic-pill { display: inline-flex; align-items: center; gap: 7px; padding: 8px 11px; border-radius: 9px; color: #5c8058; background: #eef5eb; font-size: 10px; font-weight: 720; }.a-route { display: grid; grid-template-columns: auto minmax(70px, 1fr) auto; align-items: center; gap: 15px; min-width: 0; }.route-stop { display: flex; align-items: center; gap: 9px; min-width: 0; color: #5b78a5; }.route-stop > span { display: grid; gap: 3px; }.route-stop strong { color: #354239; font-size: 12px; font-weight: 760; }.route-stop small { color: #8b958b; font-size: 10px; white-space: nowrap; }.route-stop--destination { color: #718575; }.route-connector { display: flex; align-items: center; justify-content: flex-end; height: 1px; min-width: 42px; color: #5f7eb4; background: #cbd6e5; }.a-schedule { display: flex; align-items: center; gap: 24px; padding-top: 19px; border-top: 1px solid #e2e7e0; color: #7c887e; font-size: 11px; }.a-schedule > span { display: inline-flex; align-items: center; gap: 6px; }.a-schedule strong { color: #3e6043; font-weight: 800; }.schedule-primary { color: #516a54 !important; }.a-schedule a { display: inline-flex; align-items: center; gap: 5px; margin-left: auto; color: #5d78a6; font-size: 10px; font-weight: 750; text-decoration: none; }.a-schedule a:hover, .email-footer a:hover { text-decoration: underline; }

  /* B — route-led hierarchy */
  .email--b { background: #fbfcfa; }.commute-b { padding-bottom: 29px; }.b-route { display: grid; grid-template-columns: 120px minmax(110px, 1fr) 150px; align-items: center; gap: 22px; padding: 42px 0 29px; }.b-stop { display: grid; grid-template-columns: 36px 1fr; grid-template-rows: auto auto auto; align-items: center; column-gap: 9px; }.b-stop-icon { grid-row: 1 / -1; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; color: #5879ad; background: #edf2f9; }.b-stop--destination .b-stop-icon { color: #69816d; background: #eef4eb; }.b-stop small { align-self: end; color: #9aa39b; font-size: 8px; font-weight: 850; letter-spacing: .12em; }.b-stop strong { color: #334238; font-size: 12px; font-weight: 760; }.b-stop em { align-self: start; overflow: hidden; color: #89958a; font-size: 9px; font-style: normal; text-overflow: ellipsis; white-space: nowrap; }.b-line { position: relative; display: flex; align-items: center; min-width: 0; }.b-line-track { display: flex; align-items: center; justify-content: flex-end; width: 100%; height: 1px; color: #5f7eb4; background: #cbd6e5; }.b-line-track i { position: absolute; left: 0; width: 7px; height: 7px; border-radius: 50%; background: #5c7eb7; }.b-line-track svg { margin-right: -1px; padding-left: 4px; background: #fbfcfa; }.b-line-result { position: absolute; left: 50%; top: -30px; display: inline-flex; align-items: baseline; gap: 4px; transform: translateX(-50%); color: #4f8a57; white-space: nowrap; }.b-line-result strong { font-size: 33px; font-weight: 760; letter-spacing: -.07em; }.b-line-result small { font-size: 10px; font-weight: 750; }.b-details { display: flex; align-items: center; justify-content: center; gap: 25px; padding-top: 18px; border-top: 1px solid #e1e6df; color: #77837a; font-size: 10px; }.b-details span { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }.b-details span:first-child { color: #5e825b; }.b-details strong { color: #3e6043; font-weight: 800; }

  /* C — status-led hierarchy */
  .email--c { background: #fffdf9; }.commute-c { padding-bottom: 26px; }.status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 9px; border-radius: 999px; color: #5e815b; background: #edf5ea; font-size: 9px; font-weight: 760; }.status-badge i { width: 6px; height: 6px; border-radius: 50%; background: #6b9b64; }.c-card { display: grid; grid-template-columns: 82px minmax(0, 1fr) auto 24px; align-items: center; gap: 20px; margin-top: 28px; padding: 23px 22px; border: 1px solid #d9e5d5; border-radius: 14px; background: #f4f9f1; }.c-route-icon { display: flex; align-items: center; justify-content: center; gap: 4px; color: #668667; }.c-route-icon span { width: 17px; height: 1px; background: #a9c3a5; }.c-copy { display: grid; gap: 6px; min-width: 0; }.c-route-name { color: #526956; font-size: 11px; font-weight: 730; }.c-route-name b { padding: 0 3px; color: #6c9270; font-weight: 500; }.c-duration { display: flex; align-items: baseline; gap: 5px; color: #4f8a57; }.c-duration strong { font-size: 43px; font-weight: 760; letter-spacing: -.09em; line-height: .85; }.c-duration span { font-size: 12px; font-weight: 750; }.c-context { display: inline-flex; align-items: center; gap: 5px; color: #789079; font-size: 9px; }.c-schedule { display: grid; grid-template-columns: repeat(2, auto); gap: 22px; padding-left: 21px; border-left: 1px solid #d7e2d3; }.c-schedule span { display: grid; gap: 5px; }.c-schedule small { color: #8d9c8a; font-size: 8px; font-weight: 850; letter-spacing: .1em; }.c-schedule strong { color: #3e6043; font-size: 20px; font-weight: 760; letter-spacing: -.05em; }.c-open { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 7px; color: #5c7caa; background: #fff; }.c-hint { display: flex; align-items: center; gap: 6px; margin: 14px 0 0 102px; color: #809080; font-size: 10px; }.email-footer { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 20px 43px 22px; border-top: 1px solid #e4e8e1; color: #9ca49c; font-size: 10px; }.email-footer a { display: inline-flex; align-items: center; gap: 5px; color: #587542; font-weight: 750; text-decoration: none; }

  .variant-note { display: flex; align-items: center; gap: 13px; padding: 15px 5px 0; color: #7f897e; }.variant-key { display: grid; place-items: center; width: 25px; height: 25px; border-radius: 7px; background: #587542; color: #fff; font-size: 10px; font-weight: 850; }.variant-note h2 { margin: 0 0 3px; color: #3a493c; font-size: 12px; font-weight: 800; }.variant-note p { margin: 0; font-size: 11px; }.variant-counter { margin-left: auto; color: #9ba39a; font-size: 10px; font-variant-numeric: tabular-nums; }

  .prototype-switcher { position: fixed; left: 50%; bottom: 21px; z-index: 10; display: flex; align-items: center; gap: 3px; min-width: 252px; padding: 6px; transform: translateX(-50%); border: 1px solid #303a31; border-radius: 14px; background: #202921; box-shadow: 0 10px 28px rgba(28, 38, 29, .25); color: #fff; }.switch-arrow { display: grid; place-items: center; width: 33px; height: 33px; border: 0; border-radius: 9px; background: transparent; color: #c6d0c1; cursor: pointer; }.switch-arrow:hover { background: #354237; color: #fff; }.switch-arrow:focus-visible { outline: 2px solid #a9c88e; outline-offset: 2px; }.switch-label { display: flex; align-items: center; gap: 9px; flex: 1; padding: 0 5px; }.switch-key { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 7px; background: #a9c68a; color: #1d2a1f; font-size: 10px; font-weight: 850; }.switch-label span:last-child { display: flex; flex-direction: column; gap: 2px; }.switch-label strong { color: #f3f6ef; font-size: 11px; }.switch-label small { color: #9fac9a; font-size: 9px; }

  @media (max-width: 760px) {
    .commute-lab { padding: 23px 12px 108px; }.lab-header { display: block; margin: 0 5px 18px; }.lab-header h1 { font-size: 30px; }.lab-note { margin-top: 10px; }.mail-chrome { grid-template-columns: 48px 1fr; padding: 0 12px; }.chrome-meta { display: none; }.chrome-subject { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.email-header { padding: 23px 22px; }.commute-section { padding: 24px 22px 0; }.updated { display: none; }
    .a-main { grid-template-columns: 1fr; gap: 28px; padding: 30px 0 25px; }.a-duration strong { font-size: 57px; }.a-route { gap: 10px; }.route-stop { gap: 7px; }.route-stop strong { font-size: 11px; }.route-stop small { font-size: 9px; }.a-schedule { flex-wrap: wrap; gap: 12px 20px; }.a-schedule a { margin-left: 0; }
    .b-route { grid-template-columns: 92px minmax(54px, 1fr) 112px; gap: 9px; padding: 41px 0 25px; }.b-stop { grid-template-columns: 30px 1fr; column-gap: 7px; }.b-stop-icon { width: 30px; height: 30px; }.b-stop strong { font-size: 11px; }.b-stop em { font-size: 8px; }.b-details { justify-content: flex-start; flex-wrap: wrap; gap: 10px 18px; }
    .c-card { grid-template-columns: 52px minmax(0, 1fr) 24px; gap: 14px; padding: 19px 15px; }.c-route-icon { flex-direction: column; gap: 3px; }.c-route-icon span { width: 1px; height: 11px; }.c-duration strong { font-size: 38px; }.c-schedule { grid-column: 2 / -1; grid-row: 2; justify-content: start; padding: 12px 0 0; border-top: 1px solid #d7e2d3; border-left: 0; }.c-hint { margin-left: 0; }.email-footer { align-items: flex-start; flex-direction: column; gap: 9px; padding: 17px 22px 20px; }
    .variant-note { align-items: flex-start; }.variant-note p { line-height: 1.4; }.variant-counter { padding-top: 4px; }
  }

  @media (max-width: 420px) {
    .b-route { grid-template-columns: 76px minmax(40px, 1fr) 94px; }.b-stop strong { font-size: 10px; }.b-stop em { overflow: hidden; text-overflow: ellipsis; }.c-card { grid-template-columns: 42px minmax(0, 1fr) 22px; gap: 11px; }.c-route-icon svg:first-child { width: 20px; }.c-route-name { font-size: 10px; }.c-context { font-size: 8px; }.c-schedule { gap: 16px; }.c-schedule strong { font-size: 18px; }
  }

  @media (prefers-reduced-motion: reduce) { .prototype-switcher, .switch-arrow { transition: none; } }
</style>
