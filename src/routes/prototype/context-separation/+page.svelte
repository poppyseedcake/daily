<!--
  PROTOTYPE — three ways to separate Daily Summary context from the Todo workspace.
  Question: should the supporting Weather, Commute, and Calendar tiles read as a
  calm briefing above Todo, or as another dashboard surface?
  Switch with ?variant=a|b|c. This route is throwaway and uses in-memory sample data.
-->

<script lang="ts">
  import {
    ArrowLeft,
    ArrowRight,
    CalendarDays,
    Check,
    CloudSun,
    ListTodo,
    MapPin,
    Plus,
    Send
  } from '@lucide/svelte';
  import { dev } from '$app/environment';
  import { page } from '$app/state';
  import { replaceState } from '$app/navigation';

  type Variant = 'a' | 'b' | 'c';
  type Task = { id: number; title: string; category: string; urgency: 'low' | 'medium' | 'high'; done: boolean };

  const variants: Array<{ key: Variant; name: string; thesis: string }> = [
    { key: 'a', name: 'Quiet divider', thesis: 'Supporting context above; Todo stays the obvious work surface.' },
    { key: 'b', name: 'Context deck', thesis: 'A light briefing band makes the transition explicit without adding chrome.' },
    { key: 'c', name: 'Workspace split', thesis: 'Todo gets its own surface while the day context recedes into a compact strip.' }
  ];

  const initialTasks: Task[] = [
    { id: 1, title: 'Send revised proposal', category: 'Today', urgency: 'high', done: false },
    { id: 2, title: 'Book dentist appointment', category: 'Today', urgency: 'medium', done: false },
    { id: 3, title: 'Pick up the parcel', category: 'Personal', urgency: 'low', done: false },
    { id: 4, title: 'Prepare sprint notes', category: 'Work', urgency: 'medium', done: false },
    { id: 5, title: 'Review the research outline', category: 'Work', urgency: 'low', done: false }
  ];
  const categories = ['Today', 'Personal', 'Work'];
  const contextItems = [
    { label: 'Weather', value: '23° · Clear morning', detail: 'Warsaw', icon: CloudSun, tone: 'weather' },
    { label: 'Commute', value: '34 min', detail: 'Office · 8 min slower', icon: MapPin, tone: 'commute' },
    { label: 'Calendar', value: '3 events', detail: 'First event at 09:30', icon: CalendarDays, tone: 'calendar' }
  ] as const;

  let tasks = $state<Task[]>(initialTasks.map((task) => ({ ...task })));
  let newTask = $state('');
  let nextTaskId = 6;

  const requestedVariant = $derived(page.url.searchParams.get('variant')?.toLowerCase());
  const variant = $derived<Variant>(
    requestedVariant === 'b' || requestedVariant === 'c' ? requestedVariant : 'a'
  );
  const variantIndex = $derived(variants.findIndex((item) => item.key === variant));
  const openTasks = $derived(tasks.filter((task) => !task.done));

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

  const toggleTask = (id: number) => {
    tasks = tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task));
  };

  const addTask = () => {
    const title = newTask.trim();
    if (!title) return;
    tasks = [...tasks, { id: nextTaskId++, title, category: 'Today', urgency: 'low', done: false }];
    newTask = '';
  };

  const tasksFor = (category: string) => openTasks.filter((task) => task.category === category);
</script>

<svelte:window onkeydown={handleKeydown} />
<svelte:head><title>Daily separation prototype</title></svelte:head>

