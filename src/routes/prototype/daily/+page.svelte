<!--
  PROTOTYPE — three responsive Daily dashboard directions, switchable with ?variant=.

  A / DAILY DESK
  THESIS: Todo is the desk; configured context sits at its edge, never in its way.
  OWN-WORLD: Cool white, ink blue, hairline rules, compact rectangular controls.
  STORY: See delivery state, capture a task, work the list, glance at the day.
  FIRST VIEWPORT: Rail / task ledger / narrow day brief, with delivery in the header.
  FORM: Desktop workspace that becomes a focused single-column mobile tool.

  B / MORNING SHEET
  THESIS: Daily reads like a purposeful morning sheet, not a settings dashboard.
  OWN-WORLD: Butter paper, cobalt ink, oversized sans type, ruled list rows.
  STORY: Add the next thing, clear the list, open supporting context only when needed.
  FIRST VIEWPORT: Date and delivery masthead above one generous task stream.
  FORM: Mobile-first reading-and-action flow with progressive disclosure.

  C / TASK BOARD
  THESIS: Categories remain active workspaces, expressed with the quiet precision of a morning control panel.
  OWN-WORLD: Cool white, olive green, graphite type, fine gray rules, compact outline controls.
  STORY: Move through task groups while trusting the quiet systems above them.
  FIRST VIEWPORT: Slim tool rail, live status ribbon, three task columns.
  FORM: The Task Board layout, restyled from the supplied Morning Control reference.

  TASK DENSITY STUDY — switch with ?variant=c&tasks=a|b|c.
  A / COMPACT CARDS: Familiar card affordance compressed to its useful content.
  B / LEDGER ROWS: Maximum scan density, expressed as one ruled task ledger.
  C / FOCUS ROWS: Airier checklist rows with completion as the primary control.
-->

<script lang="ts">
  import {
    ArrowLeft,
    ArrowRight,
    CalendarDays,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    CloudSun,
    Ellipsis,
    History,
    Inbox,
    ListTodo,
    LogOut,
    MapPin,
    Menu,
    Pause,
    Pencil,
    Plus,
    Send,
    Search,
    Settings,
    SlidersHorizontal,
    Sparkles,
    SunMedium,
    Trash2,
    X
  } from '@lucide/svelte';
  import { dev } from '$app/environment';
  import { page } from '$app/state';
  import { goto, replaceState } from '$app/navigation';
  import { tick } from 'svelte';

  type Variant = 'a' | 'b' | 'c';
  type TaskStyle = 'a' | 'b' | 'c';
  type TaskCategory = string;
  type PrototypeTask = {
    id: number;
    title: string;
    category: TaskCategory;
    urgency: 'low' | 'medium' | 'high';
    done: boolean;
  };
  type WeatherCity = {
    name: string;
    country: string;
    temperature: number;
    condition: string;
  };
  type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  type CommuteRoute = {
    id: number;
    from: string;
    to: string;
    days: Weekday[];
  };
  type CalendarSource = {
    id: string;
    name: string;
    color: string;
    enabled: boolean;
  };
  type CalendarEvent = {
    id: number;
    date: string;
    time: string;
    title: string;
    calendarId: string;
    detail?: string;
  };

  const variants: Array<{ key: Variant; name: string }> = [
    { key: 'a', name: 'Daily Desk' },
    { key: 'b', name: 'Morning Sheet' },
    { key: 'c', name: 'Task Board' }
  ];
  const taskStyles: Array<{ key: TaskStyle; name: string }> = [
    { key: 'a', name: 'Compact Cards' },
    { key: 'b', name: 'Ledger Rows' },
    { key: 'c', name: 'Focus Rows' }
  ];
  const weatherCities: WeatherCity[] = [
    { name: 'Warsaw', country: 'Poland', temperature: 23, condition: 'Clear morning' },
    { name: 'Kraków', country: 'Poland', temperature: 22, condition: 'Partly cloudy' },
    { name: 'Wrocław', country: 'Poland', temperature: 24, condition: 'Sunny' },
    { name: 'Gdańsk', country: 'Poland', temperature: 19, condition: 'Light breeze' },
    { name: 'Poznań', country: 'Poland', temperature: 23, condition: 'Mostly sunny' },
    { name: 'Łódź', country: 'Poland', temperature: 21, condition: 'Cloudy' }
  ];
  const weekdays: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const calendarEvents: CalendarEvent[] = [
    { id: 1, date: 'Today · Tue 28 Jul', time: '09:30', title: 'Design sync', calendarId: 'work', detail: 'Google Meet' },
    { id: 2, date: 'Today · Tue 28 Jul', time: '14:00', title: 'Dentist appointment', calendarId: 'personal', detail: 'Marszałkowska 18' },
    { id: 3, date: 'Wed 29 Jul', time: '11:00', title: 'Weekly planning', calendarId: 'work', detail: 'Room 4B' },
    { id: 4, date: 'Fri 31 Jul', time: '18:30', title: 'Dinner with Marta', calendarId: 'personal' },
    { id: 5, date: 'Sun 2 Aug', time: 'All day', title: 'Anna’s birthday', calendarId: 'birthdays' },
    { id: 6, date: 'Mon 3 Aug', time: '10:00', title: 'Roadmap review', calendarId: 'work', detail: 'Google Meet' }
  ];

  let tasks = $state<PrototypeTask[]>([
    { id: 1, title: 'Send revised proposal', category: 'Today', urgency: 'high', done: false },
    { id: 2, title: 'Book dentist appointment', category: 'Today', urgency: 'medium', done: false },
    { id: 3, title: 'Pick up the parcel', category: 'Personal', urgency: 'low', done: false },
    { id: 4, title: 'Prepare sprint notes', category: 'Work', urgency: 'medium', done: false },
    { id: 5, title: 'Review the research outline', category: 'Work', urgency: 'low', done: false }
  ]);
  let newTask = $state('');
  let deliveryEnabled = $state(true);
  let mobileMenuOpen = $state(false);
  let briefOpen = $state(false);
  let secondaryPanel = $state<'menu' | 'history' | 'settings' | null>(null);
  let placementOpen = $state(false);
  let placementCategory = $state<TaskCategory>('Ungrouped');
  let placementUrgency = $state<PrototypeTask['urgency']>('low');
  let placementDialog = $state<HTMLDialogElement>();
  let taskGroups = $state<TaskCategory[]>(['Today', 'Personal', 'Work']);
  let addingGroup = $state(false);
  let newGroupName = $state('');
  let groupError = $state('');
  let deletingGroup = $state<TaskCategory | null>(null);
  let weatherCity = $state('Warsaw');
  let cityPickerOpen = $state(false);
  let cityQuery = $state('');
  let cityHighlight = $state(0);
  let cityDialog = $state<HTMLDialogElement>();
  let commuteRoutes = $state<CommuteRoute[]>([
    {
      id: 1,
      from: 'Home · Mokotów',
      to: 'Office · Rondo Daszyńskiego',
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
    },
    {
      id: 2,
      from: 'Home · Mokotów',
      to: 'Gym · Wola',
      days: ['Tue', 'Thu', 'Sat']
    }
  ]);
  let commuteDialogOpen = $state(false);
  let commuteDialog = $state<HTMLDialogElement>();
  let editingCommuteId = $state<number | null>(null);
  let commuteFrom = $state('');
  let commuteTo = $state('');
  let commuteDays = $state<Weekday[]>([]);
  let nextCommuteId = 3;
  let googleCalendarConnected = $state(false);
  let calendarJustDisconnected = $state(false);
  let calendarAuthOpen = $state(false);
  let calendarAgendaOpen = $state(false);
  let calendarSettingsOpen = $state(false);
  let calendarDisconnectConfirm = $state(false);
  let calendarTile = $state<HTMLButtonElement>();
  let calendarAuthDialog = $state<HTMLDialogElement>();
  let calendarAgendaDialog = $state<HTMLDialogElement>();
  let calendarSettingsDialog = $state<HTMLDialogElement>();
  let calendarSources = $state<CalendarSource[]>([
    { id: 'personal', name: 'Personal', color: '#617d49', enabled: true },
    { id: 'work', name: 'Work', color: '#4f6f9f', enabled: true },
    { id: 'birthdays', name: 'Birthdays', color: '#d6a52d', enabled: false }
  ]);
  let editingTaskId = $state<number | null>(null);
  let editingTaskTitle = $state('');
  let editingTaskUrgency = $state<PrototypeTask['urgency']>('low');
  let nextId = 6;

  const requestedVariant = $derived(page.url.searchParams.get('variant')?.toLowerCase());
  const variant = $derived<Variant>(
    requestedVariant === 'b' || requestedVariant === 'c' ? requestedVariant : 'a'
  );
  const variantIndex = $derived(variants.findIndex((item) => item.key === variant));
  const requestedTaskStyle = $derived(page.url.searchParams.get('tasks')?.toLowerCase());
  const taskStyle = $derived<TaskStyle>(
    requestedTaskStyle === 'a' || requestedTaskStyle === 'c' ? requestedTaskStyle : 'b'
  );
  const taskStyleIndex = $derived(taskStyles.findIndex((item) => item.key === taskStyle));
  const activeTasks = $derived(tasks.filter((task) => !task.done));
  const completedCount = $derived(tasks.filter((task) => task.done).length);
  const taskCategories = $derived([...taskGroups, 'Ungrouped']);
  const taskUrgencies: PrototypeTask['urgency'][] = ['low', 'medium', 'high'];
  const weatherCityDetails = $derived(
    weatherCities.find((city) => city.name === weatherCity) ?? weatherCities[0]
  );
  const filteredWeatherCities = $derived(
    weatherCities.filter((city) =>
      `${city.name} ${city.country}`.toLocaleLowerCase().includes(cityQuery.trim().toLocaleLowerCase())
    )
  );
  const commuteSummary = $derived(
    commuteRoutes.length === 0
      ? 'No routes'
      : commuteRoutes.length === 1
        ? commuteRoutes[0].to
        : `${commuteRoutes.length} routes`
  );
  const visibleCalendarEvents = $derived(
    calendarEvents.filter((event) =>
      calendarSources.some((source) => source.id === event.calendarId && source.enabled)
    )
  );
  const calendarAgenda = $derived(
    [...new Set(calendarEvents.map((event) => event.date))]
      .map((date) => ({
        date,
        events: visibleCalendarEvents.filter((event) => event.date === date)
      }))
      .filter((day) => day.events.length)
  );
  const enabledCalendarCount = $derived(calendarSources.filter((source) => source.enabled).length);

  const setVariant = (next: Variant) => {
    const nextUrl = new URL(page.url);
    nextUrl.searchParams.set('variant', next);
    replaceState(nextUrl, page.state);
    mobileMenuOpen = false;
  };

  const cycleVariant = (direction: -1 | 1) => {
    const nextIndex = (variantIndex + direction + variants.length) % variants.length;
    setVariant(variants[nextIndex].key);
  };

  const setTaskStyle = (next: TaskStyle) => {
    const nextUrl = new URL(page.url);
    nextUrl.searchParams.set('variant', 'c');
    nextUrl.searchParams.set('tasks', next);
    void goto(nextUrl, { replaceState: true, noScroll: true, keepFocus: true });
  };

  const cycleTaskStyle = (direction: -1 | 1) => {
    const nextIndex = (taskStyleIndex + direction + taskStyles.length) % taskStyles.length;
    setTaskStyle(taskStyles[nextIndex].key);
  };

  const handleKeydown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === 'ArrowLeft') variant === 'c' ? cycleTaskStyle(-1) : cycleVariant(-1);
    if (event.key === 'ArrowRight') variant === 'c' ? cycleTaskStyle(1) : cycleVariant(1);
  };

  const addTask = (
    category: TaskCategory = 'Ungrouped',
    urgency: PrototypeTask['urgency'] = 'low'
  ) => {
    const title = newTask.trim();
    if (!title) return;

    tasks = [
      { id: nextId, title, category, urgency, done: false },
      ...tasks
    ];
    nextId += 1;
    newTask = '';
  };

  const openPlacement = async () => {
    if (!newTask.trim()) return;
    placementCategory = 'Ungrouped';
    placementUrgency = 'low';
    placementOpen = true;
    await tick();
    placementDialog?.showModal();
    placementDialog?.focus();
  };

  const closePlacement = () => {
    placementDialog?.close();
    placementOpen = false;
  };

  const confirmPlacement = () => {
    addTask(placementCategory, placementUrgency);
    placementDialog?.close();
    placementOpen = false;
  };

  const cyclePlacementCategory = (direction: -1 | 1) => {
    const currentIndex = taskCategories.indexOf(placementCategory);
    const nextIndex = (currentIndex + direction + taskCategories.length) % taskCategories.length;
    placementCategory = taskCategories[nextIndex];
  };

  const cyclePlacementUrgency = (direction: -1 | 1) => {
    const currentIndex = taskUrgencies.indexOf(placementUrgency);
    const nextIndex = (currentIndex + direction + taskUrgencies.length) % taskUrgencies.length;
    placementUrgency = taskUrgencies[nextIndex];
  };

  const handlePlacementKeydown = (event: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape'].includes(event.key)) {
      event.stopPropagation();
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      cyclePlacementCategory(event.key === 'ArrowUp' ? -1 : 1);
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      cyclePlacementUrgency(event.key === 'ArrowLeft' ? -1 : 1);
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      confirmPlacement();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closePlacement();
    }
  };

  const startAddingGroup = async () => {
    deletingGroup = null;
    addingGroup = true;
    groupError = '';
    await tick();
    document.querySelector<HTMLInputElement>('[data-new-group]')?.focus();
  };

  const cancelAddingGroup = () => {
    addingGroup = false;
    newGroupName = '';
    groupError = '';
  };

  const addGroup = () => {
    const name = newGroupName.trim();
    if (!name) {
      groupError = 'Enter a group name.';
      return;
    }
    if (taskCategories.some((group) => group.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      groupError = 'That group already exists.';
      return;
    }

    taskGroups = [...taskGroups, name];
    addingGroup = false;
    newGroupName = '';
    groupError = '';
  };

  const confirmDeleteGroup = (category: TaskCategory) => {
    tasks = tasks.map((task) =>
      task.category === category ? { ...task, category: 'Ungrouped' } : task
    );
    taskGroups = taskGroups.filter((group) => group !== category);
    if (placementCategory === category) placementCategory = 'Ungrouped';
    deletingGroup = null;
  };

  const openCityPicker = async () => {
    cityQuery = '';
    cityHighlight = Math.max(
      0,
      weatherCities.findIndex((city) => city.name === weatherCity)
    );
    cityPickerOpen = true;
    await tick();
    cityDialog?.showModal();
    document.querySelector<HTMLInputElement>('[data-city-search]')?.focus();
  };

  const closeCityPicker = () => {
    cityDialog?.close();
    cityPickerOpen = false;
  };

  const confirmCity = (city = filteredWeatherCities[cityHighlight]) => {
    if (!city) return;
    weatherCity = city.name;
    closeCityPicker();
  };

  const handleCityPickerKeydown = (event: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(event.key)) {
      event.stopPropagation();
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      if (!filteredWeatherCities.length) return;
      const direction = event.key === 'ArrowUp' ? -1 : 1;
      cityHighlight =
        (cityHighlight + direction + filteredWeatherCities.length) %
        filteredWeatherCities.length;
      document.getElementById(`weather-city-${cityHighlight}`)?.scrollIntoView({ block: 'nearest' });
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      confirmCity();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeCityPicker();
    }
  };

  const openCommuteDialog = async () => {
    editingCommuteId = null;
    commuteDialogOpen = true;
    await tick();
    commuteDialog?.showModal();
    commuteDialog?.focus();
  };

  const closeCommuteDialog = () => {
    commuteDialog?.close();
    commuteDialogOpen = false;
    editingCommuteId = null;
  };

  const editCommuteRoute = async (route: CommuteRoute | undefined = undefined) => {
    editingCommuteId = route?.id ?? 0;
    commuteFrom = route?.from ?? '';
    commuteTo = route?.to ?? '';
    commuteDays = route ? [...route.days] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    await tick();
    document.querySelector<HTMLInputElement>('[data-commute-from]')?.focus();
  };

  const toggleCommuteDay = (day: Weekday) => {
    commuteDays = commuteDays.includes(day)
      ? commuteDays.filter((item) => item !== day)
      : weekdays.filter((item) => [...commuteDays, day].includes(item));
  };

  const saveCommuteRoute = () => {
    const from = commuteFrom.trim();
    const to = commuteTo.trim();
    if (!from || !to || !commuteDays.length || editingCommuteId === null) return;

    if (editingCommuteId === 0) {
      commuteRoutes = [
        ...commuteRoutes,
        { id: nextCommuteId, from, to, days: [...commuteDays] }
      ];
      nextCommuteId += 1;
    } else {
      commuteRoutes = commuteRoutes.map((route) =>
        route.id === editingCommuteId ? { ...route, from, to, days: [...commuteDays] } : route
      );
    }
    editingCommuteId = null;
  };

  const deleteCommuteRoute = () => {
    if (editingCommuteId === null || editingCommuteId === 0) return;
    commuteRoutes = commuteRoutes.filter((route) => route.id !== editingCommuteId);
    editingCommuteId = null;
  };

  const openCalendarAgenda = async () => {
    if (!googleCalendarConnected) {
      calendarJustDisconnected = false;
      calendarAuthOpen = true;
      await tick();
      calendarAuthDialog?.showModal();
      calendarAuthDialog?.focus();
      return;
    }

    calendarAgendaOpen = true;
    await tick();
    calendarAgendaDialog?.showModal();
    calendarAgendaDialog?.focus();
  };

  const closeCalendarAgenda = () => {
    calendarAgendaDialog?.close();
    calendarAgendaOpen = false;
    calendarTile?.focus();
  };

  const closeCalendarAuth = () => {
    calendarAuthDialog?.close();
    calendarAuthOpen = false;
    calendarTile?.focus();
  };

  const authorizeGoogleCalendar = async () => {
    calendarAuthDialog?.close();
    calendarAuthOpen = false;
    googleCalendarConnected = true;
    await openCalendarAgenda();
  };

  const openCalendarSettings = async () => {
    closeCalendarAgenda();
    calendarDisconnectConfirm = false;
    calendarSettingsOpen = true;
    await tick();
    calendarSettingsDialog?.showModal();
    calendarSettingsDialog?.focus();
  };

  const closeCalendarSettings = (returnFocus = true) => {
    calendarSettingsDialog?.close();
    calendarSettingsOpen = false;
    calendarDisconnectConfirm = false;
    if (returnFocus) calendarTile?.focus();
  };

  const returnToCalendarAgenda = async () => {
    closeCalendarSettings(false);
    await openCalendarAgenda();
  };

  const toggleCalendarSource = (id: string) => {
    calendarSources = calendarSources.map((source) =>
      source.id === id ? { ...source, enabled: !source.enabled } : source
    );
  };

  const disconnectGoogleCalendar = () => {
    closeCalendarSettings();
    googleCalendarConnected = false;
    calendarJustDisconnected = true;
  };

  const toggleTask = (id: number) => {
    tasks = tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task));
  };

  const startEditingTask = async (task: PrototypeTask) => {
    editingTaskId = task.id;
    editingTaskTitle = task.title;
    editingTaskUrgency = task.urgency;
    await tick();
    document.querySelector<HTMLInputElement>(`[data-task-edit="${task.id}"]`)?.focus();
  };

  const saveEditedTask = () => {
    const title = editingTaskTitle.trim();
    if (editingTaskId !== null && title) {
      tasks = tasks.map((task) =>
        task.id === editingTaskId ? { ...task, title, urgency: editingTaskUrgency } : task
      );
    }
    editingTaskId = null;
    editingTaskTitle = '';
    editingTaskUrgency = 'low';
  };

  const cancelEditingTask = () => {
    editingTaskId = null;
    editingTaskTitle = '';
    editingTaskUrgency = 'low';
  };

  const handleEditorOutsidePointerDown = (event: PointerEvent) => {
    if (editingTaskId === null) return;
    const clickedInsideEditor = event
      .composedPath()
      .some(
        (target) =>
          target instanceof HTMLElement && target.classList.contains('board-task--editing')
      );
    if (!clickedInsideEditor) saveEditedTask();
  };

  const tasksFor = (category: PrototypeTask['category']) =>
    activeTasks.filter((task) => task.category === category);
