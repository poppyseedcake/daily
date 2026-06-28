<script lang="ts">
  import { CalendarDays, Check, GripVertical, Mail, Pencil, ShieldCheck, Trash2 } from '@lucide/svelte';
  import { dragHandle, dragHandleZone, SHADOW_ITEM_MARKER_PROPERTY_NAME } from 'svelte-dnd-action';
  import { onMount } from 'svelte';
  import { z } from 'zod';
  import Panel from '$lib/components/Panel.svelte';
  import { buildDemoCalendarSection } from '$lib/demoCalendar';
  import { renderDailySummary, type DailySummaryInput } from '$lib/dailySummaryRenderer';
  import {
    defaultSummaryConfiguration,
    canPreviewDailySummary,
    summaryConfigurationSchema,
    type SummaryConfiguration,
    type SummarySection,
    type SummaryTheme,
    type UserTimeZone
  } from '$lib/summaryConfiguration';
  import {
    addTodoCategory,
    addTodoTask,
    completeTodoTask as completeTodoTaskInModule,
    deleteTodoCategory as deleteTodoCategoryInModule,
    reorderTodoTasks as reorderTodoTasksInModule,
    tasksForTodoCategory,
    todoCategorySchema,
    todoTaskSchema,
    updateTodoCategory,
    updateTodoTask,
    type TodoCategory,
    type TodoTask,
    type TodoUrgency
  } from '$lib/todo';

  const summarySections: Array<{ key: SummarySection; label: string }> = [
    { key: 'weather', label: 'Weather' },
    { key: 'commute', label: 'Commute' },
    { key: 'calendar', label: 'Calendar' },
    { key: 'todo', label: 'Todo' }
  ];
  const userTimeZones: UserTimeZone[] = ['Europe/Warsaw', 'America/New_York', 'UTC'];
  const visitorLocalSetupStorageKey = 'daily.visitorLocalSetup.v1';
  const visitorLocalSetupSchema = z.object({
    summaryConfiguration: summaryConfigurationSchema,
    todoCategories: z.array(todoCategorySchema),
    todoTasks: z.array(todoTaskSchema),
    nextTodoId: z.number().int().positive()
  });
  const initialSummaryConfiguration = summaryConfigurationSchema.parse(defaultSummaryConfiguration);
  let summaryTime = $state(initialSummaryConfiguration.summaryTime);
  let summaryTimeInput = $state(initialSummaryConfiguration.summaryTime);
  let userTimeZone = $state<UserTimeZone>(initialSummaryConfiguration.userTimeZone);
  let summaryTheme = $state<SummaryTheme>(initialSummaryConfiguration.summaryTheme);
  let summaryDeliveryEnabled = $state(initialSummaryConfiguration.summaryDeliveryEnabled);
  let enabledSections = $state<Record<SummarySection, boolean>>({
    ...initialSummaryConfiguration.sections
  });
  let todoTasks = $state<TodoTask[]>([]);
  let todoCategories = $state<TodoCategory[]>([]);
  let newTodoTitle = $state('');
  let newTodoCategoryId = $state('');
  let newTodoUrgency = $state<TodoUrgency>('low');
  let newCategoryName = $state('');
  let editingTaskId = $state<string | null>(null);
  let editingTaskTitle = $state('');
  let editingTaskUrgency = $state<TodoUrgency>('low');
  let editingCategoryId = $state<string | null>(null);
  let editingCategoryName = $state('');
  let todoControlsReady = $state(false);
  let localSetupHydrated = $state(false);
  let nextTodoId = 1;

  onMount(() => {
    restoreVisitorLocalSetup();
    localSetupHydrated = true;
    todoControlsReady = true;
  });

  const currentSummaryConfiguration = (): SummaryConfiguration => ({
    summaryTime,
    userTimeZone,
    summaryTheme,
    summaryDeliveryEnabled,
    sections: { ...enabledSections }
  });

  const updateSummaryConfiguration = (nextConfiguration: SummaryConfiguration) => {
    const result = summaryConfigurationSchema.safeParse(nextConfiguration);

    if (!result.success) {
      return;
    }

    summaryTime = result.data.summaryTime;
    summaryTimeInput = result.data.summaryTime;
    userTimeZone = result.data.userTimeZone;
    summaryTheme = result.data.summaryTheme;
    summaryDeliveryEnabled = result.data.summaryDeliveryEnabled;
    enabledSections = { ...result.data.sections };
  };

  const patchSummaryConfiguration = (patch: Partial<SummaryConfiguration>) => {
    updateSummaryConfiguration({
      ...currentSummaryConfiguration(),
      ...patch
    });
  };

  const toggleSection = (section: SummarySection, enabled: boolean) => {
    const result = summaryConfigurationSchema.safeParse({
      ...currentSummaryConfiguration(),
      sections: { ...enabledSections, [section]: enabled }
    });

    if (!result.success) {
      return;
    }

    enabledSections = { ...result.data.sections };
  };

  const updateSummaryTimeInput = (value: string) => {
    summaryTimeInput = value;

    const result = summaryConfigurationSchema.safeParse({
      ...currentSummaryConfiguration(),
      summaryTime: value
    });

    if (result.success) {
      summaryTime = result.data.summaryTime;
    }
  };

  const readInputChecked = (event: Event) => (event.currentTarget as HTMLInputElement).checked;
  const readInputValue = (event: Event) => (event.currentTarget as HTMLInputElement).value;
  const nextId = (prefix: string) => `${prefix}-${nextTodoId++}`;
  const restoreVisitorLocalSetup = () => {
    let storedSetup: string | null | undefined;

    try {
      storedSetup = globalThis.localStorage?.getItem(visitorLocalSetupStorageKey);
    } catch {
      return;
    }

    if (!storedSetup) {
      return;
    }

    let parsedSetup: unknown;
    try {
      parsedSetup = JSON.parse(storedSetup);
    } catch {
      return;
    }

    const result = visitorLocalSetupSchema.safeParse(parsedSetup);

    if (!result.success) {
      return;
    }

    updateSummaryConfiguration(result.data.summaryConfiguration);
    todoCategories = result.data.todoCategories;
    todoTasks = result.data.todoTasks;
    nextTodoId = result.data.nextTodoId;
  };
  const persistVisitorLocalSetup = () => {
    try {
      globalThis.localStorage?.setItem(
        visitorLocalSetupStorageKey,
        JSON.stringify({
          summaryConfiguration: currentSummaryConfiguration(),
          todoCategories,
          todoTasks,
          nextTodoId
        })
      );
    } catch {
      return;
    }
  };
  const urgencyLabel = (urgency: TodoUrgency) =>
    urgency === 'high' ? 'High urgency' : urgency === 'medium' ? 'Medium urgency' : 'Low urgency';
  const urgencyMark = (urgency: TodoUrgency) =>
    urgency === 'high' ? '!' : urgency === 'medium' ? '!' : '';
  const tasksForCategory = (categoryId: string | null) => tasksForTodoCategory(todoTasks, categoryId);
  const isDndShadowTask = (task: TodoTask) =>
    Boolean((task as TodoTask & { [SHADOW_ITEM_MARKER_PROPERTY_NAME]?: boolean })[SHADOW_ITEM_MARKER_PROPERTY_NAME]);
  const realTodoDropTasks = (orderedTasks: TodoTask[], draggedTaskId: string | undefined = undefined) =>
    orderedTasks.flatMap((task) => {
      if (!isDndShadowTask(task)) {
        return [task];
      }

      const realTask = todoTasks.find((candidate) => candidate.id === task.id || candidate.id === draggedTaskId);
      return realTask ? [realTask] : [];
    });
  const todoDropTaskIds = (orderedTasks: TodoTask[], draggedTaskId: string | undefined = undefined) =>
    realTodoDropTasks(orderedTasks, draggedTaskId).map((task) => task.id);
  const reorderTodoTasks = (
    categoryId: string | null,
    orderedTasks: TodoTask[],
    draggedTaskId: string | undefined = undefined,
    detachMissingTasks = false
  ) => {
    const draggedTask = draggedTaskId
      ? todoTasks.find((candidate) => candidate.id === draggedTaskId)
      : undefined;
    todoTasks = reorderTodoTasksInModule(todoTasks, {
      categoryId,
      orderedTaskIds: todoDropTaskIds(orderedTasks, draggedTaskId),
      sourceCategoryId: draggedTask?.categoryId,
      detachMissingTasks
    });
  };
  const handleTodoDrop = (
    categoryId: string | null,
    event: CustomEvent<{ items: TodoTask[]; info?: { id?: string; trigger?: string } }>,
    detachMissingTasks = false
  ) => {
    if (event.detail.info?.trigger === 'dragStarted') {
      return;
    }

    reorderTodoTasks(categoryId, event.detail.items, event.detail.info?.id, detachMissingTasks);
  };

  const createTodoTask = () => {
    const nextTasks = addTodoTask({
      tasks: todoTasks,
      input: {
        title: newTodoTitle,
        categoryId: newTodoCategoryId === '' ? null : newTodoCategoryId,
        urgency: newTodoUrgency
      },
      nextId: () => nextId('todo')
    });

    if (nextTasks === todoTasks) {
      return;
    }

    todoTasks = nextTasks;
    newTodoTitle = '';
    newTodoCategoryId = '';
    newTodoUrgency = 'low';
  };

  const startEditingTodoTask = (task: TodoTask) => {
    editingTaskId = task.id;
    editingTaskTitle = task.title;
    editingTaskUrgency = task.urgency;
  };

  const saveEditingTodoTask = () => {
    if (!editingTaskId) {
      return;
    }

    const nextTasks = updateTodoTask(todoTasks, {
      id: editingTaskId,
      title: editingTaskTitle,
      urgency: editingTaskUrgency
    });

    if (nextTasks === todoTasks) {
      return;
    }

    todoTasks = nextTasks;
    editingTaskId = null;
    editingTaskTitle = '';
    editingTaskUrgency = 'low';
  };

  const completeTodoTask = (taskId: string) => {
    todoTasks = completeTodoTaskInModule(todoTasks, taskId);
  };

  const createTodoCategory = () => {
    const nextCategories = addTodoCategory({
      categories: todoCategories,
      input: { name: newCategoryName },
      nextId: () => nextId('category')
    });

    if (nextCategories === todoCategories) {
      return;
    }

    todoCategories = nextCategories;
    newCategoryName = '';
  };

  const startEditingTodoCategory = (category: TodoCategory) => {
    editingCategoryId = category.id;
    editingCategoryName = category.name;
  };

  const saveEditingTodoCategory = () => {
    if (!editingCategoryId) {
      return;
    }

    const nextCategories = updateTodoCategory(todoCategories, {
      id: editingCategoryId,
      name: editingCategoryName
    });

    if (nextCategories === todoCategories) {
      return;
    }

    todoCategories = nextCategories;
    editingCategoryId = null;
    editingCategoryName = '';
  };

  const deleteTodoCategory = (category: TodoCategory) => {
    if (!globalThis.confirm(`Delete ${category.name} and all Todo Tasks inside it?`)) {
      return;
    }

    const nextTodoState = deleteTodoCategoryInModule({
      categories: todoCategories,
      tasks: todoTasks,
      categoryId: category.id
    });

    todoCategories = nextTodoState.categories;
    todoTasks = nextTodoState.tasks;
    if (newTodoCategoryId === category.id) {
      newTodoCategoryId = '';
    }
  };
  const demoCalendar = $derived(buildDemoCalendarSection({ userTimeZone }));
  const previewSections: DailySummaryInput['sections'] = $derived({
    weather: {
      status: 'available',
      label: 'Mock Weather',
      detail: 'Mock provider data: 18C, clear, light wind.'
    },
    commute: {
      status: 'available',
      label: 'Mock Commute',
      detail: 'Mock provider data: 24 minutes by tram to the office.'
    },
    calendar: {
      status: 'available',
      label: demoCalendar.label,
      detail: demoCalendar.summaryDetail
    },
    todo: {
      status: 'unavailable',
      label: 'Todo',
      reason: 'Todo source is not connected yet.'
    }
  });
  const previewConfiguration: SummaryConfiguration = $derived({
    summaryTime,
    userTimeZone,
    summaryTheme,
    summaryDeliveryEnabled,
    sections: {
      weather: enabledSections.weather,
      commute: enabledSections.commute,
      calendar: enabledSections.calendar,
      todo: enabledSections.todo
    }
  });
  let renderedSummaryHtml = $state('');

  $effect(() => {
    renderedSummaryHtml = renderDailySummary({
      configuration: previewConfiguration,
      sections: previewSections,
      todoCategories,
      todoTasks
    }).html;
  });

  $effect(() => {
    const result = summaryConfigurationSchema.safeParse({
      ...currentSummaryConfiguration(),
      summaryTime: summaryTimeInput
    });

    if (result.success && result.data.summaryTime !== summaryTime) {
      summaryTime = result.data.summaryTime;
    }
  });

  $effect(() => {
    if (localSetupHydrated) {
      persistVisitorLocalSetup();
    }
  });