<main class={`prototype-shell prototype-shell--${variant}`}>
  <header class="prototype-header">
    <div>
      <span class="prototype-kicker">DAILY / TUESDAY, JULY 28</span>
      <h1>Good morning.</h1>
    </div>
    <div class="delivery-status">
      <span class="delivery-status__dot"></span>
      <span><strong>Delivery on</strong><small>Tomorrow at 07:00</small></span>
    </div>
  </header>

  {#if variant === 'a'}
    <section class="quiet-context" aria-labelledby="quiet-context-title">
      <div class="section-heading section-heading--context">
        <div><span class="section-kicker">DAILY SUMMARY</span><h2 id="quiet-context-title">Your day at a glance</h2></div>
        <span class="section-note">Supporting context</span>
      </div>
      <div class="quiet-context__items">
        {#each contextItems as item}
          {@const Icon = item.icon}
          <button class="quiet-context__item" type="button">
            <span class={`context-icon context-icon--${item.tone}`}><Icon size={17} /></span>
            <span><small>{item.label} · {item.detail}</small><strong>{item.value}</strong></span>
            <span class="context-arrow">→</span>
          </button>
        {/each}
      </div>
    </section>

    <section class="quiet-todo" aria-labelledby="quiet-todo-title">
      <div class="zone-divider" aria-hidden="true"></div>
      <div class="section-heading">
        <div><span class="section-kicker">WORKSPACE</span><h2 id="quiet-todo-title">Todo</h2></div>
        <span class="section-note">{openTasks.length} open tasks</span>
      </div>
      {@render Capture()}
      {@render TaskRows()}
    </section>
  {:else if variant === 'b'}
    <section class="deck-context" aria-labelledby="deck-context-title">
      <div class="deck-context__header">
        <div><span class="section-kicker">DAILY SUMMARY</span><h2 id="deck-context-title">Supporting context</h2></div>
        <span class="deck-context__date">Tue · 28 Jul</span>
      </div>
      <div class="deck-context__grid">
        {#each contextItems as item}
          {@const Icon = item.icon}
          <button class="context-card" type="button">
            <span class={`context-icon context-icon--${item.tone}`}><Icon size={18} /></span>
            <span class="context-card__copy"><small>{item.label}</small><strong>{item.value}</strong><em>{item.detail}</em></span>
            <span class="context-card__open">Open</span>
          </button>
        {/each}
        <button class="context-card context-card--delivery" type="button">
          <span class="context-icon context-icon--delivery"><Send size={17} /></span>
          <span class="context-card__copy"><small>Mail delivery</small><strong>07:00</strong><em>Tomorrow morning</em></span>
          <span class="context-card__open">Edit</span>
        </button>
      </div>
    </section>

    <section class="deck-todo" aria-labelledby="deck-todo-title">
      <header class="deck-todo__header">
        <div><span class="section-kicker">YOUR WORKSPACE</span><h2 id="deck-todo-title">Todo</h2></div>
        <span>{openTasks.length} open</span>
      </header>
      {@render Capture()}
      {@render TaskRows()}
    </section>
  {:else}
    <section class="split-context" aria-labelledby="split-context-title">
      <div class="split-context__title">
        <span class="section-kicker">DAY BRIEF</span>
        <h2 id="split-context-title">Context</h2>
      </div>
      <div class="split-context__items">
        {#each contextItems as item}
          {@const Icon = item.icon}
          <button class="split-context__item" type="button">
            <Icon size={16} />
            <span><small>{item.label}</small><strong>{item.value}</strong></span>
          </button>
        {/each}
        <button class="split-context__item split-context__item--delivery" type="button">
          <Send size={16} />
          <span><small>Delivery</small><strong>07:00 · On</strong></span>
        </button>
      </div>
    </section>

    <section class="split-todo" aria-labelledby="split-todo-title">
      <header class="split-todo__header">
        <div><span class="section-kicker">ACTIVE WORKSPACE</span><h2 id="split-todo-title">Todo</h2></div>
        <span class="split-todo__count">{openTasks.length} open</span>
      </header>
      {@render Capture()}
      <div class="split-todo__columns">
        {#each categories as category}
          <section class="split-column" aria-labelledby={`split-${category}`}>
            <header><h3 id={`split-${category}`}>{category}</h3><span>{tasksFor(category).length}</span></header>
            <div class="split-column__tasks">
              {#each tasksFor(category) as task (task.id)}
                {@render CompactTask(task)}
              {:else}
                <span class="empty-state">Clear</span>
              {/each}
            </div>
          </section>
        {/each}
      </div>
    </section>
  {/if}
</main>

{#snippet Capture()}
  <form class="capture" onsubmit={(event) => { event.preventDefault(); addTask(); }}>
    <Plus size={18} aria-hidden="true" />
    <input bind:value={newTask} aria-label="New Todo Task" placeholder="Capture a task…" />
    <button type="submit" disabled={!newTask.trim()}>Add task</button>
  </form>
{/snippet}

{#snippet TaskRows()}
  <div class="task-groups">
    {#each categories as category}
      <section class="task-group" aria-labelledby={`group-${category}`}>
        <header><h3 id={`group-${category}`}>{category}</h3><span>{tasksFor(category).length}</span></header>
        <div class="task-group__rows">
          {#each tasksFor(category) as task (task.id)}
            {@render CompactTask(task)}
          {:else}
            <span class="empty-state">Clear</span>
          {/each}
        </div>
      </section>
    {/each}
  </div>
{/snippet}

{#snippet CompactTask(task: Task)}
  <div class:task--done={task.done} class="task-row">
    <button type="button" class="task-check" aria-label={`${task.done ? 'Reopen' : 'Complete'} ${task.title}`} onclick={() => toggleTask(task.id)}>
      {#if task.done}<Check size={13} />{/if}
    </button>
    <span class="task-title">{task.title}</span>
    <span class={`urgency urgency--${task.urgency}`}>{task.urgency === 'high' ? 'Urgent' : task.urgency === 'medium' ? 'Soon' : 'Flexible'}</span>
  </div>
{/snippet}

{#if dev}
  <nav class="prototype-switcher" aria-label="Prototype variants">
    <button type="button" aria-label="Previous variant" onclick={() => cycleVariant(-1)}><ArrowLeft size={17} /></button>
    <span><strong>{variant.toUpperCase()} · {variants[variantIndex].name}</strong><small>{variants[variantIndex].thesis}</small></span>
    <button type="button" aria-label="Next variant" onclick={() => cycleVariant(1)}><ArrowRight size={17} /></button>
  </nav>
{/if}

<style>
  :global(*) { box-sizing: border-box; }
  :global(body) { margin: 0; background: #f7f8f5; color: #20251f; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
  button, input { font: inherit; }
  button { cursor: pointer; }
  .prototype-shell { width: min(1160px, calc(100% - 48px)); margin: 0 auto; padding: 38px 0 120px; }
  .prototype-header { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 32px; }
  .prototype-kicker, .section-kicker { color: #747c71; font-size: 10px; font-weight: 750; letter-spacing: .08em; }
  .prototype-header h1 { margin: 9px 0 0; color: #1e251e; font-size: clamp(30px, 4vw, 47px); letter-spacing: -.04em; line-height: .98; }
  .delivery-status { display: flex; align-items: center; gap: 10px; border: 1px solid #dce3d7; border-radius: 10px; background: #fff; padding: 11px 14px; }
  .delivery-status__dot { width: 9px; height: 9px; border-radius: 50%; background: #587542; box-shadow: 0 0 0 4px #edf3e9; }
  .delivery-status strong, .delivery-status small { display: block; }
  .delivery-status strong { font-size: 11px; }
  .delivery-status small { margin-top: 3px; color: #798276; font-size: 9px; }
  .section-heading, .deck-context__header, .deck-todo__header, .split-todo__header { display: flex; align-items: end; justify-content: space-between; gap: 20px; }
  .section-heading h2, .deck-context h2, .deck-todo h2, .split-context h2, .split-todo h2 { margin: 7px 0 0; color: #252c25; font-size: 22px; letter-spacing: -.025em; }
  .section-note, .deck-todo__header > span, .split-todo__count { color: #7b8478; font-size: 10px; }
  .quiet-context { padding-top: 1px; }
  .section-heading--context { padding: 0 2px 14px; }
  .quiet-context__items { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid #dfe4dd; border-bottom: 1px solid #dfe4dd; }
  .quiet-context__item { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 11px; border: 0; border-right: 1px solid #e7ebe5; background: transparent; padding: 17px 18px; color: #4e5a4d; text-align: left; }
  .quiet-context__item:last-child { border-right: 0; }
  .quiet-context__item:hover { background: #f0f4ed; }
  .quiet-context__item > span:nth-child(2), .context-card__copy, .split-context__item > span { min-width: 0; }
  .quiet-context__item small, .quiet-context__item strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .quiet-context__item small { margin-bottom: 5px; color: #828a7f; font-size: 9px; }
  .quiet-context__item strong { color: #2c342c; font-size: 13px; }
  .context-arrow { color: #98a194; font-size: 16px; }
  .context-icon { width: 34px; height: 34px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 9px; }
  .context-icon--weather { background: #edf3fb; color: #56739a; }
  .context-icon--commute { background: #f8f1e4; color: #a37738; }
  .context-icon--calendar { background: #edf4ec; color: #648359; }
  .context-icon--delivery { background: #edf1fa; color: #596e9d; }
  .quiet-todo { margin-top: 31px; }
  .zone-divider { height: 1px; margin-bottom: 24px; background: #d3d9d0; }
  .capture { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; margin: 22px 0 25px; border: 1px solid #cbd5c7; border-radius: 10px; background: #fff; color: #6e796b; padding: 8px 9px 8px 14px; box-shadow: 0 6px 18px rgb(30 39 24 / .05); }
  .capture:focus-within { border-color: #6b8556; box-shadow: 0 0 0 3px rgb(92 120 69 / .12); }
  .capture input { min-width: 0; border: 0; outline: 0; background: transparent; padding: 8px 0; color: #252b24; font-size: 13px; }
  .capture button { min-height: 36px; border: 1px solid #587542; border-radius: 8px; background: #587542; color: #fff; padding: 0 14px; font-size: 10px; font-weight: 750; }
  .capture button:disabled { border-color: #d9ded5; background: #e8ebe5; color: #92978f; }
  .task-groups { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .task-group { overflow: hidden; border: 1px solid #dfe4dc; border-radius: 10px; background: #fff; }
  .task-group > header, .split-column > header { display: flex; align-items: center; justify-content: space-between; gap: 10px; border-bottom: 1px solid #e9ede7; padding: 12px 13px; }
  .task-group h3, .split-column h3 { margin: 0; color: #394137; font-size: 11px; }
  .task-group > header span, .split-column > header span { color: #8a9386; font-size: 9px; }
  .task-group__rows, .split-column__tasks { min-height: 46px; }
  .task-row { min-height: 47px; display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; gap: 9px; border-bottom: 1px solid #edf0eb; padding: 4px 10px; }
  .task-row:last-child { border-bottom: 0; }
  .task-row:hover { background: #fafcf9; }
  .task-check { width: 21px; height: 21px; display: grid; place-items: center; border: 1px solid #cfd8ca; border-radius: 6px; background: #fff; color: #587542; padding: 0; }
  .task-check:hover { border-color: #789366; background: #f2f6ef; }
  .task-title { min-width: 0; overflow: hidden; color: #30372e; font-size: 11px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
  .task--done .task-title { color: #9aa398; text-decoration: line-through; }
  .urgency { font-size: 9px; white-space: nowrap; }
  .urgency--high { color: #bd5550; }
  .urgency--medium { color: #a4792d; }
  .urgency--low { color: #829083; }
  .empty-state { display: grid; min-height: 46px; place-items: center; color: #a1a99f; font-size: 9px; }
  .deck-context { border: 1px solid #dbe5d6; border-radius: 14px; background: #f0f5ed; padding: 20px; }
  .deck-context__date { color: #6f7d6c; font-size: 10px; }
  .deck-context__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 9px; margin-top: 17px; }
  .context-card { min-width: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; border: 1px solid #e0e8dc; border-radius: 10px; background: #fff; padding: 13px 12px; text-align: left; }
  .context-card:hover { border-color: #b8caaE; box-shadow: 0 5px 14px rgb(49 76 39 / .06); }
  .context-card__copy small, .context-card__copy strong, .context-card__copy em { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .context-card__copy small { margin: 1px 0 6px; color: #778374; font-size: 9px; }
  .context-card__copy strong { color: #2e392c; font-size: 12px; }
  .context-card__copy em { margin-top: 4px; color: #8a9486; font-size: 9px; font-style: normal; }
  .context-card__open { grid-column: 2; margin-top: 8px; color: #617d49; font-size: 9px; font-weight: 700; }
  .deck-todo { margin-top: 24px; border: 1px solid #dce2d9; border-radius: 14px; background: #fff; padding: 22px 20px 20px; }
  .deck-todo__header { align-items: center; }
  .deck-todo__header h2 { margin-top: 6px; }
  .deck-todo .capture { margin-bottom: 20px; box-shadow: none; }
  .deck-todo .task-group { border-color: #e2e7df; }
  .split-context { display: grid; grid-template-columns: 170px minmax(0, 1fr); align-items: stretch; border-bottom: 1px solid #d8ded5; padding-bottom: 17px; }
  .split-context__title { display: flex; flex-direction: column; justify-content: center; border-right: 1px solid #dfe5dc; }
  .split-context h2 { margin-top: 5px; }
  .split-context__items { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px; padding-left: 18px; }
  .split-context__item { min-width: 0; display: flex; align-items: center; gap: 9px; border: 0; border-radius: 8px; background: transparent; color: #738071; padding: 8px 10px; text-align: left; }
  .split-context__item:hover { background: #eef3eb; color: #4f6943; }
  .split-context__item small, .split-context__item strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .split-context__item small { color: #8a9487; font-size: 9px; }
  .split-context__item strong { margin-top: 5px; color: #374337; font-size: 11px; }
  .split-context__item--delivery { color: #637599; }
  .split-todo { margin-top: 30px; background: #fff; padding: 21px 18px 18px; box-shadow: 0 10px 28px rgb(35 52 31 / .07); }
  .split-todo__header { align-items: center; }
  .split-todo__header h2 { margin-top: 5px; font-size: 26px; }
  .split-todo__count { border-radius: 999px; background: #eef4ea; color: #557244; padding: 6px 9px; }
  .split-todo .capture { margin-top: 19px; box-shadow: none; }
  .split-todo__columns { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .split-column { overflow: hidden; border: 1px solid #e1e7df; border-radius: 8px; background: #fbfcfa; }
  .split-column__tasks { background: #fff; }
  .prototype-switcher { position: fixed; z-index: 4; bottom: 22px; left: 50%; display: grid; grid-template-columns: 42px minmax(190px, 1fr) 42px; align-items: center; gap: 8px; width: min(410px, calc(100% - 32px)); transform: translateX(-50%); border: 1px solid #263023; border-radius: 16px; background: #1e251e; padding: 7px; color: #fff; box-shadow: 0 14px 32px rgb(25 31 23 / .24); }
  .prototype-switcher button { width: 40px; height: 40px; display: grid; place-items: center; border: 0; border-radius: 10px; background: transparent; color: #dce5d8; }
  .prototype-switcher button:hover { background: #354333; }
  .prototype-switcher span { min-width: 0; text-align: center; }
  .prototype-switcher strong, .prototype-switcher small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .prototype-switcher strong { font-size: 10px; }
  .prototype-switcher small { margin-top: 3px; color: #aeb9a9; font-size: 8px; }
  @media (max-width: 850px) {
    .prototype-shell { width: min(100% - 32px, 640px); padding-top: 24px; }
    .prototype-header { align-items: flex-start; flex-direction: column; margin-bottom: 24px; }
    .delivery-status { align-self: stretch; }
    .quiet-context__items, .deck-context__grid, .task-groups, .split-todo__columns { grid-template-columns: 1fr; }
    .quiet-context__item { border-right: 0; border-bottom: 1px solid #e7ebe5; }
    .quiet-context__item:last-child { border-bottom: 0; }
    .deck-context__grid { gap: 7px; }
    .context-card { grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; }
    .context-card__open { grid-column: auto; margin-top: 0; }
    .split-context { grid-template-columns: 1fr; gap: 14px; }
    .split-context__title { border-right: 0; }
    .split-context__items { grid-template-columns: repeat(2, 1fr); padding-left: 0; }
    .split-todo { margin-top: 22px; padding: 18px 14px 14px; }
  }
  @media (max-width: 480px) {
    .prototype-shell { width: calc(100% - 24px); padding-bottom: 110px; }
    .prototype-header h1 { font-size: 34px; }
    .section-heading, .deck-context__header, .deck-todo__header, .split-todo__header { align-items: flex-start; flex-direction: column; gap: 7px; }
    .capture { grid-template-columns: auto minmax(0, 1fr); }
    .capture button { grid-column: 1 / -1; min-height: 42px; }
    .split-context__items { gap: 3px; }
  }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; } }
</style>