</script>

<svelte:head>
  <title>Daily dashboard prototypes</title>
  <meta
    name="description"
    content="Three throwaway responsive interface directions for the Daily dashboard."
  />
</svelte:head>

<svelte:window onkeydown={handleKeydown} onpointerdown={handleEditorOutsidePointerDown} />

{#snippet DeliveryToggle(className = '', visitor = false)}
  <button
    class={`delivery-toggle ${deliveryEnabled ? 'is-on' : 'is-paused'} ${className}`}
    type="button"
    aria-pressed={deliveryEnabled}
    aria-label={visitor
      ? deliveryEnabled
        ? 'Pause Daily Summary setup'
        : 'Enable Daily Summary after sign-in'
      : deliveryEnabled
        ? 'Pause Daily Summary delivery'
        : 'Enable Daily Summary delivery'}
    onclick={() => (deliveryEnabled = !deliveryEnabled)}
  >
    <span class="delivery-toggle__track" aria-hidden="true">
      <span class="delivery-toggle__thumb"></span>
    </span>
    <span class="delivery-toggle__copy">
      <strong>{deliveryEnabled ? (visitor ? 'Ready after sign-in' : 'Delivery on') : 'Delivery paused'}</strong>
      <small>{deliveryEnabled ? (visitor ? 'Sign in to start delivery' : 'Tomorrow at 07:00') : 'No emails will be sent'}</small>
    </span>
  </button>
{/snippet}

{#snippet TaskCheck(task: PrototypeTask, style = '', disabled = false)}
  <button
    class={`task-check ${style}`}
    type="button"
    aria-label={`Complete ${task.title}`}
    {disabled}
    onclick={() => toggleTask(task.id)}
  >
    <Check size={15} strokeWidth={2.5} />
  </button>
{/snippet}

{#snippet Urgency(urgency: PrototypeTask['urgency'])}
  <span class={`urgency urgency--${urgency}`}>
    <span aria-hidden="true"></span>
    {urgency === 'high' ? 'Urgent' : urgency === 'medium' ? 'Soon' : 'Flexible'}
  </span>
{/snippet}

{#snippet BoardTask(task: PrototypeTask)}
  {#if taskStyle === 'a'}
    <article class="board-task board-task--compact">
      <div class="board-task-top">
        {@render Urgency(task.urgency)}
        <button type="button" aria-label={`More options for ${task.title}`}>
          <Ellipsis size={18} />
        </button>
      </div>
      <h3>{task.title}</h3>
      <button class="board-complete" type="button" onclick={() => toggleTask(task.id)}>
        <Check size={15} /><span>Complete</span>
      </button>
    </article>
  {:else if taskStyle === 'b'}
    <article
      class:board-task--editing={editingTaskId === task.id}
      class="board-task board-task--ledger"
    >
      {@render TaskCheck(task, 'board-ledger-check', editingTaskId === task.id)}
      <span
        class:board-ledger-priority--high={task.urgency === 'high'}
        class:board-ledger-priority--soon={task.urgency === 'medium'}
        class:board-ledger-priority--none={task.urgency === 'low'}
        class="board-ledger-priority"
        aria-label={task.urgency === 'high'
          ? 'Urgent priority'
          : task.urgency === 'medium'
            ? 'Soon priority'
            : 'No priority'}
      ></span>
      {#if editingTaskId === task.id}
        <div class="board-ledger-editor">
          <input
            class="board-ledger-edit"
            data-task-edit={task.id}
            bind:value={editingTaskTitle}
            aria-label={`Edit ${task.title}`}
            onkeydown={(event) => {
              if (event.key === 'Enter') saveEditedTask();
              if (event.key === 'Escape') cancelEditingTask();
            }}
          />
          <div class="board-priority-picker" role="group" aria-label="Priority">
            <button
              class:is-selected={editingTaskUrgency === 'low'}
              type="button"
              aria-pressed={editingTaskUrgency === 'low'}
              onclick={() => (editingTaskUrgency = 'low')}
            >
              <span class="priority-choice priority-choice--none" aria-hidden="true"></span>
              None
            </button>
            <button
              class:is-selected={editingTaskUrgency === 'medium'}
              type="button"
              aria-pressed={editingTaskUrgency === 'medium'}
              onclick={() => (editingTaskUrgency = 'medium')}
            >
              <span class="priority-choice priority-choice--soon" aria-hidden="true"></span>
              Soon
            </button>
            <button
              class:is-selected={editingTaskUrgency === 'high'}
              type="button"
              aria-pressed={editingTaskUrgency === 'high'}
              onclick={() => (editingTaskUrgency = 'high')}
            >
              <span class="priority-choice priority-choice--urgent" aria-hidden="true"></span>
              Urgent
            </button>
          </div>
        </div>
        <div class="board-ledger-edit-actions">
          <button type="button" aria-label={`Save ${task.title}`} onclick={saveEditedTask}>
            <Check size={16} />
          </button>
          <button type="button" aria-label={`Cancel editing ${task.title}`} onclick={cancelEditingTask}>
            <X size={16} />
          </button>
        </div>
      {:else}
        <h3>{task.title}</h3>
        <button
          class="board-ledger-edit-button"
          type="button"
          aria-label={`Edit ${task.title}`}
          title="Edit task"
          onclick={() => void startEditingTask(task)}
        >
          <Pencil size={16} />
        </button>
      {/if}
    </article>
  {:else}
    <article class="board-task board-task--focus">
      <div>
        <h3>{task.title}</h3>
        {@render Urgency(task.urgency)}
      </div>
      <div class="board-focus-actions">
        <button type="button" aria-label={`More options for ${task.title}`}>
          <Ellipsis size={18} />
        </button>
        {@render TaskCheck(task, 'board-focus-check')}
      </div>
    </article>
  {/if}
{/snippet}

{#if variant === 'a'}
  <main class="desk-shell">
    <aside class="desk-rail" aria-label="Primary navigation">
      <a class="desk-brand" href="/prototype/daily?variant=a" aria-label="Daily home">
        <SunMedium size={25} strokeWidth={2.2} />
        <span>daily</span>
      </a>

      <nav class="desk-nav">
        <a class="is-active" href="#tasks"><ListTodo size={18} />Tasks</a>
        <a href="#brief"><Sparkles size={18} />Day brief</a>
      </nav>

      <nav class="desk-nav desk-nav--secondary" aria-label="Secondary navigation">
        <button type="button" onclick={() => (secondaryPanel = 'history')}><History size={18} />Delivery history</button>
        <button type="button" onclick={() => (secondaryPanel = 'settings')}><Settings size={18} />Settings</button>
      </nav>

      <div class="visitor-card">
        <span>Visitor mode</span>
        <p>Your setup stays in this browser.</p>
        <button type="button">Sign in with Google</button>
      </div>
    </aside>

    <section class="desk-workspace" id="tasks">
      <header class="desk-header">
        <button
          class="mobile-nav-button"
          type="button"
          aria-label="Open navigation"
          aria-expanded={mobileMenuOpen}
          onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
        >
          {#if mobileMenuOpen}<X size={20} />{:else}<Menu size={20} />{/if}
        </button>
        <div>
          <p>Tuesday, July 28</p>
          <h1>Good morning.</h1>
        </div>
        {@render DeliveryToggle('desk-delivery')}
      </header>

      {#if mobileMenuOpen}
        <nav class="desk-mobile-menu" aria-label="Mobile navigation">
          <a href="#tasks" onclick={() => (mobileMenuOpen = false)}>Tasks</a>
          <a href="#brief-mobile" onclick={() => (mobileMenuOpen = false)}>Day brief</a>
          <button type="button" onclick={() => { secondaryPanel = 'history'; mobileMenuOpen = false; }}>Delivery history</button>
          <button type="button" onclick={() => { secondaryPanel = 'settings'; mobileMenuOpen = false; }}>Settings</button>
          <span>Visitor mode · saved in this browser</span>
        </nav>
      {/if}

      <div class="desk-capture">
        <Plus size={20} aria-hidden="true" />
        <input
          bind:value={newTask}
          aria-label="New task"
          placeholder="Add a task…"
          onkeydown={(event) => event.key === 'Enter' && addTask()}
        />
        <button type="button" disabled={!newTask.trim()} onclick={() => addTask()}>Add task</button>
      </div>

      <div class="desk-section-heading">
        <div>
          <h2>Tasks</h2>
          <span>{activeTasks.length} open</span>
        </div>
        <button type="button"><SlidersHorizontal size={16} />Organize</button>
      </div>

      <div class="desk-task-groups">
        {#each ['Today', 'Personal', 'Work'] as category}
          <section class="desk-task-group">
            <header>
              <h3>{category}</h3>
              <span>{tasksFor(category as PrototypeTask['category']).length}</span>
            </header>
            <div class="desk-task-list">
              {#each tasksFor(category as PrototypeTask['category']) as task (task.id)}
                <div class="desk-task-row">
                  {@render TaskCheck(task, 'desk-check')}
                  <span class="desk-task-title">{task.title}</span>
                  {@render Urgency(task.urgency)}
                  <button class="icon-button" type="button" aria-label={`More options for ${task.title}`}>
                    <Ellipsis size={18} />
                  </button>
                </div>
              {:else}
                <p class="empty-row">Nothing here. Enjoy the space.</p>
              {/each}
            </div>
          </section>
        {/each}
      </div>

      <details class="desk-mobile-brief" id="brief-mobile">
        <summary>
          <span>
            <small>Daily Summary context</small>
            <strong>Day brief</strong>
          </span>
          <ChevronDown size={20} />
        </summary>
        <div>
          <p><CloudSun size={18} /><span><strong>{weatherCityDetails.name} · {weatherCityDetails.temperature}° / 15°</strong>{weatherCityDetails.condition}, rain after 16:00.</span></p>
          <p><MapPin size={18} /><span><strong>Office · 34 min</strong>8 min slower than usual.</span></p>
          <p><CalendarDays size={18} /><span><strong>Demo Calendar · 3 events</strong>First event at 09:30.</span></p>
          <button type="button" onclick={() => (secondaryPanel = 'settings')}>Configure Daily Summary</button>
        </div>
      </details>

      {#if completedCount > 0}
        <button class="completed-note" type="button">{completedCount} completed in this session</button>
      {/if}
    </section>

    <aside class="desk-brief" id="brief">
      <header>
        <p>Your day at a glance</p>
        <h2>Day brief</h2>
      </header>

      <section class="desk-brief-item">
        <div class="brief-icon brief-icon--weather"><CloudSun size={20} /></div>
        <div>
          <span>Weather · {weatherCityDetails.name}</span>
          <strong>{weatherCityDetails.temperature}° / 15°</strong>
          <p>{weatherCityDetails.condition}, light rain after 16:00.</p>
        </div>
        <button type="button">Edit</button>
      </section>

      <section class="desk-brief-item">
        <div class="brief-icon brief-icon--commute"><MapPin size={20} /></div>
        <div>
          <span>Commute · Office</span>
          <strong>34 min</strong>
          <p>8 min slower than usual.</p>
        </div>
        <button type="button">Edit</button>
      </section>

      <section class="desk-brief-item">
        <div class="brief-icon brief-icon--calendar"><CalendarDays size={20} /></div>
        <div>
          <span>Calendar · Demo</span>
          <strong>3 events</strong>
          <p>First event at 09:30.</p>
        </div>
        <button type="button">Manage</button>
      </section>

      <button class="desk-configure" type="button">
        <Settings size={17} />
        Configure your Daily Summary
      </button>

      <div class="desk-next-summary">
        <Send size={18} />
        <div>
          <span>Next Daily Summary</span>
          <strong>{deliveryEnabled ? 'Tomorrow, 07:00' : 'Paused'}</strong>
        </div>
      </div>
    </aside>
  </main>
{:else if variant === 'b'}
  <main class="sheet-shell">
    <header class="sheet-topbar">
      <a class="sheet-brand" href="/prototype/daily?variant=b">DAILY<span>●</span></a>
      <div class="sheet-actions">
        <span class="sheet-visitor">Visitor mode</span>
        {@render DeliveryToggle('sheet-delivery')}
        <button class="sheet-menu" type="button" aria-label="Open more options" onclick={() => (secondaryPanel = 'menu')}>
          <Menu size={20} />
        </button>
      </div>
    </header>

    <section class="sheet-page">
      <div class="sheet-intro">
        <p>Tuesday · 28 July</p>
        <h1>Your day,<br />in good order.</h1>
        <div class="sheet-intro-meta">
          <span>{activeTasks.length} open tasks</span>
          <span>3 calendar events</span>
          <span>23° in Warsaw</span>
        </div>
      </div>

      <section class="sheet-task-area">
        <form
          class="sheet-capture"
          onsubmit={(event) => {
            event.preventDefault();
            addTask();
          }}
        >
          <label for="sheet-new-task">What needs your attention?</label>
          <div>
            <input id="sheet-new-task" bind:value={newTask} placeholder="Add a task…" />
            <button type="submit" disabled={!newTask.trim()} aria-label="Add task">
              <ArrowRight size={21} />
            </button>
          </div>
        </form>

        <div class="sheet-list">
          <div class="sheet-list-heading">
            <h2>Today’s list</h2>
            <button type="button">Arrange</button>
          </div>

          <div class="sheet-task-list">
            {#each activeTasks as task, index (task.id)}
              <article class="sheet-task">
                <span class="sheet-task-number">{String(index + 1).padStart(2, '0')}</span>
                {@render TaskCheck(task, 'sheet-check')}
                <div>
                  <h3>{task.title}</h3>
                  <p>{task.category} · {task.urgency === 'high' ? 'Do this first' : task.urgency === 'medium' ? 'Coming up' : 'When there’s room'}</p>
                </div>
                <button type="button" aria-label={`More options for ${task.title}`}><Ellipsis size={20} /></button>
              </article>
            {:else}
              <div class="sheet-empty">
                <Check size={28} />
                <h3>The list is clear.</h3>
                <p>Add something only if it deserves your attention.</p>
              </div>
            {/each}
          </div>
        </div>
      </section>

      <aside class="sheet-brief">
        <button
          class="sheet-brief-trigger"
          type="button"
          aria-expanded={briefOpen}
          onclick={() => (briefOpen = !briefOpen)}
        >
          <span>
            <small>Daily Summary context</small>
            <strong>Weather, commute & calendar are ready</strong>
          </span>
          <ChevronDown class={briefOpen ? 'open' : ''} size={22} />
        </button>

        {#if briefOpen}
          <div class="sheet-brief-content">
            <div>
              <CloudSun size={21} />
              <span><strong>23° / 15°</strong> Warsaw</span>
              <button type="button">Change</button>
            </div>
            <div>
              <MapPin size={21} />
              <span><strong>34 min</strong> to Office</span>
              <button type="button">Edit route</button>
            </div>
            <div>
              <CalendarDays size={21} />
              <span><strong>3 events</strong> Demo Calendar</span>
              <button type="button">Manage</button>
            </div>
            <button class="sheet-all-settings" type="button" onclick={() => (secondaryPanel = 'settings')}>All settings</button>
          </div>
        {/if}
      </aside>

      <footer class="sheet-footer">
        <span>Your setup is saved in this browser.</span>
        <nav>
          <button type="button" onclick={() => (secondaryPanel = 'history')}>Delivery history</button>
          <button type="button" onclick={() => (secondaryPanel = 'settings')}>Settings</button>
          <button type="button">Sign in</button>
        </nav>
      </footer>
    </section>
  </main>
{:else}
  <main class="board-shell">
    <aside class="board-rail" aria-label="Primary navigation">
      <a class="board-brand" href="/prototype/daily?variant=c" aria-label="Daily home">
        <span aria-hidden="true">D<span>•</span></span>
      </a>
      <nav>
        <a class="is-active" href="#board" aria-label="Tasks"><ListTodo size={20} /></a>
        <a href="#brief" aria-label="Day brief"><Sparkles size={20} /></a>
      </nav>
      <nav class="board-rail-bottom">
        <button type="button" aria-label="Delivery history" onclick={() => (secondaryPanel = 'history')}><History size={20} /></button>
        <button type="button" aria-label="Settings" onclick={() => (secondaryPanel = 'settings')}><Settings size={20} /></button>
        <button type="button" aria-label="Open Visitor menu" onclick={() => (secondaryPanel = 'menu')}>V</button>
      </nav>
    </aside>

    <section class="board-main" id="board">
      <header class="board-header">
        <div>
          <span>DAILY / TUE 28 JUL</span>
          <h1>Task board</h1>
        </div>
        <div class="board-header-actions">
          <span class="board-visitor">Visitor · local setup</span>
          {@render DeliveryToggle('board-delivery', true)}
        </div>
      </header>

      <section class="board-status-ribbon" id="brief" aria-label="Daily Summary context">
        <button
          class="board-status-item board-status-item--interactive"
          type="button"
          aria-haspopup="dialog"
          aria-label={`Change weather city. Current city: ${weatherCityDetails.name}`}
          onclick={() => void openCityPicker()}
        >
          <CloudSun size={18} />
          <span><small>Weather</small><strong>{weatherCityDetails.name} · {weatherCityDetails.temperature}°</strong></span>
          <ChevronRight size={15} aria-hidden="true" />
        </button>
        <button
          class="board-status-item board-status-item--interactive"
          type="button"
          aria-haspopup="dialog"
          aria-label={`Configure commute routes. ${commuteSummary}`}
          onclick={() => void openCommuteDialog()}
        >
          <MapPin size={18} />
          <span><small>Commute</small><strong>{commuteSummary}</strong></span>
          <ChevronRight size={15} aria-hidden="true" />
        </button>
        <button
          bind:this={calendarTile}
          class="board-status-item board-status-item--interactive board-calendar-status"
          type="button"
          aria-haspopup="dialog"
          aria-label={googleCalendarConnected
            ? `Open calendar. ${visibleCalendarEvents.length} events this week.`
            : 'Connect Google Calendar'}
          onclick={() => void openCalendarAgenda()}
        >
          <CalendarDays size={18} />
          <span>
            <small>
              Calendar{googleCalendarConnected
                ? ' · Google'
                : calendarJustDisconnected
                  ? ' · Disconnected'
                  : ' · Not connected'}
            </small>
            <strong>
              {googleCalendarConnected
                ? `${visibleCalendarEvents.length} events this week`
                : 'Connect Google Calendar'}
            </strong>
          </span>
          <ChevronRight size={15} aria-hidden="true" />
        </button>
        <div class="board-status-item board-summary-status">
          {#if deliveryEnabled}<Send size={18} />{:else}<Pause size={18} />{/if}
          <span><small>Summary delivery</small><strong>{deliveryEnabled ? 'Ready after sign-in' : 'Paused'}</strong></span>
        </div>
      </section>

      <form
        class="board-capture"
        onsubmit={(event) => {
          event.preventDefault();
          void openPlacement();
        }}
      >
        <Plus size={19} />
        <input
          bind:value={newTask}
          aria-label="New task"
          placeholder="Capture a task…"
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void openPlacement();
            }
          }}
        />
        <button type="submit" disabled={!newTask.trim()}>Continue</button>
      </form>

      <div class="board-groups-toolbar">
        <div>
          <h2>Groups</h2>
          <span>{taskGroups.length} active</span>
        </div>
        {#if !addingGroup}
          <button type="button" onclick={() => void startAddingGroup()}>
            <Plus size={15} />
            New group
          </button>
        {/if}
      </div>

      {#if addingGroup}
        <form
          class="board-group-composer"
          onsubmit={(event) => {
            event.preventDefault();
            addGroup();
          }}
        >
          <span class="board-new-group-mark"><Plus size={15} /></span>
          <label>
            <span>Group name</span>
            <input
              data-new-group
              bind:value={newGroupName}
              maxlength="24"
              aria-invalid={groupError ? 'true' : undefined}
              aria-describedby={groupError ? 'new-group-error' : undefined}
              placeholder="e.g. Home"
              oninput={() => (groupError = '')}
              onkeydown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addGroup();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelAddingGroup();
                }
              }}
            />
          </label>
          <div class="board-group-composer-actions">
            <button type="button" onclick={cancelAddingGroup}>Cancel</button>
            <button type="submit">Add group</button>
          </div>
          {#if groupError}<small id="new-group-error">{groupError}</small>{/if}
        </form>
      {/if}

      <div class={`board-columns board-columns--tasks-${taskStyle}`}>
        {#each taskGroups as category, categoryIndex}
          <section class={`board-column board-column--${(categoryIndex % 3) + 1}`}>
            <header>
              <div>
                <span class="board-category-mark">{categoryIndex + 1}</span>
                <h2>{category}</h2>
              </div>
              <div class="board-column-actions">
                <span>{tasksFor(category).length}</span>
                <button
                  type="button"
                  aria-label={`Delete ${category} group`}
                  title="Delete group"
                  aria-expanded={deletingGroup === category}
                  onclick={() => {
                    addingGroup = false;
                    deletingGroup = deletingGroup === category ? null : category;
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </header>

            {#if deletingGroup === category}
              <div class="board-delete-group" role="alert">
                <p>
                  Remove <strong>{category}</strong>?
                  <small>
                    {tasksFor(category).length === 0
                      ? 'This group is empty.'
                      : `${tasksFor(category).length} ${tasksFor(category).length === 1 ? 'task moves' : 'tasks move'} to Ungrouped.`}
                  </small>
                </p>
                <div>
                  <button type="button" onclick={() => (deletingGroup = null)}>Keep</button>
                  <button type="button" onclick={() => confirmDeleteGroup(category)}>Remove</button>
                </div>
              </div>
            {/if}

            <div class="board-task-list">
              {#each tasksFor(category) as task (task.id)}
                {@render BoardTask(task)}
              {:else}
                <div class="board-empty">Clear</div>
              {/each}
            </div>

          </section>
        {/each}
      </div>

      <section class="board-ungrouped" aria-labelledby="ungrouped-heading">
        <header>
          <span class="board-ungrouped-icon"><Inbox size={16} /></span>
          <div>
            <h2 id="ungrouped-heading">Ungrouped</h2>
            <p>Tasks waiting for a home</p>
          </div>
          <span>{tasksFor('Ungrouped').length}</span>
        </header>
        <div class="board-task-list">
          {#each tasksFor('Ungrouped') as task (task.id)}
            {@render BoardTask(task)}
          {:else}
            <div class="board-empty board-empty--ungrouped">No ungrouped tasks</div>
          {/each}
        </div>
      </section>
    </section>
  </main>
{/if}

{#if calendarAuthOpen}
  <dialog
    bind:this={calendarAuthDialog}
    class="placement-dialog calendar-auth-dialog"
    aria-labelledby="calendar-auth-title"
    aria-describedby="calendar-auth-description"
    tabindex="-1"
    oncancel={(event) => {
      event.preventDefault();
      closeCalendarAuth();
    }}
  >
    <span class="google-mark calendar-auth-mark" aria-hidden="true">G</span>
    <span class="placement-kicker">Google Calendar</span>
    <h2 id="calendar-auth-title">Connect your calendar</h2>
    <p id="calendar-auth-description">
      Continue to Google to choose an account and allow read-only access to your calendars.
    </p>
    <div class="calendar-auth-scope">
      <CalendarDays size={18} aria-hidden="true" />
      <span><strong>View calendar events</strong><small>Daily cannot create, edit or delete events.</small></span>
    </div>
    <footer>
      <button type="button" aria-label="Cancel Google Calendar connection" onclick={closeCalendarAuth}>
        <X size={21} />
      </button>
      <button class="calendar-google-button" type="button" onclick={() => void authorizeGoogleCalendar()}>
        Continue with Google
        <ArrowRight size={17} />
      </button>
    </footer>
  </dialog>
{/if}

{#if calendarAgendaOpen}
  <dialog
    bind:this={calendarAgendaDialog}
    class="placement-dialog calendar-dialog"
    aria-labelledby="calendar-agenda-title"
    tabindex="-1"
    oncancel={(event) => {
      event.preventDefault();
      closeCalendarAgenda();
    }}
  >
    <header class="calendar-dialog-heading">
      <span aria-hidden="true"></span>
      <div>
        <span class="placement-kicker">Google Calendar</span>
        <h2 id="calendar-agenda-title">Next 7 days</h2>
      </div>
      <button
        type="button"
        aria-label="Calendar settings"
        title="Calendar settings"
        onclick={() => void openCalendarSettings()}
      >
        <Settings size={18} />
      </button>
    </header>

    <div class="calendar-agenda">
      {#each calendarAgenda as day (day.date)}
        <section>
          <h3>{day.date}</h3>
          <div>
            {#each day.events as event (event.id)}
              {@const source = calendarSources.find((item) => item.id === event.calendarId)}
              <article class="calendar-event">
                <time>{event.time}</time>
                <span
                  class="calendar-event-dot"
                  style={`--calendar-color: ${source?.color ?? '#617d49'}`}
                  aria-hidden="true"
                ></span>
                <div>
                  <strong>{event.title}</strong>
                  <small>
                    {source?.name}{event.detail ? ` · ${event.detail}` : ''}
                  </small>
                </div>
              </article>
            {/each}
          </div>
        </section>
      {:else}
        <div class="calendar-empty">
          <CalendarDays size={20} aria-hidden="true" />
          <strong>No events to show</strong>
          <span>Choose at least one calendar in settings.</span>
        </div>
      {/each}
    </div>

    <footer>
      <button type="button" aria-label="Close calendar" onclick={closeCalendarAgenda}>
        <X size={21} />
      </button>
      <span>{enabledCalendarCount} {enabledCalendarCount === 1 ? 'calendar' : 'calendars'}</span>
    </footer>
  </dialog>
{/if}

{#if calendarSettingsOpen}
  <dialog
    bind:this={calendarSettingsDialog}
    class="placement-dialog calendar-dialog calendar-settings-dialog"
    aria-labelledby="calendar-settings-title"
    tabindex="-1"
    oncancel={(event) => {
      event.preventDefault();
      void returnToCalendarAgenda();
    }}
  >
    <header class="calendar-dialog-heading">
      <button type="button" aria-label="Back to events" onclick={() => void returnToCalendarAgenda()}>
        <ArrowLeft size={18} />
      </button>
      <div>
        <span class="placement-kicker">Google Calendar</span>
        <h2 id="calendar-settings-title">Calendars</h2>
      </div>
      <span aria-hidden="true"></span>
    </header>

    <div class="calendar-source-list" role="group" aria-label="Calendars shown in Daily">
      {#each calendarSources as source (source.id)}
        <button
          type="button"
          aria-pressed={source.enabled}
          onclick={() => toggleCalendarSource(source.id)}
        >
          <span class="calendar-source-color" style={`--calendar-color: ${source.color}`}></span>
          <span>
            <strong>{source.name}</strong>
            <small>{calendarEvents.filter((event) => event.calendarId === source.id).length} upcoming</small>
          </span>
          <span class="calendar-source-switch" aria-hidden="true"><i></i></span>
        </button>
      {/each}
    </div>

    {#if calendarDisconnectConfirm}
      <div class="calendar-disconnect-confirm" role="alert">
        <div>
          <strong>Disconnect Google Calendar?</strong>
          <p>Events from jan.kowalski@gmail.com will no longer appear in Daily.</p>
        </div>
        <div>
          <button type="button" onclick={() => (calendarDisconnectConfirm = false)}>Keep connected</button>
          <button type="button" onclick={disconnectGoogleCalendar}>Disconnect</button>
        </div>
      </div>
    {:else}
      <div class="calendar-account">
        <span class="google-mark" aria-hidden="true">G</span>
        <span>
          <strong>jan.kowalski@gmail.com</strong>
          <small>Google account</small>
        </span>
        <button type="button" onclick={() => (calendarDisconnectConfirm = true)}>
          <LogOut size={16} />
          Disconnect
        </button>
      </div>
    {/if}
  </dialog>
{/if}

{#if commuteDialogOpen}
  <dialog
    bind:this={commuteDialog}
    class="placement-dialog commute-dialog"
    aria-labelledby="commute-dialog-title"
    tabindex="-1"
    oncancel={(event) => {
      event.preventDefault();
      closeCommuteDialog();
    }}
  >
    {#if editingCommuteId === null}
      <span class="placement-kicker">Commute</span>
      <h2 id="commute-dialog-title">Your routes</h2>

      <div class="commute-route-list">
        {#each commuteRoutes as route (route.id)}
          <button type="button" onclick={() => void editCommuteRoute(route)}>
            <span class="commute-route-line" aria-hidden="true">
              <i></i>
              <i></i>
            </span>
            <span class="commute-route-copy">
              <strong>{route.to}</strong>
              <small>{route.from}</small>
              <span class="commute-route-days">
                {#each weekdays as day}
                  <i class:is-active={route.days.includes(day)}>{day.slice(0, 1)}</i>
                {/each}
              </span>
            </span>
            <Pencil size={15} aria-hidden="true" />
          </button>
        {:else}
          <div class="commute-empty">
            <MapPin size={19} aria-hidden="true" />
            <strong>No routes yet</strong>
            <span>Add a route to include commute updates.</span>
          </div>
        {/each}
      </div>

      <button class="commute-add" type="button" onclick={() => void editCommuteRoute()}>
        <Plus size={17} />
        Add route
      </button>

      <footer class="commute-list-footer">
        <button type="button" aria-label="Close commute routes" onclick={closeCommuteDialog}>
          <X size={21} />
        </button>
      </footer>
    {:else}
      <div class="commute-editor-heading">
        <button type="button" aria-label="Back to routes" onclick={() => (editingCommuteId = null)}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <span class="placement-kicker">Commute</span>
          <h2 id="commute-dialog-title">
            {editingCommuteId === 0 ? 'Add route' : 'Edit route'}
          </h2>
        </div>
        <span aria-hidden="true"></span>
      </div>

      <form
        class="commute-editor"
        onsubmit={(event) => {
          event.preventDefault();
          saveCommuteRoute();
        }}
      >
        <div class="commute-points">
          <span class="commute-route-line" aria-hidden="true">
            <i></i>
            <i></i>
          </span>
          <label>
            <span>Start</span>
            <input
              data-commute-from
              bind:value={commuteFrom}
              placeholder="Enter starting point"
              autocomplete="street-address"
            />
          </label>
          <label>
            <span>Destination</span>
            <input
              bind:value={commuteTo}
              placeholder="Enter destination"
              autocomplete="street-address"
            />
          </label>
        </div>

        <fieldset class="commute-days">
          <legend>Check on</legend>
          <div>
            {#each weekdays as day}
              <button
                type="button"
                class:is-selected={commuteDays.includes(day)}
                aria-pressed={commuteDays.includes(day)}
                aria-label={day}
                onclick={() => toggleCommuteDay(day)}
              >
                {day.slice(0, 1)}
              </button>
            {/each}
          </div>
        </fieldset>

        <footer>
          {#if editingCommuteId !== 0}
            <button
              class="commute-delete"
              type="button"
              aria-label="Delete route"
              onclick={deleteCommuteRoute}
            >
              <Trash2 size={18} />
            </button>
          {:else}
            <span></span>
          {/if}
          <button
            class="commute-save"
            type="submit"
            disabled={!commuteFrom.trim() || !commuteTo.trim() || !commuteDays.length}
          >
            <Check size={18} />
            Save route
          </button>
        </footer>
      </form>
    {/if}
  </dialog>
{/if}

{#if cityPickerOpen}
  <dialog
    bind:this={cityDialog}
    class="placement-dialog city-dialog"
    aria-labelledby="city-picker-title"
    tabindex="-1"
    oncancel={(event) => {
      event.preventDefault();
      closeCityPicker();
    }}
    onkeydown={handleCityPickerKeydown}
  >
    <span class="placement-kicker">Weather location</span>
    <h2 id="city-picker-title">Choose a city</h2>

    <label class="city-search">
      <Search size={17} aria-hidden="true" />
      <span class="sr-only">Search cities</span>
      <input
        data-city-search
        bind:value={cityQuery}
        placeholder="Search city or country"
        autocomplete="off"
        aria-controls="weather-city-list"
        aria-activedescendant={filteredWeatherCities[cityHighlight]
          ? `weather-city-${cityHighlight}`
          : undefined}
        oninput={() => (cityHighlight = 0)}
      />
    </label>

    <div
      id="weather-city-list"
      class="city-results"
      role="listbox"
      aria-label="Available cities"
    >
      {#each filteredWeatherCities as city, index (city.name)}
        <button
          id={`weather-city-${index}`}
          class:is-highlighted={index === cityHighlight}
          type="button"
          role="option"
          aria-selected={city.name === weatherCity}
          onmouseenter={() => (cityHighlight = index)}
          onclick={() => confirmCity(city)}
        >
          <MapPin size={17} aria-hidden="true" />
          <span>
            <strong>{city.name}</strong>
            <small>{city.country} · {city.condition}</small>
          </span>
          <span class="city-temperature">{city.temperature}°</span>
          {#if city.name === weatherCity}
            <Check class="city-current" size={16} aria-label="Current city" />
          {/if}
        </button>
      {:else}
        <div class="city-empty">
          <Search size={18} aria-hidden="true" />
          <strong>No matching city</strong>
          <span>Try a different spelling.</span>
        </div>
      {/each}
    </div>

    <footer>
      <button type="button" aria-label="Cancel city selection" onclick={closeCityPicker}>
        <X size={21} />
      </button>
      <button
        type="button"
        aria-label="Use selected city"
        disabled={!filteredWeatherCities.length}
        onclick={() => confirmCity()}
      >
        <Check size={21} />
      </button>
    </footer>
  </dialog>
{/if}

{#if placementOpen}
  <dialog
    bind:this={placementDialog}
    class="placement-dialog"
    aria-labelledby="placement-title"
    aria-describedby="placement-description"
    tabindex="-1"
    oncancel={(event) => {
      event.preventDefault();
      closePlacement();
    }}
    onkeydown={handlePlacementKeydown}
  >
      <h2 id="placement-title">Add task</h2>
      <span class="placement-kicker">New task</span>
      <p id="placement-description" class="placement-task-title">{newTask.trim()}</p>

      <fieldset class="placement-step placement-step--group">
        <legend>Group</legend>
        <button type="button" aria-label="Previous group" onclick={() => cyclePlacementCategory(-1)}>
          <ChevronUp size={18} />
        </button>
        <output aria-live="polite">{placementCategory}</output>
        <button type="button" aria-label="Next group" onclick={() => cyclePlacementCategory(1)}>
          <ChevronDown size={18} />
        </button>
      </fieldset>

      <fieldset class="placement-step placement-step--priority">
        <legend>Priority</legend>
        <button type="button" aria-label="Previous priority" onclick={() => cyclePlacementUrgency(-1)}>
          <ChevronLeft size={18} />
        </button>
        <output
          class:priority-choice--none={placementUrgency === 'low'}
          class:priority-choice--soon={placementUrgency === 'medium'}
          class:priority-choice--urgent={placementUrgency === 'high'}
          class="placement-priority-dot"
          aria-live="polite"
        >
          <span class="sr-only">
            {placementUrgency === 'low' ? 'No priority' : placementUrgency === 'medium' ? 'Soon' : 'Urgent'}
          </span>
        </output>
        <button type="button" aria-label="Next priority" onclick={() => cyclePlacementUrgency(1)}>
          <ChevronRight size={18} />
        </button>
      </fieldset>

      <footer>
        <button type="button" aria-label="Cancel adding task" onclick={closePlacement}>
          <X size={21} />
        </button>
        <button type="button" aria-label="Add task" onclick={confirmPlacement}>
          <Check size={21} />
        </button>
      </footer>
  </dialog>
{/if}

{#if secondaryPanel}
  <div class="secondary-backdrop">
    <button class="secondary-scrim" type="button" aria-label="Close panel" onclick={() => (secondaryPanel = null)}></button>
    <dialog
      open
      class="secondary-panel"
      aria-label={secondaryPanel === 'history' ? 'Delivery history' : secondaryPanel === 'settings' ? 'Settings' : 'More'}
    >
      <header>
        <div>
          <small>{secondaryPanel === 'menu' ? 'Visitor mode' : 'Daily'}</small>
          <h2>{secondaryPanel === 'history' ? 'Delivery history' : secondaryPanel === 'settings' ? 'Settings' : 'More'}</h2>
        </div>
        <button type="button" aria-label="Close panel" onclick={() => (secondaryPanel = null)}><X size={20} /></button>
      </header>

      {#if secondaryPanel === 'menu'}
        <p class="secondary-intro">Your setup is saved in this browser. Sign in when you want Daily Summaries delivered by email.</p>
        <nav class="secondary-menu">
          <button type="button" onclick={() => (secondaryPanel = 'history')}><History size={18} />Delivery history<ArrowRight size={17} /></button>
          <button type="button" onclick={() => (secondaryPanel = 'settings')}><Settings size={18} />Settings<ArrowRight size={17} /></button>
        </nav>
        <button class="secondary-primary" type="button">Sign in with Google</button>
      {:else if secondaryPanel === 'history'}
        <p class="secondary-intro">Delivery history will appear here after you sign in and send your first Daily Summary.</p>
        <div class="history-list">
          <article><span>Visitor mode</span><strong>No deliveries yet</strong><small>Sign in to start delivery</small></article>
        </div>
      {:else}
        <p class="secondary-intro">The settings you rarely need, kept away from your daily task flow.</p>
        <div class="settings-list">
          <button type="button"><span><small>Schedule</small><strong>Daily at 07:00</strong></span><ArrowRight size={17} /></button>
          <button type="button"><span><small>Summary sections</small><strong>Weather, Commute, Calendar, Todo</strong></span><ArrowRight size={17} /></button>
          <button type="button"><span><small>Appearance</small><strong>Light email theme</strong></span><ArrowRight size={17} /></button>
          <button type="button"><span><small>Account</small><strong>Visitor · local setup</strong></span><ArrowRight size={17} /></button>
        </div>
      {/if}
    </dialog>
  </div>
{/if}

{#if dev}
  <div class="prototype-switcher" aria-label="Prototype variants">
    <button
      type="button"
      aria-label={variant === 'c' ? 'Previous task layout' : 'Previous variant'}
      onclick={() => variant === 'c' ? cycleTaskStyle(-1) : cycleVariant(-1)}
    >
      <ArrowLeft size={18} />
    </button>
    <div>
      {#if variant === 'c'}
        <small>Task layout {taskStyle.toUpperCase()} of {taskStyles.length}</small>
        <strong>{taskStyles[taskStyleIndex].name}</strong>
      {:else}
        <small>Prototype {variant.toUpperCase()} of {variants.length}</small>
        <strong>{variants[variantIndex].name}</strong>
      {/if}
    </div>
    <button
      type="button"
      aria-label={variant === 'c' ? 'Next task layout' : 'Next variant'}
      onclick={() => variant === 'c' ? cycleTaskStyle(1) : cycleVariant(1)}
    >
      <ArrowRight size={18} />
    </button>
  </div>
{/if}

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    overflow-x: hidden;
  }

  :global(button),
  :global(a),
  :global(input) {
    -webkit-tap-highlight-color: transparent;
  }

  :global(button:focus-visible),
  :global(a:focus-visible),
  :global(input:focus-visible) {
    outline: 3px solid #4078ff;
    outline-offset: 3px;
  }

  button,
  a {
    color: inherit;
  }

  button {
    cursor: pointer;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.42;
  }

  .delivery-toggle {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    border: 0;
    background: transparent;
    padding: 0;
    text-align: left;
  }

  .delivery-toggle__track {
    position: relative;
    width: 42px;
    height: 24px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: #b6bcc8;
    transition: background 180ms ease-out;
  }

  .delivery-toggle__thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: white;
    box-shadow: 0 2px 6px rgb(15 23 42 / 0.25);
    transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .delivery-toggle.is-on .delivery-toggle__track {
    background: #196b45;
  }

  .delivery-toggle.is-on .delivery-toggle__thumb {
    transform: translateX(18px);
  }

  .delivery-toggle__copy {
    display: grid;
    gap: 1px;
  }

  .delivery-toggle__copy strong {
    font-size: 13px;
    line-height: 1.2;
  }

  .delivery-toggle__copy small {
    font-size: 11px;
    line-height: 1.2;
    opacity: 0.64;
  }

  .task-check {
    display: grid;
    width: 23px;
    height: 23px;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid currentColor;
    border-radius: 50%;
    background: transparent;
  }

  .task-check :global(svg) {
    opacity: 0;
    transition: opacity 120ms ease-out;
  }

  .task-check:hover :global(svg),
  .task-check:focus-visible :global(svg) {
    opacity: 1;
  }

  .urgency {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #596274;
    font-size: 11px;
    white-space: nowrap;
  }

  .urgency > span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #8a94a6;
  }

  .urgency--medium > span {
    background: #c77920;
  }

  .urgency--high > span {
    background: #cb3c45;
  }

  .icon-button {
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    border: 0;
    background: transparent;
  }

  /* Variant A — Daily Desk */
  .desk-shell {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 232px minmax(520px, 1fr) 320px;
    background: #f4f6f8;
    color: #172033;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }

  .desk-rail {
    position: sticky;
    top: 0;
    height: 100vh;
    display: flex;
    flex-direction: column;
    padding: 26px 18px 18px;
    border-right: 1px solid #d9dee7;
    background: #e9edf3;
  }

  .desk-brand {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 2px 9px 30px;
    color: #10204b;
    font-size: 19px;
    font-weight: 800;
    letter-spacing: -0.03em;
    text-decoration: none;
  }

  .desk-brand :global(svg) {
    color: #3166d5;
  }

  .desk-nav {
    display: grid;
    gap: 5px;
  }

  .desk-nav a,
  .desk-nav button {
    display: flex;
    align-items: center;
    gap: 11px;
    border: 0;
    padding: 10px 11px;
    border-radius: 8px;
    background: transparent;
    color: #586477;
    font-size: 13px;
    font-weight: 650;
    text-align: left;
    text-decoration: none;
  }

  .desk-nav a:hover,
  .desk-nav a.is-active,
  .desk-nav button:hover {
    background: #d9e2f4;
    color: #173e8f;
  }

  .desk-nav--secondary {
    margin-top: auto;
    margin-bottom: 18px;
  }

  .visitor-card {
    padding: 13px;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 10px 28px rgb(28 45 76 / 0.09);
  }

  .visitor-card span {
    font-size: 12px;
    font-weight: 750;
  }

  .visitor-card p {
    margin: 4px 0 12px;
    color: #657085;
    font-size: 11px;
    line-height: 1.45;
  }

  .visitor-card button {
    width: 100%;
    border: 0;
    border-radius: 7px;
    background: #173e8f;
    color: white;
    padding: 8px;
    font-size: 11px;
    font-weight: 700;
  }

  .desk-workspace {
    min-width: 0;
    padding: 28px clamp(24px, 4vw, 68px) 130px;
    background: #fff;
  }

  .desk-header {
    min-height: 77px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    padding-bottom: 24px;
    border-bottom: 1px solid #e2e6ec;
  }

  .desk-header p {
    margin: 0 0 5px;
    color: #727d8f;
    font-size: 12px;
  }

  .desk-header h1 {
    margin: 0;
    font-size: clamp(27px, 3vw, 40px);
    font-weight: 680;
    letter-spacing: -0.035em;
  }

  .desk-delivery {
    margin-top: 6px;
    padding: 9px 11px;
    border-radius: 9px;
    background: #f3f6fa;
  }

  .mobile-nav-button,
  .desk-mobile-menu {
    display: none;
  }

  .desk-capture {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 11px;
    margin: 28px 0 32px;
    padding: 9px 10px 9px 14px;
    border: 1px solid #ccd3df;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 8px 24px rgb(35 52 85 / 0.08);
  }

  .desk-capture > :global(svg) {
    color: #6b778b;
  }

  .desk-capture input {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    padding: 7px 0;
    color: #172033;
    font-size: 15px;
  }

  .desk-capture button {
    border: 0;
    border-radius: 8px;
    background: #2557bb;
    color: white;
    padding: 9px 14px;
    font-size: 12px;
    font-weight: 750;
  }

  .desk-section-heading,
  .desk-section-heading > div {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .desk-section-heading {
    justify-content: space-between;
    margin-bottom: 14px;
  }

  .desk-section-heading h2 {
    margin: 0;
    font-size: 17px;
  }

  .desk-section-heading span {
    color: #788395;
    font-size: 11px;
  }

  .desk-section-heading button {
    display: flex;
    align-items: center;
    gap: 7px;
    border: 0;
    background: transparent;
    color: #566175;
    font-size: 12px;
  }

  .desk-task-groups {
    display: grid;
    gap: 26px;
  }

  .desk-task-group > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 2px 9px;
    border-bottom: 1px solid #dfe4eb;
  }

  .desk-task-group h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 760;
    letter-spacing: 0.01em;
  }

  .desk-task-group header span {
    color: #8490a2;
    font-size: 11px;
  }

  .desk-task-list {
    display: grid;
  }

  .desk-task-row {
    min-height: 54px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid #edf0f4;
  }

  .desk-task-title {
    overflow: hidden;
    font-size: 14px;
    font-weight: 560;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .desk-check {
    color: #617088;
  }

  .empty-row {
    margin: 0;
    padding: 16px 0;
    color: #8791a0;
    font-size: 12px;
  }

  .completed-note {
    margin-top: 24px;
    border: 0;
    background: transparent;
    color: #657085;
    font-size: 12px;
  }

  .desk-mobile-brief {
    display: none;
  }

  .desk-brief {
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
    padding: 32px 25px 110px;
    border-left: 1px solid #dfe4eb;
    background: #f7f9fb;
  }

  .desk-brief > header {
    margin-bottom: 26px;
  }

  .desk-brief > header p {
    margin: 0 0 5px;
    color: #7d8797;
    font-size: 11px;
  }

  .desk-brief > header h2 {
    margin: 0;
    font-size: 20px;
    letter-spacing: -0.02em;
  }

  .desk-brief-item {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: start;
    gap: 11px;
    padding: 19px 0;
    border-bottom: 1px solid #dde3ea;
  }

  .brief-icon {
    display: grid;
    width: 36px;
    height: 36px;
    place-items: center;
    border-radius: 10px;
    background: #e4ebf7;
    color: #2857a9;
  }

  .brief-icon--commute {
    background: #f3e8d8;
    color: #8b5613;
  }

  .brief-icon--calendar {
    background: #e0eee7;
    color: #286644;
  }

  .desk-brief-item span {
    display: block;
    margin: 1px 0 4px;
    color: #657085;
    font-size: 10px;
  }

  .desk-brief-item strong {
    font-size: 14px;
  }

  .desk-brief-item p {
    margin: 4px 0 0;
    color: #6d7889;
    font-size: 11px;
    line-height: 1.45;
  }

  .desk-brief-item > button {
    border: 0;
    background: transparent;
    color: #2857a9;
    padding: 2px;
    font-size: 10px;
    font-weight: 700;
  }

  .desk-configure {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 24px 0;
    border: 1px solid #cbd3df;
    border-radius: 9px;
    background: #fff;
    padding: 10px;
    color: #344157;
    font-size: 11px;
    font-weight: 700;
  }

  .desk-next-summary {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 13px;
    border-radius: 12px;
    background: #173e8f;
    color: white;
  }

  .desk-next-summary span {
    display: block;
    color: #cbd9f5;
    font-size: 10px;
  }

  .desk-next-summary strong {
    font-size: 12px;
  }

  /* Variant B — Morning Sheet */
  .sheet-shell {
    min-height: 100vh;
    background: #f2e8b9;
    color: #1d2a46;
    font-family: Arial, "Helvetica Neue", sans-serif;
  }

  .sheet-topbar {
    position: sticky;
    top: 0;
    z-index: 5;
    height: 74px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 0 clamp(20px, 5vw, 72px);
    border-bottom: 2px solid #1d2a46;
    background: #f2e8b9;
  }

  .sheet-brand {
    color: #173a8d;
    font-size: 18px;
    font-weight: 900;
    letter-spacing: -0.02em;
    text-decoration: none;
  }

  .sheet-brand span {
    color: #d8533f;
  }

  .sheet-actions {
    display: flex;
    align-items: center;
    gap: 22px;
  }

  .sheet-visitor {
    color: #4b5570;
    font-size: 11px;
    font-weight: 700;
  }

  .sheet-delivery .delivery-toggle__track {
    background: #a29b78;
  }

  .sheet-delivery.is-on .delivery-toggle__track {
    background: #173a8d;
  }

  .sheet-menu {
    display: grid;
    width: 36px;
    height: 36px;
    place-items: center;
    border: 1px solid #1d2a46;
    border-radius: 50%;
    background: transparent;
  }

  .sheet-page {
    width: min(1180px, calc(100% - 40px));
    margin: 0 auto;
    padding: clamp(52px, 8vw, 110px) 0 130px;
  }

  .sheet-intro {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(220px, 360px);
    align-items: end;
    gap: 40px;
    padding-bottom: 44px;
    border-bottom: 2px solid #1d2a46;
  }

  .sheet-intro > p {
    grid-column: 1 / -1;
    margin: 0 0 -20px;
    color: #4c5670;
    font-size: 12px;
    font-weight: 700;
  }

  .sheet-intro h1 {
    margin: 0;
    max-width: 700px;
    color: #173a8d;
    font-size: clamp(52px, 8vw, 100px);
    font-weight: 850;
    letter-spacing: -0.04em;
    line-height: 0.88;
  }

  .sheet-intro-meta {
    display: grid;
    gap: 0;
    border-top: 1px solid #7c765a;
  }

  .sheet-intro-meta span {
    padding: 11px 0;
    border-bottom: 1px solid #7c765a;
    font-size: 12px;
    font-weight: 650;
  }

  .sheet-task-area {
    display: grid;
    grid-template-columns: minmax(220px, 0.38fr) minmax(0, 1fr);
    gap: clamp(40px, 7vw, 100px);
    padding: 55px 0 42px;
  }

  .sheet-capture {
    align-self: start;
  }

  .sheet-capture label {
    display: block;
    max-width: 210px;
    margin-bottom: 20px;
    font-size: 24px;
    font-weight: 800;
    letter-spacing: -0.025em;
    line-height: 1.1;
  }

  .sheet-capture > div {
    display: flex;
    border-bottom: 2px solid #173a8d;
  }

  .sheet-capture input {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    padding: 12px 0;
    color: #1d2a46;
    font-size: 14px;
  }

  .sheet-capture input::placeholder {
    color: #69718a;
  }

  .sheet-capture button {
    display: grid;
    width: 42px;
    flex: 0 0 auto;
    place-items: center;
    border: 0;
    background: #173a8d;
    color: #fff;
  }

  .sheet-list-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding-bottom: 13px;
    border-bottom: 2px solid #1d2a46;
  }

  .sheet-list-heading h2 {
    margin: 0;
    font-size: 17px;
  }

  .sheet-list-heading button {
    border: 0;
    background: transparent;
    color: #173a8d;
    font-size: 11px;
    font-weight: 750;
  }

  .sheet-task-list {
    display: grid;
  }

  .sheet-task {
    min-height: 82px;
    display: grid;
    grid-template-columns: 32px auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 15px;
    border-bottom: 1px solid #7f795c;
  }

  .sheet-task-number {
    color: #786f51;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }

  .sheet-check {
    color: #173a8d;
  }

  .sheet-task h3 {
    margin: 0 0 4px;
    font-size: 15px;
    font-weight: 760;
  }

  .sheet-task p {
    margin: 0;
    color: #59627c;
    font-size: 11px;
  }

  .sheet-task > button:last-child {
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border: 0;
    background: transparent;
  }

  .sheet-empty {
    padding: 54px 0;
    text-align: center;
  }

  .sheet-empty h3 {
    margin: 12px 0 4px;
  }

  .sheet-empty p {
    margin: 0;
    color: #59627c;
    font-size: 12px;
  }

  .sheet-brief {
    border-top: 2px solid #1d2a46;
    border-bottom: 2px solid #1d2a46;
  }

  .sheet-brief-trigger {
    width: 100%;
    min-height: 82px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    border: 0;
    background: transparent;
    padding: 0;
    text-align: left;
  }

  .sheet-brief-trigger small {
    display: block;
    margin-bottom: 5px;
    color: #59627c;
    font-size: 10px;
  }

  .sheet-brief-trigger strong {
    font-size: 14px;
  }

  .sheet-brief-trigger :global(svg) {
    transition: transform 180ms ease-out;
  }

  .sheet-brief-trigger :global(svg.open) {
    transform: rotate(180deg);
  }

  .sheet-brief-content {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    padding-bottom: 20px;
    background: #7f795c;
  }

  .sheet-brief-content > div {
    min-height: 126px;
    display: grid;
    grid-template-columns: auto 1fr;
    align-content: space-between;
    gap: 14px;
    background: #f2e8b9;
    padding: 18px;
  }

  .sheet-brief-content span {
    font-size: 11px;
    line-height: 1.5;
  }

  .sheet-brief-content span strong {
    display: block;
    font-size: 14px;
  }

  .sheet-brief-content button {
    grid-column: 1 / -1;
    justify-self: start;
    border: 0;
    background: transparent;
    color: #173a8d;
    padding: 0;
    font-size: 10px;
    font-weight: 750;
  }

  .sheet-all-settings {
    grid-column: 1 / -1;
    justify-self: end;
    border: 0;
    background: transparent;
    color: #173a8d;
    padding: 0;
    font-size: 11px;
    font-weight: 750;
  }

  .sheet-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding-top: 28px;
    color: #59627c;
    font-size: 11px;
  }

  .sheet-footer nav {
    display: flex;
    align-items: center;
    gap: 22px;
  }

  .sheet-footer button {
    border: 0;
    background: transparent;
    color: #59627c;
    padding: 8px 0;
    font-size: 11px;
    font-weight: 750;
  }

  .sheet-footer button:last-child {
    border: 1px solid #173a8d;
    color: #173a8d;
    padding: 8px 14px;
  }

  /* Variant C — Task Board */
  .board-shell {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    background: #f7f8f5;
    color: #181a17;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }

  .board-shell :is(button, a, input):focus-visible {
    outline-color: #617d49;
  }

  .board-rail {
    position: sticky;
    top: 0;
    z-index: 4;
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 18px 0;
    border-right: 1px solid #dfe3dc;
    background: #ffffff;
  }

  .board-brand {
    display: grid;
    width: 42px;
    height: 42px;
    place-items: center;
    border: 1px solid #d9ded5;
    border-radius: 10px;
    color: #181a17;
    text-decoration: none;
  }

  .board-brand > span {
    position: relative;
    font-size: 20px;
    font-weight: 760;
    letter-spacing: -0.04em;
  }

  .board-brand > span > span {
    position: absolute;
    top: -5px;
    right: -7px;
    color: #617d49;
    font-size: 13px;
  }

  .board-rail nav {
    display: grid;
    gap: 9px;
    margin-top: 52px;
  }

  .board-rail nav a,
  .board-rail nav button {
    display: grid;
    width: 38px;
    height: 38px;
    place-items: center;
    border: 1px solid transparent;
    border-radius: 9px;
    background: transparent;
    color: #70766d;
    text-decoration: none;
  }

  .board-rail nav a:hover,
  .board-rail nav a.is-active {
    border-color: #dfe4da;
    background: #f2f4ec;
    color: #4e6b38;
  }

  .board-rail .board-rail-bottom {
    margin-top: auto;
  }

  .board-rail-bottom button {
    border: 1px solid #d8ddd4 !important;
    border-radius: 9px !important;
    background: #ffffff !important;
    color: #4b5048 !important;
    font-size: 12px;
    font-weight: 800;
  }

  .board-rail-bottom button:hover {
    background: #f2f4ec !important;
    color: #4e6b38 !important;
  }

  .board-main {
    min-width: 0;
    padding: 28px clamp(22px, 3.5vw, 58px) 130px;
  }

  .board-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 30px;
    margin-bottom: 22px;
  }

  .board-header > div:first-child > span {
    color: #71776e;
    font-size: 10px;
    font-weight: 650;
    letter-spacing: 0.06em;
  }

  .board-header h1 {
    margin: 4px 0 0;
    font-size: clamp(30px, 3.5vw, 42px);
    font-weight: 730;
    letter-spacing: -0.038em;
  }

  .board-header-actions {
    display: flex;
    align-items: center;
    gap: 22px;
  }

  .board-visitor {
    color: #686e65;
    font-size: 11px;
  }

  .board-delivery {
    padding: 9px 12px;
    border: 1px solid #d9ded5;
    border-radius: 9px;
    background: #ffffff;
    color: #20231e;
  }

  .board-delivery .delivery-toggle__track {
    background: #aeb5a9;
  }

  .board-delivery.is-on .delivery-toggle__track {
    background: #617d49;
  }

  .board-status-ribbon {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(180px, 0.9fr);
    gap: 10px;
  }

  .board-status-ribbon > .board-status-item {
    min-width: 0;
    min-height: 66px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 11px;
    border: 1px solid #dfe3dc;
    border-radius: 9px;
    background: #ffffff;
    color: #30342e;
    padding: 11px 14px;
    text-align: left;
  }

  .board-status-item--interactive {
    cursor: pointer;
    font: inherit;
    transition:
      border-color 140ms ease,
      background 140ms ease,
      color 140ms ease;
  }

  .board-status-item--interactive > :global(svg:last-child) {
    color: #9aa095;
    transition: transform 140ms ease;
  }

  .board-status-item--interactive:hover {
    border-color: #bfcab7;
    background: #f8faf5;
    color: #496137;
  }

  .board-status-item--interactive:hover > :global(svg:last-child) {
    transform: translateX(2px);
  }

  .board-status-item--interactive:focus-visible {
    outline: 2px solid #5c7845;
    outline-offset: 2px;
  }

  .board-calendar-status > :global(svg:first-child) {
    color: #4c6f35;
  }

  .board-status-ribbon small,
  .board-status-ribbon strong {
    display: block;
  }

  .board-status-ribbon small {
    margin-bottom: 3px;
    color: #777d74;
    font-size: 9px;
  }

  .board-status-ribbon strong {
    overflow: hidden;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .board-summary-status {
    border-color: #ccd7c4 !important;
    background: #f2f5ec !important;
    color: #4f6d39 !important;
  }

  .board-capture {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 11px;
    margin: 20px 0 22px;
    border: 1px solid #d9ded5;
    border-radius: 10px;
    background: #ffffff;
    padding: 7px 8px 7px 15px;
    box-shadow: 0 8px 22px rgb(44 52 38 / 0.05);
  }

  .board-capture > :global(svg) {
    color: #5e7b47;
  }

  .board-capture input {
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: #1d201b;
    padding: 9px 0;
    font-size: 14px;
  }

  .board-capture input::placeholder {
    color: #848a81;
  }

  .board-capture button {
    border: 0;
    border-radius: 7px;
    background: #5c7845;
    color: #ffffff;
    padding: 9px 16px;
    font-size: 11px;
    font-weight: 800;
  }

  .board-groups-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 10px;
  }

  .board-groups-toolbar > div {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .board-groups-toolbar h2 {
    margin: 0;
    color: #2b3029;
    font-size: 13px;
    font-weight: 760;
  }

  .board-groups-toolbar span {
    color: #7b8178;
    font-size: 9px;
  }

  .board-groups-toolbar button {
    min-height: 34px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    border: 1px solid #d4dad0;
    border-radius: 8px;
    background: #ffffff;
    color: #4d5f40;
    padding: 7px 10px;
    font-size: 10px;
    font-weight: 760;
  }

  .board-groups-toolbar button:hover {
    border-color: #bfcab7;
    background: #f3f6ef;
  }

  .board-group-composer {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(180px, 1fr) auto;
    align-items: end;
    gap: 10px;
    margin-bottom: 12px;
    border: 1px solid #cbd5c4;
    border-radius: 10px;
    background: #f4f7f1;
    padding: 10px;
    box-shadow: 0 8px 22px rgb(44 52 38 / 0.05);
  }

  .board-new-group-mark {
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border: 1px solid #cbd4c5;
    border-radius: 50%;
    background: #ffffff;
    color: #5c7845;
  }

  .board-group-composer label,
  .board-group-composer label > span {
    display: block;
  }

  .board-group-composer label > span {
    margin-bottom: 4px;
    color: #65705f;
    font-size: 9px;
    font-weight: 720;
  }

  .board-group-composer input {
    width: 100%;
    height: 34px;
    border: 1px solid #bdc8b6;
    border-radius: 7px;
    outline: 0;
    background: #ffffff;
    color: #242922;
    padding: 0 10px;
    font: inherit;
    font-size: 12px;
    font-weight: 650;
  }

  .board-group-composer input:focus {
    border-color: #708b5c;
    box-shadow: 0 0 0 2px rgb(92 120 69 / 0.13);
  }

  .board-group-composer input[aria-invalid='true'] {
    border-color: #c65a55;
  }

  .board-group-composer-actions {
    display: flex;
    gap: 6px;
  }

  .board-group-composer-actions button {
    min-height: 34px;
    border: 1px solid #d1d7cd;
    border-radius: 7px;
    background: #ffffff;
    color: #5f665b;
    padding: 7px 10px;
    font-size: 10px;
    font-weight: 720;
  }

  .board-group-composer-actions button:last-child {
    border-color: #5c7845;
    background: #5c7845;
    color: #ffffff;
  }

  .board-group-composer > small {
    position: absolute;
    bottom: -16px;
    left: 54px;
    color: #a13f3b;
    font-size: 9px;
  }

  .board-columns {
    display: grid;
    grid-template-columns: repeat(3, minmax(230px, 1fr));
    gap: 12px;
  }

  .board-column {
    min-width: 0;
    border: 1px solid #dfe3dc;
    border-radius: 10px;
    background: #f1f3ef;
    padding: 14px;
  }

  .board-column--2 {
    background: #f5f3ec;
  }

  .board-column--3 {
    background: #f0f3f4;
  }

  .board-column > header,
  .board-column > header > div {
    display: flex;
    align-items: center;
  }

  .board-column > header {
    justify-content: space-between;
    padding-bottom: 15px;
  }

  .board-column > header > div {
    gap: 9px;
  }

  .board-column-actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .board-column-actions > span {
    color: #70766d;
    font-size: 10px;
  }

  .board-column-actions button {
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: #8a9087;
    opacity: 0;
    transition:
      opacity 140ms ease,
      color 140ms ease,
      background 140ms ease;
  }

  .board-column:hover .board-column-actions button,
  .board-column:focus-within .board-column-actions button,
  .board-column-actions button[aria-expanded='true'] {
    opacity: 1;
  }

  .board-column-actions button:hover {
    background: #ffffff;
    color: #a63f3d;
  }

  .board-category-mark {
    display: grid;
    width: 22px;
    height: 22px;
    place-items: center;
    border: 1px solid #cdd4c8;
    border-radius: 50%;
    background: #ffffff;
    color: #5c7845;
    font-size: 9px;
    font-weight: 750;
  }

  .board-column h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
  }

  .board-delete-group {
    margin: -3px 0 10px;
    border: 1px solid #e1c8c3;
    border-radius: 8px;
    background: #fffafa;
    padding: 9px;
  }

  .board-delete-group p {
    margin: 0;
    color: #3f3431;
    font-size: 10px;
    line-height: 1.35;
  }

  .board-delete-group p small {
    display: block;
    margin-top: 2px;
    color: #7b6c68;
    font-size: 9px;
  }

  .board-delete-group > div {
    display: flex;
    justify-content: flex-end;
    gap: 5px;
    margin-top: 8px;
  }

  .board-delete-group button {
    min-height: 30px;
    border: 1px solid #d7d9d3;
    border-radius: 6px;
    background: #ffffff;
    color: #656a62;
    padding: 5px 8px;
    font-size: 9px;
    font-weight: 720;
  }

  .board-delete-group button:last-child {
    border-color: #bd4d48;
    background: #bd4d48;
    color: #ffffff;
  }

  .board-task-list {
    display: grid;
    gap: 9px;
  }

  .board-task {
    border: 1px solid #dfe3dc;
    border-radius: 9px;
    background: #ffffff;
    box-shadow: 0 7px 18px rgb(38 46 32 / 0.055);
  }

  /* Task option A — compact cards */
  .board-task--compact {
    min-height: 92px;
    display: flex;
    flex-direction: column;
    padding: 9px 11px;
  }

  .board-task-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .board-task .urgency {
    color: #666c63;
  }

  .board-task-top > button {
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    border: 0;
    background: transparent;
    color: #81877e;
  }

  .board-task h3 {
    overflow-wrap: anywhere;
    font-size: 14px;
    font-weight: 660;
    line-height: 1.25;
  }

  .board-task--compact h3 {
    margin: 4px 0 6px;
  }

  .board-complete {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: auto;
    min-height: 32px;
    align-self: flex-start;
    border: 0;
    background: transparent;
    color: #697067;
    padding: 4px 2px;
    font-size: 10px;
  }

  .board-complete:hover {
    color: #506e3a;
  }

  /* Task option B — ruled ledger */
  .board-columns--tasks-b .board-task-list {
    overflow: hidden;
    gap: 0;
    border: 1px solid #dfe3dc;
    border-radius: 9px;
    background: #ffffff;
  }

  .board-task--ledger {
    min-height: 52px;
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border: 0;
    border-bottom: 1px solid #e3e6e0;
    border-radius: 0;
    padding: 4px 7px;
    box-shadow: none;
  }

  .board-task--ledger:last-child {
    border-bottom: 0;
  }

  .board-task--ledger h3 {
    margin: 0;
    font-size: 13px;
    line-height: 1.35;
  }

  .board-ledger-priority {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .board-ledger-priority--high {
    background: #d84a4a;
  }

  .board-ledger-priority--soon {
    background: #e1ad2f;
  }

  .board-ledger-priority--none {
    background: transparent;
  }

  .board-task--editing {
    min-height: 94px;
    align-items: start;
    padding-block: 8px;
  }

  .board-task--editing .board-ledger-check {
    margin-top: 2px;
  }

  .board-task--editing > .board-ledger-priority {
    margin-top: 12px;
  }

  .board-ledger-check,
  .board-focus-check {
    width: 30px;
    height: 30px;
    border-color: #adb5a8;
    border-radius: 7px;
    color: #526d3e;
  }

  .board-ledger-edit-button {
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: #81877e;
    opacity: 0;
    transition:
      color 140ms ease,
      background 140ms ease,
      opacity 140ms ease;
  }

  .board-task--ledger:hover .board-ledger-edit-button,
  .board-task--ledger:focus-within .board-ledger-edit-button {
    opacity: 1;
  }

  .board-ledger-edit-button:hover {
    background: #f0f2ed;
    color: #4f673d;
  }

  .board-ledger-edit {
    width: 100%;
    min-width: 0;
    height: 34px;
    border: 1px solid #91a284;
    border-radius: 6px;
    outline: 2px solid rgb(92 120 69 / 0.14);
    background: #ffffff;
    color: #20241f;
    padding: 0 8px;
    font: inherit;
    font-size: 13px;
    font-weight: 660;
  }

  .board-ledger-editor {
    min-width: 0;
    display: grid;
    gap: 8px;
  }

  .board-priority-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .board-priority-picker button {
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    color: #666c63;
    padding: 3px 7px;
    font-size: 10px;
    font-weight: 650;
  }

  .board-priority-picker button:hover {
    background: #f3f4f0;
    color: #343a32;
  }

  .board-priority-picker button.is-selected {
    border-color: #c8cec3;
    background: #f0f2ed;
    color: #293027;
  }

  .priority-choice {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }

  .priority-choice--none {
    border: 1px solid #9ba198;
    background: #ffffff;
  }

  .priority-choice--soon {
    background: #e1ad2f;
  }

  .priority-choice--urgent {
    background: #d84a4a;
  }

  .board-ledger-edit-actions {
    display: flex;
    gap: 2px;
  }

  .board-ledger-edit-actions button {
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: #72786f;
  }

  .board-ledger-edit-actions button:first-child {
    background: #edf1e9;
    color: #536f40;
  }

  .board-ledger-edit-actions button:hover {
    background: #e7ebe3;
    color: #35452a;
  }

  /* Task option C — focus rows */
  .board-columns--tasks-c .board-task-list {
    gap: 0;
    border-radius: 9px;
    background: rgb(255 255 255 / 0.55);
    padding: 3px 8px;
  }

  .board-task--focus {
    min-height: 68px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    border: 0;
    border-bottom: 1px solid #dce1d8;
    border-radius: 0;
    background: transparent;
    padding: 8px 4px;
    box-shadow: none;
  }

  .board-task--focus:last-child {
    border-bottom: 0;
  }

  .board-task--focus h3 {
    margin: 0 0 6px;
    font-size: 14px;
  }

  .board-task--focus .urgency {
    font-size: 9px;
  }

  .board-focus-check {
    width: 36px;
    height: 36px;
    border-radius: 50%;
  }

  .board-focus-actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .board-focus-actions > button:first-child {
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border: 0;
    background: transparent;
    color: #81877e;
  }

  .board-empty {
    display: grid;
    min-height: 84px;
    place-items: center;
    border: 1px dashed #cbd1c7;
    border-radius: 9px;
    color: #858b82;
    font-size: 11px;
  }

  .board-add-to-column {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    margin-top: 12px;
    border: 0;
    background: transparent;
    color: #697067;
    min-height: 40px;
    padding: 8px;
    font-size: 10px;
  }

  .board-add-to-column:hover {
    color: #4f6d39;
  }

  .board-ungrouped {
    display: grid;
    grid-template-columns: minmax(170px, 0.24fr) minmax(0, 1fr);
    gap: 16px;
    margin-top: 14px;
    border: 1px solid #dfe3dc;
    border-radius: 10px;
    background: #f7f8f5;
    padding: 12px 14px;
  }

  .board-ungrouped > header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
  }

  .board-ungrouped-icon {
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    border: 1px dashed #bec5b9;
    border-radius: 8px;
    background: #ffffff;
    color: #687064;
  }

  .board-ungrouped h2 {
    margin: 0;
    color: #2d322b;
    font-size: 13px;
  }

  .board-ungrouped p {
    margin: 2px 0 0;
    color: #777e73;
    font-size: 9px;
  }

  .board-ungrouped > header > span:last-child {
    color: #70766d;
    font-size: 10px;
  }

  .board-ungrouped .board-task-list {
    align-content: start;
  }

  .board-empty--ungrouped {
    min-height: 52px;
    display: grid;
    place-items: center;
    border: 1px dashed #d4d9d0;
    border-radius: 9px;
    color: #858b82;
    font-size: 10px;
  }

  /* Task placement — minimal two-decision confirmation */
  .placement-dialog::backdrop {
    background: rgb(20 24 18 / 0.5);
  }

  .placement-dialog {
    position: fixed;
    z-index: 50;
    inset: 0;
    width: min(360px, calc(100% - 32px));
    max-height: calc(100dvh - 32px);
    margin: auto;
    overflow-y: auto;
    border: 1px solid #d9ded5;
    border-radius: 14px;
    outline: 0;
    background: #fbfcfa;
    color: #20241f;
    padding: 22px;
    box-shadow: 0 22px 60px rgb(18 24 14 / 0.24);
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    animation: placement-enter 180ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes placement-enter {
    from {
      transform: translateY(10px) scale(0.985);
      opacity: 0.65;
    }
  }

  .placement-dialog :is(button):focus-visible {
    outline: 2px solid #5c7845;
    outline-offset: 2px;
  }

  .placement-dialog h2 {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .placement-kicker {
    display: block;
    margin-bottom: 7px;
    color: #6d7767;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-align: center;
    text-transform: uppercase;
  }

  .placement-task-title {
    margin: 0 0 28px;
    color: #20251f;
    font-size: 18px;
    font-weight: 700;
    line-height: 1.35;
    overflow-wrap: anywhere;
    text-align: center;
    text-wrap: balance;
  }

  .placement-dialog fieldset {
    min-width: 0;
    margin: 0;
    border: 0;
    padding: 0;
  }

  .placement-step {
    display: grid;
    align-items: center;
    gap: 6px;
  }

  .placement-step + .placement-step {
    margin-top: 18px;
  }

  .placement-step legend {
    width: 100%;
    margin-bottom: 2px;
    color: #687064;
    font-size: 10px;
    font-weight: 750;
    text-align: center;
  }

  .placement-step button {
    display: grid;
    width: 40px;
    height: 40px;
    place-items: center;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: #6b7268;
  }

  .placement-step button:hover {
    background: #f0f2ed;
    color: #425438;
  }

  .placement-step--group {
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
    gap: 0;
  }

  .placement-step--group output {
    width: min(220px, 100%);
    min-height: 48px;
    display: grid;
    place-items: center;
    border: 1px solid #cfd5cb;
    border-radius: 9px;
    background: #ffffff;
    color: #30362e;
    padding: 8px 16px;
    font-size: 15px;
    font-weight: 700;
    text-align: center;
  }

  .placement-step--priority {
    width: 136px;
    grid-template-columns: 40px 48px 40px;
    justify-content: center;
    justify-self: center;
    gap: 0;
    margin-inline: auto !important;
  }

  .placement-step--priority legend {
    grid-column: 1 / -1;
  }

  .placement-step--priority button:first-of-type {
    justify-self: end;
  }

  .placement-priority-dot {
    width: 32px;
    height: 32px;
    justify-self: center;
    border-radius: 50%;
  }

  .placement-priority-dot.priority-choice--none {
    border: 2px solid #a9afa5;
    background: #ffffff;
  }

  .placement-priority-dot.priority-choice--soon {
    background: #e1ad2f;
  }

  .placement-priority-dot.priority-choice--urgent {
    background: #d84a4a;
  }

  .placement-dialog > footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 30px;
    border-top: 1px solid #e2e6df;
    padding-top: 16px;
  }

  .placement-dialog > footer > button {
    display: inline-flex;
    width: 44px;
    min-height: 42px;
    align-items: center;
    justify-content: center;
    border: 1px solid #d9ded5;
    border-radius: 8px;
    background: #ffffff;
    color: #687064;
  }

  .placement-dialog > footer > button:last-child {
    border-color: #587542;
    background: #587542;
    color: #ffffff;
  }

  .placement-dialog > footer > button:hover {
    filter: brightness(0.97);
  }

  /* Weather location — the same compact decision surface as task placement */
  .city-dialog {
    width: min(390px, calc(100% - 32px));
  }

  .placement-dialog.city-dialog h2 {
    position: static;
    width: auto;
    height: auto;
    margin: 0 0 16px;
    overflow: visible;
    clip: auto;
    color: #20251f;
    font-size: 21px;
    font-weight: 730;
    letter-spacing: -0.025em;
    line-height: 1.2;
    text-align: center;
    white-space: normal;
  }

  .city-search {
    min-height: 46px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 9px;
    border: 1px solid #cfd5cb;
    border-radius: 9px;
    background: #ffffff;
    color: #687064;
    padding: 0 12px;
  }

  .city-search:focus-within {
    border-color: #6b8556;
    outline: 2px solid rgb(92 120 69 / 0.14);
  }

  .city-search input {
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: #252a23;
    padding: 12px 0;
    font: inherit;
    font-size: 13px;
  }

  .city-search input::placeholder {
    color: #777f74;
  }

  .city-results {
    max-height: 256px;
    display: grid;
    gap: 3px;
    margin-top: 10px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .city-results > button {
    min-height: 54px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto 18px;
    align-items: center;
    gap: 10px;
    border: 1px solid transparent;
    border-radius: 9px;
    background: transparent;
    color: #4b5148;
    padding: 8px 10px;
    text-align: left;
  }

  .city-results > button:hover,
  .city-results > button.is-highlighted {
    border-color: #d9ded5;
    background: #f0f3eb;
    color: #3f5730;
  }

  .city-results > button[aria-selected='true'] {
    background: #f4f6f0;
  }

  .city-results > button > span:nth-child(2) {
    min-width: 0;
  }

  .city-results strong,
  .city-results small {
    display: block;
  }

  .city-results strong {
    color: #272c25;
    font-size: 12px;
  }

  .city-results small {
    margin-top: 2px;
    overflow: hidden;
    color: #6b7367;
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .city-temperature {
    color: #41483d;
    font-size: 12px;
    font-weight: 750;
  }

  .city-current {
    color: #5b7744;
  }

  .city-empty {
    min-height: 130px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 5px;
    color: #737a70;
    text-align: center;
  }

  .city-empty strong {
    margin-top: 4px;
    font-size: 12px;
  }

  .city-empty span {
    font-size: 10px;
  }

  .city-dialog > footer {
    margin-top: 18px;
  }

  .city-dialog > footer > button:disabled {
    cursor: not-allowed;
    border-color: #d9ded5;
    background: #e8ebe5;
    color: #92978f;
  }

  /* Calendar — a quiet weekly agenda with settings one level deeper */
  .calendar-auth-dialog {
    width: min(400px, calc(100% - 32px));
    text-align: center;
  }

  .calendar-auth-mark {
    margin: 0 auto 12px;
  }

  .placement-dialog.calendar-auth-dialog h2 {
    position: static;
    width: auto;
    height: auto;
    margin: 0;
    overflow: visible;
    clip: auto;
    color: #20251f;
    font-size: 21px;
    font-weight: 730;
    letter-spacing: -0.025em;
    line-height: 1.2;
    white-space: normal;
  }

  .calendar-auth-dialog > p {
    max-width: 34ch;
    margin: 10px auto 20px;
    color: #636c60;
    font-size: 11px;
    line-height: 1.55;
  }

  .calendar-auth-scope {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 11px;
    border-block: 1px solid #dfe3dc;
    color: #587044;
    padding: 14px 4px;
    text-align: left;
  }

  .calendar-auth-scope strong,
  .calendar-auth-scope small {
    display: block;
  }

  .calendar-auth-scope strong {
    color: #30352e;
    font-size: 11px;
  }

  .calendar-auth-scope small {
    margin-top: 3px;
    color: #71796e;
    font-size: 9px;
  }

  .calendar-auth-dialog > footer {
    margin-top: 20px;
  }

  .calendar-auth-dialog > footer > .calendar-google-button {
    width: auto;
    gap: 8px;
    padding: 0 13px;
    font-size: 10px;
    font-weight: 750;
  }

  .calendar-dialog {
    width: min(460px, calc(100% - 32px));
    padding: 20px 22px 18px;
  }

  .calendar-dialog-heading {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) 40px;
    align-items: start;
    margin-bottom: 17px;
  }

  .placement-dialog.calendar-dialog h2 {
    position: static;
    width: auto;
    height: auto;
    margin: 0;
    overflow: visible;
    clip: auto;
    color: #20251f;
    font-size: 21px;
    font-weight: 730;
    letter-spacing: -0.025em;
    line-height: 1.2;
    text-align: center;
    white-space: normal;
  }

  .calendar-dialog-heading .placement-kicker {
    margin-top: 3px;
  }

  .calendar-dialog-heading > button {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #687064;
  }

  .calendar-dialog-heading > button:hover {
    background: #f0f2ed;
    color: #425438;
  }

  .calendar-agenda {
    max-height: min(510px, calc(100dvh - 184px));
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }

  .calendar-agenda > section + section {
    margin-top: 18px;
  }

  .calendar-agenda h3 {
    margin: 0 0 6px;
    color: #687064;
    font-size: 9px;
    font-weight: 780;
  }

  .calendar-agenda > section > div {
    border-top: 1px solid #dfe3dc;
  }

  .calendar-event {
    min-height: 58px;
    display: grid;
    grid-template-columns: 48px 8px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    border-bottom: 1px solid #e3e7e0;
    padding: 8px 4px;
  }

  .calendar-event time {
    color: #626a5f;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }

  .calendar-event-dot,
  .calendar-source-color {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--calendar-color);
  }

  .calendar-event > div {
    min-width: 0;
  }

  .calendar-event strong,
  .calendar-event small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .calendar-event strong {
    color: #272c25;
    font-size: 12px;
    line-height: 1.35;
  }

  .calendar-event small {
    margin-top: 3px;
    color: #6f776c;
    font-size: 9px;
  }

  .calendar-dialog > footer {
    justify-content: space-between;
    margin-top: 16px;
  }

  .calendar-dialog > footer > span {
    color: #747b71;
    font-size: 9px;
  }

  .calendar-dialog > footer > button:last-child {
    border-color: #d9ded5;
    background: #ffffff;
    color: #687064;
  }

  .calendar-empty {
    min-height: 180px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 5px;
    color: #737a70;
    text-align: center;
  }

  .calendar-empty strong {
    margin-top: 4px;
    font-size: 12px;
  }

  .calendar-empty span {
    font-size: 10px;
  }

  .calendar-settings-dialog {
    padding-bottom: 22px;
  }

  .calendar-source-list {
    border-top: 1px solid #dfe3dc;
  }

  .calendar-source-list > button {
    width: 100%;
    min-height: 62px;
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    border: 0;
    border-bottom: 1px solid #e1e5de;
    background: transparent;
    color: #2d322b;
    padding: 8px 4px;
    text-align: left;
  }

  .calendar-source-list > button:hover {
    background: #f2f4ef;
  }

  .calendar-source-list strong,
  .calendar-source-list small {
    display: block;
  }

  .calendar-source-list strong {
    font-size: 12px;
  }

  .calendar-source-list small {
    margin-top: 3px;
    color: #71796e;
    font-size: 9px;
  }

  .calendar-source-switch {
    position: relative;
    width: 32px;
    height: 18px;
    border-radius: 999px;
    background: #c9cec5;
    transition: background 150ms ease;
  }

  .calendar-source-switch i {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 1px 3px rgb(28 33 25 / 0.22);
    transition: transform 150ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .calendar-source-list > button[aria-pressed='true'] .calendar-source-switch {
    background: #617d49;
  }

  .calendar-source-list > button[aria-pressed='true'] .calendar-source-switch i {
    transform: translateX(14px);
  }

  .calendar-account {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    margin-top: 22px;
    border-top: 1px solid #dfe3dc;
    padding-top: 17px;
  }

  .google-mark {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border: 1px solid #d9ded5;
    border-radius: 50%;
    background: #ffffff;
    color: #4285f4;
    font-size: 13px;
    font-weight: 800;
  }

  .calendar-account > span:nth-child(2) {
    min-width: 0;
  }

  .calendar-account strong,
  .calendar-account small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .calendar-account strong {
    color: #30352e;
    font-size: 10px;
  }

  .calendar-account small {
    margin-top: 2px;
    color: #747b71;
    font-size: 8px;
  }

  .calendar-account button {
    min-height: 36px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid #e1d2cf;
    border-radius: 8px;
    background: #ffffff;
    color: #9a473f;
    padding: 0 10px;
    font: inherit;
    font-size: 9px;
    font-weight: 720;
  }

  .calendar-account button:hover {
    background: #fbf5f4;
  }

  .calendar-disconnect-confirm {
    display: grid;
    gap: 14px;
    margin-top: 22px;
    border-top: 1px solid #e1d2cf;
    padding-top: 17px;
  }

  .calendar-disconnect-confirm strong {
    color: #402d2a;
    font-size: 11px;
  }

  .calendar-disconnect-confirm p {
    margin: 5px 0 0;
    color: #756863;
    font-size: 9px;
    line-height: 1.5;
  }

  .calendar-disconnect-confirm > div:last-child {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .calendar-disconnect-confirm button {
    min-height: 38px;
    border: 1px solid #d9ded5;
    border-radius: 8px;
    background: #ffffff;
    color: #626a5f;
    padding: 0 11px;
    font: inherit;
    font-size: 9px;
    font-weight: 720;
  }

  .calendar-disconnect-confirm button:last-child {
    border-color: #a75047;
    background: #a75047;
    color: #ffffff;
  }

  /* Commute routes — overview first, details only while editing */
  .commute-dialog {
    width: min(430px, calc(100% - 32px));
  }

  .placement-dialog.commute-dialog h2 {
    position: static;
    width: auto;
    height: auto;
    margin: 0 0 17px;
    overflow: visible;
    clip: auto;
    color: #20251f;
    font-size: 21px;
    font-weight: 730;
    letter-spacing: -0.025em;
    line-height: 1.2;
    text-align: center;
    white-space: normal;
  }

  .commute-route-list {
    display: grid;
    gap: 5px;
  }

  .commute-route-list > button {
    min-height: 76px;
    display: grid;
    grid-template-columns: 14px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    border: 1px solid transparent;
    border-radius: 9px;
    background: transparent;
    color: #4a5146;
    padding: 10px 11px;
    text-align: left;
  }

  .commute-route-list > button:hover {
    border-color: #d9ded5;
    background: #f0f3eb;
    color: #3f5730;
  }

  .commute-route-list > button > :global(svg) {
    color: #8b9287;
  }

  .commute-route-line {
    position: relative;
    width: 12px;
    height: 38px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
  }

  .commute-route-line::before {
    position: absolute;
    inset: 5px auto;
    width: 1px;
    background: #aab2a5;
    content: '';
  }

  .commute-route-line i {
    z-index: 1;
    width: 7px;
    height: 7px;
    border: 1.5px solid #708164;
    border-radius: 50%;
    background: #ffffff;
  }

  .commute-route-line i:last-child {
    background: #617d49;
  }

  .commute-route-copy {
    min-width: 0;
  }

  .commute-route-copy strong,
  .commute-route-copy small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .commute-route-copy strong {
    color: #272c25;
    font-size: 12px;
  }

  .commute-route-copy small {
    margin-top: 3px;
    color: #6b7367;
    font-size: 9px;
  }

  .commute-route-days {
    display: flex;
    gap: 3px;
    margin-top: 8px;
  }

  .commute-route-days i {
    width: 17px;
    height: 17px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: #eff1ec;
    color: #9ba096;
    font-size: 8px;
    font-style: normal;
    font-weight: 750;
  }

  .commute-route-days i.is-active {
    background: #dfe8d7;
    color: #4f6c3a;
  }

  .commute-add {
    width: 100%;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    margin-top: 10px;
    border: 1px dashed #cbd2c6;
    border-radius: 9px;
    background: transparent;
    color: #506744;
    font: inherit;
    font-size: 11px;
    font-weight: 700;
  }

  .commute-add:hover {
    border-color: #9fac96;
    background: #f4f6f1;
  }

  .commute-list-footer {
    justify-content: flex-start !important;
    margin-top: 18px !important;
  }

  .commute-list-footer > button:last-child {
    border-color: #d9ded5;
    background: #ffffff;
    color: #687064;
  }

  .commute-editor-heading {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) 40px;
    align-items: start;
  }

  .commute-editor-heading > button {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #687064;
  }

  .commute-editor-heading > button:hover {
    background: #f0f2ed;
    color: #425438;
  }

  .commute-editor-heading .placement-kicker {
    margin-top: 3px;
  }

  .commute-editor-heading h2 {
    margin-bottom: 20px !important;
  }

  .commute-points {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr);
    gap: 10px 12px;
  }

  .commute-points .commute-route-line {
    height: 86px;
    grid-row: 1 / 3;
    align-self: center;
  }

  .commute-points label {
    min-width: 0;
  }

  .commute-points label > span,
  .commute-days legend {
    display: block;
    margin-bottom: 5px;
    color: #687064;
    font-size: 9px;
    font-weight: 750;
  }

  .commute-points input {
    width: 100%;
    min-height: 43px;
    border: 1px solid #cfd5cb;
    border-radius: 9px;
    outline: 0;
    background: #ffffff;
    color: #252a23;
    padding: 10px 12px;
    font: inherit;
    font-size: 12px;
  }

  .commute-points input:focus {
    border-color: #6b8556;
    outline: 2px solid rgb(92 120 69 / 0.14);
  }

  .commute-points input::placeholder {
    color: #777f74;
  }

  .commute-days {
    margin-top: 22px !important;
  }

  .commute-days > div {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 6px;
  }

  .commute-days button {
    aspect-ratio: 1;
    min-width: 0;
    border: 1px solid #d4d9d0;
    border-radius: 50%;
    background: #ffffff;
    color: #737a70;
    font: inherit;
    font-size: 10px;
    font-weight: 750;
  }

  .commute-days button:hover {
    border-color: #aab6a2;
  }

  .commute-days button.is-selected {
    border-color: #617d49;
    background: #617d49;
    color: #ffffff;
  }

  .commute-editor > footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 28px;
    border-top: 1px solid #e2e6df;
    padding-top: 16px;
  }

  .commute-editor > footer button {
    min-height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    font: inherit;
  }

  .commute-delete {
    width: 42px;
    border: 1px solid #e1d2cf;
    background: #ffffff;
    color: #a24b43;
  }

  .commute-save {
    gap: 7px;
    border: 1px solid #587542;
    background: #587542;
    color: #ffffff;
    padding: 0 15px;
    font-size: 11px;
    font-weight: 750;
  }

  .commute-save:disabled {
    cursor: not-allowed;
    border-color: #d9ded5;
    background: #e8ebe5;
    color: #92978f;
  }

  .commute-empty {
    min-height: 126px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 5px;
    color: #737a70;
    text-align: center;
  }

  .commute-empty strong {
    margin-top: 4px;
    font-size: 12px;
  }

  .commute-empty span {
    font-size: 10px;
  }

  /* Shared secondary destinations */
  .secondary-backdrop {
    position: fixed;
    z-index: 40;
    inset: 0;
    display: flex;
    justify-content: flex-end;
  }

  .secondary-scrim {
    position: absolute;
    inset: 0;
    width: 100%;
    border: 0;
    background: rgb(9 13 20 / 0.44);
  }

  .secondary-panel {
    position: relative;
    width: min(430px, 100%);
    height: 100%;
    max-height: none;
    margin: 0 0 0 auto;
    overflow-y: auto;
    border: 0;
    background: #f8f9fb;
    color: #172033;
    padding: 28px;
    box-shadow: -18px 0 48px rgb(5 11 22 / 0.2);
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    animation: panel-enter 220ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes panel-enter {
    from {
      transform: translateX(32px);
      opacity: 0.7;
    }
  }

  .secondary-panel > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    padding-bottom: 22px;
    border-bottom: 1px solid #dbe1e9;
  }

  .secondary-panel header small {
    color: #717c8e;
    font-size: 10px;
  }

  .secondary-panel h2 {
    margin: 4px 0 0;
    font-size: 28px;
    letter-spacing: -0.03em;
  }

  .secondary-panel header button {
    display: grid;
    width: 38px;
    height: 38px;
    place-items: center;
    border: 1px solid #cfd6e0;
    border-radius: 50%;
    background: white;
  }

  .secondary-intro {
    margin: 24px 0 30px;
    color: #5b6678;
    font-size: 13px;
    line-height: 1.6;
  }

  .secondary-menu,
  .history-list,
  .settings-list {
    display: grid;
    border-top: 1px solid #dbe1e9;
  }

  .secondary-menu button,
  .settings-list button {
    min-height: 62px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    border: 0;
    border-bottom: 1px solid #dbe1e9;
    background: transparent;
    padding: 0;
    color: #253146;
    text-align: left;
    font-size: 13px;
    font-weight: 700;
  }

  .secondary-menu button:hover,
  .settings-list button:hover {
    color: #2857a9;
  }

  .secondary-primary {
    width: 100%;
    margin-top: 28px;
    border: 0;
    border-radius: 9px;
    background: #173e8f;
    color: white;
    padding: 12px;
    font-size: 12px;
    font-weight: 750;
  }

  .history-list article {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 18px;
    padding: 17px 0;
    border-bottom: 1px solid #dbe1e9;
  }

  .history-list span {
    display: flex;
    align-items: center;
    gap: 7px;
    color: #196b45;
    font-size: 11px;
    font-weight: 750;
  }

  .history-list strong {
    font-size: 12px;
  }

  .history-list small {
    grid-column: 1 / -1;
    color: #707b8d;
    font-size: 10px;
  }

  .settings-list button {
    grid-template-columns: 1fr auto;
    min-height: 76px;
  }

  .settings-list small,
  .settings-list strong {
    display: block;
  }

  .settings-list small {
    margin-bottom: 5px;
    color: #737e90;
    font-size: 10px;
    font-weight: 500;
  }

  .settings-list strong {
    font-size: 12px;
  }

  /* Prototype controls */
  .prototype-switcher {
    position: fixed;
    z-index: 20;
    left: 50%;
    bottom: 22px;
    display: grid;
    grid-template-columns: 42px minmax(150px, 1fr) 42px;
    align-items: center;
    transform: translateX(-50%);
    border: 1px solid rgb(255 255 255 / 0.22);
    border-radius: 999px;
    background: #101216;
    color: white;
    padding: 5px;
    box-shadow: 0 12px 34px rgb(0 0 0 / 0.32);
  }

  .prototype-switcher button {
    display: grid;
    width: 42px;
    height: 42px;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: white;
  }

  .prototype-switcher button:hover {
    background: #2a2d34;
  }

  .prototype-switcher > div {
    display: grid;
    text-align: center;
  }

  .prototype-switcher small {
    color: #aeb3bf;
    font-size: 9px;
  }

  .prototype-switcher strong {
    font-size: 11px;
  }

  @media (max-width: 1120px) {
    .desk-shell {
      grid-template-columns: 78px minmax(500px, 1fr) 290px;
    }

    .desk-rail {
      align-items: center;
      padding-inline: 10px;
    }

    .desk-brand span,
    .desk-nav a :global(:not(svg)),
    .desk-nav a,
    .desk-nav button {
      font-size: 0;
    }

    .desk-brand {
      padding-inline: 0;
    }

    .desk-nav a,
    .desk-nav button {
      width: 42px;
      height: 42px;
      justify-content: center;
      padding: 0;
    }

    .visitor-card {
      display: none;
    }

    .board-status-ribbon {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 820px) {
    .desk-shell {
      display: block;
    }

    .desk-rail,
    .desk-brief {
      display: none;
    }

    .desk-workspace {
      min-height: 100vh;
      padding: 20px 18px 130px;
    }

    .desk-header {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 12px;
    }

    .mobile-nav-button {
      display: grid;
      width: 40px;
      height: 40px;
      place-items: center;
      border: 1px solid #ccd3df;
      border-radius: 9px;
      background: #fff;
    }

    .desk-delivery {
      grid-column: 1 / -1;
      width: 100%;
      justify-content: space-between;
      flex-direction: row-reverse;
      margin-top: 7px;
    }

    .desk-mobile-menu {
      display: grid;
      gap: 4px;
      margin-top: 12px;
      padding: 10px;
      border: 1px solid #d9dee7;
      border-radius: 12px;
      background: #f3f6fa;
    }

    .desk-mobile-menu a,
    .desk-mobile-menu button {
      border: 0;
      padding: 10px;
      border-radius: 7px;
      background: transparent;
      color: #172033;
      font-size: 13px;
      font-weight: 650;
      text-align: left;
      text-decoration: none;
    }

    .desk-mobile-menu a:hover,
    .desk-mobile-menu button:hover {
      background: #e1e7f0;
    }

    .desk-mobile-menu span {
      padding: 8px 10px 4px;
      color: #687488;
      font-size: 10px;
    }

    .desk-capture {
      margin-top: 22px;
    }

    .desk-task-row {
      grid-template-columns: auto minmax(0, 1fr) auto;
    }

    .desk-task-row .urgency {
      display: none;
    }

    .desk-mobile-brief {
      display: block;
      margin-top: 30px;
      border-top: 1px solid #dfe4eb;
      border-bottom: 1px solid #dfe4eb;
    }

    .desk-mobile-brief summary {
      min-height: 70px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      cursor: pointer;
      list-style: none;
    }

    .desk-mobile-brief summary::-webkit-details-marker {
      display: none;
    }

    .desk-mobile-brief summary small,
    .desk-mobile-brief summary strong {
      display: block;
    }

    .desk-mobile-brief summary small {
      margin-bottom: 4px;
      color: #737e90;
      font-size: 10px;
    }

    .desk-mobile-brief summary strong {
      font-size: 14px;
    }

    .desk-mobile-brief > div {
      display: grid;
      gap: 0;
      padding-bottom: 18px;
    }

    .desk-mobile-brief p {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 12px;
      margin: 0;
      padding: 14px 0;
      border-top: 1px solid #e5e9ee;
      color: #687386;
      font-size: 11px;
      line-height: 1.45;
    }

    .desk-mobile-brief p strong {
      display: block;
      margin-bottom: 2px;
      color: #172033;
    }

    .desk-mobile-brief > div > button {
      border: 0;
      border-radius: 8px;
      background: #e8eef9;
      color: #20478f;
      padding: 10px;
      font-size: 11px;
      font-weight: 750;
    }

    .sheet-topbar {
      height: auto;
      min-height: 68px;
      padding: 12px 18px;
    }

    .sheet-actions {
      gap: 10px;
    }

    .sheet-visitor {
      font-size: 9px;
    }

    .sheet-delivery .delivery-toggle__copy small {
      display: none;
    }

    .sheet-delivery .delivery-toggle__copy strong {
      font-size: 9px;
    }

    .sheet-page {
      width: min(100% - 36px, 620px);
      padding-top: 50px;
    }

    .sheet-intro {
      display: block;
      padding-bottom: 28px;
    }

    .sheet-intro > p {
      margin: 0 0 18px;
    }

    .sheet-intro h1 {
      font-size: clamp(50px, 15vw, 76px);
    }

    .sheet-intro-meta {
      margin-top: 34px;
    }

    .sheet-task-area {
      display: block;
      padding-top: 34px;
    }

    .sheet-capture {
      margin-bottom: 50px;
    }

    .sheet-capture label {
      max-width: none;
      font-size: 19px;
    }

    .sheet-brief-content {
      grid-template-columns: 1fr;
    }

    .sheet-footer {
      align-items: flex-start;
      flex-direction: column;
    }

    .sheet-footer nav {
      width: 100%;
      flex-wrap: wrap;
      gap: 16px;
    }

    .board-shell {
      display: block;
    }

    .board-rail {
      position: fixed;
      top: auto;
      bottom: 0;
      width: 100%;
      height: 62px;
      flex-direction: row;
      justify-content: space-around;
      padding: 0 8px;
      border-top: 1px solid #dfe3dc;
      border-right: 0;
      background: #ffffff;
    }

    .board-brand {
      display: none;
    }

    .board-rail nav,
    .board-rail .board-rail-bottom {
      display: flex;
      margin: 0;
    }

    .board-main {
      padding: 20px 16px 145px;
    }

    .board-header {
      align-items: flex-start;
      flex-direction: column;
      gap: 16px;
    }

    .board-header-actions {
      width: 100%;
      justify-content: space-between;
    }

    .board-status-ribbon {
      display: flex;
      overflow-x: auto;
      scrollbar-width: none;
      scroll-snap-type: x mandatory;
    }

    .board-status-ribbon::-webkit-scrollbar {
      display: none;
    }

    .board-status-ribbon > .board-status-item {
      min-width: 205px;
      scroll-snap-align: start;
    }

    .board-columns {
      display: grid;
      grid-template-columns: 1fr;
    }

    .board-groups-toolbar button,
    .board-column-actions button,
    .board-delete-group button {
      min-width: 44px;
      min-height: 44px;
    }

    .board-column-actions button {
      opacity: 1;
    }

    .board-group-composer {
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
    }

    .board-group-composer-actions {
      grid-column: 1 / -1;
      justify-content: flex-end;
    }

    .board-group-composer-actions button {
      min-height: 44px;
    }

    .board-group-composer > small {
      position: static;
      grid-column: 2;
    }

    .board-ungrouped {
      grid-template-columns: 1fr;
    }

    .board-rail nav a,
    .board-rail nav button {
      width: 44px;
      height: 44px;
    }

    .board-capture button {
      min-height: 44px;
    }

    .board-task-top > button,
    .board-complete,
    .board-ledger-check,
    .board-ledger-edit-button,
    .board-ledger-edit-actions button,
    .board-focus-check,
    .board-focus-actions > button:first-child {
      min-width: 44px;
      min-height: 44px;
    }

    .board-task--ledger {
      min-height: 58px;
      grid-template-columns: 44px auto minmax(0, 1fr) 44px;
      gap: 9px;
      padding: 6px 4px;
    }

    .board-ledger-edit-button {
      opacity: 1;
    }

    .board-task--ledger.board-task--editing {
      min-height: 110px;
      grid-template-columns: 44px minmax(0, 1fr) 44px;
    }

    .board-task--editing > .board-ledger-priority {
      display: none;
    }

    .board-task--editing .board-ledger-editor {
      grid-column: 2;
    }

    .board-task--editing .board-ledger-edit-actions {
      grid-column: 3;
      flex-direction: column;
    }

    .board-priority-picker button {
      min-height: 34px;
    }

    .board-task--compact {
      min-height: 96px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 44px;
      grid-template-rows: 38px minmax(42px, auto);
      align-items: center;
      padding: 8px 6px 8px 12px;
    }

    .board-task--compact .board-task-top {
      display: contents;
    }

    .board-task--compact .urgency {
      grid-column: 1;
      grid-row: 1;
    }

    .board-task--compact .board-task-top > button {
      grid-column: 2;
      grid-row: 1;
    }

    .board-task--compact h3 {
      grid-column: 1;
      grid-row: 2;
      margin: 0;
    }

    .board-task--compact .board-complete {
      grid-column: 2;
      grid-row: 2;
      margin: 0;
      place-self: center;
      justify-content: center;
      padding: 0;
    }

    .board-task--compact .board-complete span {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }

    .board-task--ledger {
      min-height: 58px;
      padding-block: 6px;
    }

    .board-task--focus {
      min-height: 70px;
    }

    .board-complete {
      margin-left: -8px;
      padding: 8px;
    }

    .board-add-to-column {
      min-height: 44px;
    }

    .placement-step button,
    .placement-dialog > footer > button {
      min-height: 44px;
    }
  }

  @media (max-width: 480px) {
    .desk-header h1 {
      font-size: 27px;
    }

    .desk-capture {
      grid-template-columns: auto 1fr;
    }

    .desk-capture > button {
      grid-column: 1 / -1;
      width: 100%;
    }

    .sheet-page {
      width: calc(100% - 28px);
    }

    .sheet-task {
      grid-template-columns: auto auto minmax(0, 1fr);
    }

    .sheet-task-number {
      display: none;
    }

    .placement-dialog {
      width: calc(100% - 24px);
      max-height: calc(100dvh - 24px);
      padding: 16px 14px;
    }

    .placement-dialog > footer {
      align-items: stretch;
      flex-direction: column-reverse;
    }

    .placement-dialog > footer > button {
      justify-content: center;
    }

    .calendar-dialog > footer {
      align-items: center;
      flex-direction: row;
    }

    .calendar-dialog > footer > button {
      width: 44px;
    }

    .calendar-dialog-heading > button {
      width: 44px;
      height: 44px;
    }

    .calendar-account {
      grid-template-columns: 30px minmax(0, 1fr);
    }

    .calendar-account > button {
      grid-column: 1 / -1;
      min-height: 44px;
      justify-content: center;
      margin-top: 4px;
    }

    .calendar-disconnect-confirm button {
      min-height: 44px;
    }

    .calendar-auth-dialog > footer > .calendar-google-button {
      width: 100%;
    }

    .sheet-task > button:last-child {
      grid-column: 3;
      grid-row: 1;
      justify-self: end;
    }

    .sheet-task > div {
      padding-right: 24px;
    }

    .board-header-actions {
      display: grid;
      grid-template-columns: 1fr;
    }

    .board-groups-toolbar {
      align-items: center;
    }

    .board-groups-toolbar button {
      justify-content: center;
    }

    .board-visitor {
      display: block;
      font-size: 10px;
    }

    .board-delivery {
      width: 100%;
      justify-content: space-between;
      flex-direction: row-reverse;
    }

    .prototype-switcher {
      bottom: 76px;
      width: min(280px, calc(100% - 28px));
    }

    .secondary-panel {
      padding: 22px 18px 110px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
    }
  }
</style>