</script>

<svelte:head>
  <title>Daily</title>
  <meta
    name="description"
    content="Daily walking skeleton with Visitor mode, Local Setup, and Daily Summary preview."
  />
</svelte:head>

<main class="min-h-screen bg-stone-100 text-stone-950">
  <div class="mx-auto grid w-full max-w-6xl gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[1fr_20rem] lg:px-8">
    <section class="space-y-6">
      <div class="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p class="text-sm font-semibold text-emerald-700">Visitor mode</p>
            <h1 class="mt-2 text-3xl font-semibold text-stone-950">Daily</h1>
            <p class="mt-3 max-w-2xl text-base text-stone-700">
              Shape a Local Setup for a future Daily Summary. Google sign-in will be required before
              a Daily Summary can be sent.
            </p>
          </div>
          <a
            class="inline-flex h-10 items-center gap-2 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-800 hover:bg-stone-50"
            href="/admin"
          >
            <ShieldCheck size={18} aria-hidden="true" />
            Admin Panel
          </a>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <Panel title="Summary Configuration" eyebrow="Local Setup">
          <div class="grid gap-3">
            <label class="grid gap-1">
              <span class="font-medium text-stone-800" id="summary-time-label">Summary Time</span>
              <input
                aria-labelledby="summary-time-label"
                class="h-10 rounded-md border border-stone-300 px-3"
                type="time"
                bind:value={summaryTimeInput}
                oninput={(event) => {
                  updateSummaryTimeInput(readInputValue(event));
                }}
                onchange={(event) => {
                  updateSummaryTimeInput(readInputValue(event));
                }}
              />
            </label>
            <fieldset class="grid gap-2">
              <legend class="font-medium text-stone-800">User Time Zone</legend>
              <div class="grid gap-2">
                {#each userTimeZones as timeZone}
                  <label
                    class="flex items-center gap-2 rounded-md border border-stone-200 px-3 py-2"
                    for={`time-zone-${timeZone}`}
                  >
                    <input
                      id={`time-zone-${timeZone}`}
                      name="user-time-zone"
                      type="radio"
                      bind:group={userTimeZone}
                      value={timeZone}
                      onchange={() => {
                        patchSummaryConfiguration({ userTimeZone: timeZone });
                      }}
                    />
                    <span>{timeZone}</span>
                  </label>
                {/each}
              </div>
            </fieldset>
            <fieldset class="grid gap-2">
              <legend class="font-medium text-stone-800">Summary Theme</legend>
              <div class="grid grid-cols-2 gap-2">
                <label
                  class="flex items-center gap-2 rounded-md border border-stone-200 px-3 py-2"
                  for="summary-theme-light"
                >
                  <input
                    id="summary-theme-light"
                    name="summary-theme"
                    type="radio"
                    bind:group={summaryTheme}
                    value="light"
                    onchange={() => {
                      patchSummaryConfiguration({ summaryTheme: 'light' });
                    }}
                  />
                  <span>Light Theme</span>
                </label>
                <label
                  class="flex items-center gap-2 rounded-md border border-stone-200 px-3 py-2"
                  for="summary-theme-dark"
                >
                  <input
                    id="summary-theme-dark"
                    name="summary-theme"
                    type="radio"
                    bind:group={summaryTheme}
                    value="dark"
                    onchange={() => {
                      patchSummaryConfiguration({ summaryTheme: 'dark' });
                    }}
                  />
                  <span>Dark Theme</span>
                </label>
              </div>
            </fieldset>
            <label
              class="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-950"
              for="summary-delivery"
            >
              <span class="font-medium">Summary Delivery</span>
              <input
                id="summary-delivery"
                type="checkbox"
                bind:checked={summaryDeliveryEnabled}
                onchange={(event) => {
                  patchSummaryConfiguration({ summaryDeliveryEnabled: readInputChecked(event) });
                }}
              />
            </label>
          </div>
        </Panel>

        <Panel title="Summary Sections" eyebrow="Daily Summary">
          <div class="grid gap-3">
            {#each summarySections as section}
              <label
                class="flex items-center justify-between gap-3 rounded-md border border-stone-200 px-3 py-2"
                for={`${section.key}-section`}
              >
                <span>{section.label} Section</span>
                <input
                  id={`${section.key}-section`}
                  type="checkbox"
                  bind:checked={enabledSections[section.key]}
                  onchange={(event) => {
                    toggleSection(section.key, readInputChecked(event));
                  }}
                />
              </label>
            {/each}
          </div>
        </Panel>
      </div>

      {#if enabledSections.calendar}
        <Panel title="Demo Calendar" eyebrow="Sample Calendar Events for Visitor mode">
          <div class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <p class="font-medium text-stone-900">Week Ahead</p>
              <p class="rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-950">
                Demo Calendar
              </p>
            </div>
            <div class="grid gap-2">
              {#each demoCalendar.weekAhead as day}
                <section class="rounded-md border border-stone-200 px-3 py-2">
                  <div class="flex items-center gap-2 text-sm font-semibold text-stone-900">
                    <CalendarDays size={16} aria-hidden="true" />
                    <span>{day.label}</span>
                    <span class="text-stone-500">{day.date}</span>
                  </div>
                  {#if day.events.length > 0}
                    <ul class="mt-2 grid gap-1">
                      {#each day.events as event}
                        <li class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-stone-700">
                          <span class="font-medium text-stone-950">{event.timeLabel}</span>
                          <span>{event.title}</span>
                        </li>
                      {/each}
                    </ul>
                  {:else}
                    <p class="mt-2 text-sm text-stone-500">No demo Calendar Events.</p>
                  {/if}
                </section>
              {/each}
            </div>
          </div>
        </Panel>
      {/if}

      <Panel title="Todo Tasks" eyebrow="Todo">
        <div class="space-y-5">
          <div class="grid gap-3 rounded-md border border-stone-200 p-3">
            <label class="grid gap-1">
              <span class="font-medium text-stone-800">New Todo Task</span>
              <input
                class="h-10 rounded-md border border-stone-300 px-3"
                bind:value={newTodoTitle}
                aria-label="New Todo Task"
              />
            </label>
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="grid gap-1">
                <span class="font-medium text-stone-800">Todo Category</span>
                <select
                  class="h-10 rounded-md border border-stone-300 px-3"
                  bind:value={newTodoCategoryId}
                  aria-label="Todo Category"
                >
                  <option value="">No Category</option>
                  {#each todoCategories as category}
                    <option value={category.id}>{category.name}</option>
                  {/each}
                </select>
              </label>
              <label class="grid gap-1">
                <span class="font-medium text-stone-800">Urgency</span>
                <select
                  class="h-10 rounded-md border border-stone-300 px-3"
                  bind:value={newTodoUrgency}
                  aria-label="Urgency"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
            </div>
            <button
              class="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"
              type="button"
              disabled={!todoControlsReady}
              onclick={createTodoTask}
            >
              <Check size={18} aria-hidden="true" />
              Add Todo Task
            </button>
          </div>

          <div class="grid gap-3 rounded-md border border-stone-200 p-3">
            <label class="grid gap-1">
              <span class="font-medium text-stone-800">New Todo Category</span>
              <input
                class="h-10 rounded-md border border-stone-300 px-3"
                bind:value={newCategoryName}
                aria-label="New Todo Category"
              />
            </label>
            <button
              class="inline-flex h-10 w-fit items-center gap-2 rounded-md border border-stone-300 px-4 text-sm font-semibold text-stone-800 hover:bg-stone-50"
              type="button"
              disabled={!todoControlsReady}
              onclick={createTodoCategory}
            >
              <Check size={18} aria-hidden="true" />
              Add Todo Category
            </button>
          </div>

          <div class="grid gap-4">
            <section class="grid gap-2">
              <h3 class="font-semibold text-stone-950">No Category</h3>
              <ul
                class="grid min-h-12 gap-2 rounded-md"
                aria-label="No Category Todo Tasks"
                use:dragHandleZone={{
                  items: tasksForCategory(null),
                  flipDurationMs: 150,
                  type: 'todo-task',
                  useCursorForDetection: true
                }}
                onconsider={(event) => handleTodoDrop(null, event)}
                onfinalize={(event) => handleTodoDrop(null, event, true)}
              >
                {#each tasksForCategory(null) as task (task.id)}
                  <li class="rounded-md border border-stone-200 px-3 py-2" aria-label={task.title}>
                    {#if editingTaskId === task.id}
                      <div class="grid gap-2">
                        <input
                          class="h-10 rounded-md border border-stone-300 px-3"
                          bind:value={editingTaskTitle}
                          aria-label="Edit Todo Task"
                        />
                        <select
                          class="h-10 rounded-md border border-stone-300 px-3"
                          bind:value={editingTaskUrgency}
                          aria-label="Edit Urgency"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                        <button
                          class="h-10 w-fit rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white"
                          type="button"
                          disabled={!todoControlsReady}
                          onclick={saveEditingTodoTask}
                        >
                          Save Todo Task
                        </button>
                      </div>
                    {:else}
                      <div class="flex flex-wrap items-center justify-between gap-3">
                        <div class="flex min-w-0 items-center gap-3">
                          <span
                            class="inline-flex size-9 cursor-grab items-center justify-center rounded-md border border-stone-200 text-stone-500 active:cursor-grabbing"
                            role="button"
                            tabindex="0"
                            aria-label={`Move ${task.title}`}
                            use:dragHandle
                          >
                            <GripVertical size={16} aria-hidden="true" />
                          </span>
                          <label class="flex min-w-0 items-center gap-3">
                            <input
                              type="checkbox"
                              aria-label={`Complete ${task.title}`}
                              onchange={() => completeTodoTask(task.id)}
                            />
                            <span class="break-words text-stone-950">{task.title}</span>
                            {#if urgencyMark(task.urgency)}
                              <span
                                class={`inline-flex size-6 items-center justify-center rounded-full text-sm font-bold ${task.urgency === 'high' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}
                                aria-label={urgencyLabel(task.urgency)}
                              >
                                {urgencyMark(task.urgency)}
                              </span>
                            {/if}
                          </label>
                        </div>
                        <button
                          class="inline-flex size-9 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-50"
                          type="button"
                          disabled={!todoControlsReady}
                          aria-label={`Edit ${task.title}`}
                          onclick={() => startEditingTodoTask(task)}
                        >
                          <Pencil size={16} aria-hidden="true" />
                        </button>
                      </div>
                    {/if}
                  </li>
                {/each}
              </ul>
            </section>

            {#each todoCategories as category (category.id)}
              <section class="grid gap-2">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  {#if editingCategoryId === category.id}
                    <div class="flex flex-wrap items-center gap-2">
                      <input
                        class="h-10 rounded-md border border-stone-300 px-3"
                        bind:value={editingCategoryName}
                        aria-label="Edit Todo Category"
                      />
                      <button
                        class="h-10 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white"
                        type="button"
                        disabled={!todoControlsReady}
                        onclick={saveEditingTodoCategory}
                      >
                        Save Todo Category
                      </button>
                    </div>
                  {:else}
                    <h3 class="font-semibold text-stone-950">{category.name}</h3>
                    <div class="flex items-center gap-2">
                      <button
                        class="inline-flex size-9 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-50"
                        type="button"
                        disabled={!todoControlsReady}
                        aria-label={`Rename ${category.name}`}
                        onclick={() => startEditingTodoCategory(category)}
                      >
                        <Pencil size={16} aria-hidden="true" />
                      </button>
                      <button
                        class="inline-flex size-9 items-center justify-center rounded-md border border-red-200 text-red-700 hover:bg-red-50"
                        type="button"
                        disabled={!todoControlsReady}
                        aria-label={`Delete ${category.name}`}
                        onclick={() => deleteTodoCategory(category)}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  {/if}
                </div>
                <ul
                  class="grid min-h-12 gap-2 rounded-md"
                  aria-label={`${category.name} Todo Tasks`}
                  use:dragHandleZone={{
                    items: tasksForCategory(category.id),
                    flipDurationMs: 150,
                    type: 'todo-task',
                    useCursorForDetection: true
                  }}
                  onconsider={(event) => handleTodoDrop(category.id, event)}
                  onfinalize={(event) => handleTodoDrop(category.id, event, true)}
                >
                  {#each tasksForCategory(category.id) as task (task.id)}
                    <li class="rounded-md border border-stone-200 px-3 py-2" aria-label={task.title}>
                      {#if editingTaskId === task.id}
                        <div class="grid gap-2">
                          <input
                            class="h-10 rounded-md border border-stone-300 px-3"
                            bind:value={editingTaskTitle}
                            aria-label="Edit Todo Task"
                          />
                          <select
                            class="h-10 rounded-md border border-stone-300 px-3"
                            bind:value={editingTaskUrgency}
                            aria-label="Edit Urgency"
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                          </select>
                          <button
                            class="h-10 w-fit rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white"
                            type="button"
                            disabled={!todoControlsReady}
                            onclick={saveEditingTodoTask}
                          >
                            Save Todo Task
                          </button>
                        </div>
                      {:else}
                        <div class="flex flex-wrap items-center justify-between gap-3">
                          <div class="flex min-w-0 items-center gap-3">
                            <span
                              class="inline-flex size-9 cursor-grab items-center justify-center rounded-md border border-stone-200 text-stone-500 active:cursor-grabbing"
                              role="button"
                              tabindex="0"
                              aria-label={`Move ${task.title}`}
                              use:dragHandle
                            >
                              <GripVertical size={16} aria-hidden="true" />
                            </span>
                            <label class="flex min-w-0 items-center gap-3">
                              <input
                                type="checkbox"
                                aria-label={`Complete ${task.title}`}
                                onchange={() => completeTodoTask(task.id)}
                              />
                              <span class="break-words text-stone-950">{task.title}</span>
                              {#if urgencyMark(task.urgency)}
                                <span
                                  class={`inline-flex size-6 items-center justify-center rounded-full text-sm font-bold ${task.urgency === 'high' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}
                                  aria-label={urgencyLabel(task.urgency)}
                                >
                                  {urgencyMark(task.urgency)}
                                </span>
                              {/if}
                            </label>
                          </div>
                          <button
                            class="inline-flex size-9 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-stone-50"
                            type="button"
                            disabled={!todoControlsReady}
                            aria-label={`Edit ${task.title}`}
                            onclick={() => startEditingTodoTask(task)}
                          >
                            <Pencil size={16} aria-hidden="true" />
                          </button>
                        </div>
                      {/if}
                    </li>
                  {/each}
                </ul>
              </section>
            {/each}
          </div>
        </div>
      </Panel>

      <Panel title="Daily Summary Preview" eyebrow="Preview">
        <div class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="font-medium text-stone-900">Next summary: {summaryTime} {userTimeZone}</p>
            <p class="rounded-md bg-stone-900 px-2 py-1 text-xs font-semibold text-white">
              {summaryTheme === 'dark' ? 'Dark preview' : 'Light preview'}
            </p>
          </div>
          <div class="overflow-hidden rounded-md border border-stone-200">
            {#key renderedSummaryHtml}
              {@html renderedSummaryHtml}
            {/key}
          </div>
          <button
            class="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"
            type="button"
            disabled={!canPreviewDailySummary(previewConfiguration)}
          >
            <Mail size={18} aria-hidden="true" />
            Preview Daily Summary
          </button>
        </div>
      </Panel>
    </section>

    <aside class="space-y-4">
      <Panel title="Local Save" eyebrow="Visitor">
        <p class="font-medium text-emerald-800">Saved in this browser only</p>
        <p class="mt-2">
          This Local Setup stays on this device. It does not create a User account or enable email
          delivery.
        </p>
      </Panel>
      <Panel title="Sending Status" eyebrow="Milestone 1">
        <p>
          Summary Delivery controls are available for setup, but no email can be sent until Google
          sign-in and delivery integrations are added later.
        </p>
      </Panel>
      <Panel title="Scope Guard" eyebrow="No integrations">
        <ul class="list-disc space-y-2 pl-5">
          <li>No Google sign-in</li>
          <li>No provider connections</li>
          <li>No scheduled worker</li>
        </ul>
      </Panel>
    </aside>
  </div>
</main>
