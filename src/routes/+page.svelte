<script lang="ts">
  import { CalendarDays, Check, CloudSun, GripVertical, Mail, MapPin, Pencil, Search, ShieldCheck, Trash2 } from '@lucide/svelte';
  import { dragHandle, dragHandleZone, SHADOW_ITEM_MARKER_PROPERTY_NAME, TRIGGERS } from 'svelte-dnd-action';
  import { onMount } from 'svelte';
  import type { ActionData, PageData } from './$types';
  import Panel from '$lib/components/Panel.svelte';
  import { calendarReadinessForAuthMode } from '$lib/calendarReadiness';
  import { buildDailySummaryInput } from '$lib/dailySummaryPreview';
  import type { DeliveryHistoryRecord, DeliveryStatus } from '$lib/deliveryRecords';
  import { buildDemoCalendarSection } from '$lib/demoCalendar';
  import { renderDailySummary } from '$lib/dailySummaryRenderer';
  import {
    createDefaultLocalSetup,
    loadLocalSetup,
    saveLocalSetup,
    type LocalSetup,
    type LocalSetupInput,
    type LocalSetupLoadOutcome,
    type LocalSetupSaveOutcome
  } from '$lib/localSetup';
  import {
    defaultSummaryConfiguration,
    canPreviewDailySummary,
    summaryConfigurationSchema,
    summaryTimeSchema,
    type SummaryConfiguration,
    type SummarySection,
    type SummaryTheme,
    type UserTimeZone
  } from '$lib/summaryConfiguration';
  import {
    addTodoCategory,
    addTodoTask,
    completeTodoTask as completeTodoTaskInModule,
    createDefaultTodoState,
    deleteTodoCategory as deleteTodoCategoryInModule,
    reorderTodoCategories as reorderTodoCategoriesInModule,
    reorderTodoTasks as reorderTodoTasksInModule,
    tasksForTodoCategory,
    todoStateSchema,
    updateTodoCategory,
    updateTodoTask,
    type TodoCategory,
    type TodoTask,
    type TodoUrgency
  } from '$lib/todo';
  import { weatherLocationSchema, type WeatherLocation } from '$lib/weatherLocation';
  import {
    commuteDayValues,
    commuteRouteDraftSchema,
    defaultCommuteDays,
    type CommuteDay,
    type CommutePoint,
    type CommuteRoute
  } from '$lib/commuteRoute';
  import type { SelectedCalendarConfiguration, SelectedCalendarOption } from '$lib/selectedCalendars';

  const visitorAuthState = { mode: 'visitor' } as const;
  let { data, form }: { data?: PageData; form?: ActionData } = $props();
  const authState = $derived(data?.authState ?? visitorAuthState);
  const calendarReadiness = $derived(
    data?.calendarReadiness ?? calendarReadinessForAuthMode(authState.mode)
  );
  const isAdministrator = $derived(data?.isAdministrator ?? false);

  const summarySections: Array<{ key: SummarySection; label: string }> = [
    { key: 'weather', label: 'Weather' },
    { key: 'commute', label: 'Commute' },
    { key: 'calendar', label: 'Calendar' },
    { key: 'todo', label: 'Todo' }
  ];
  const userTimeZones: UserTimeZone[] = ['Europe/Warsaw', 'America/New_York', 'UTC'];
  const initialSummaryConfiguration = summaryConfigurationSchema.parse(
    data?.summaryConfiguration ?? defaultSummaryConfiguration
  );
  const initialTodoState = todoStateSchema.parse(data?.todoState ?? createDefaultTodoState());
  const initialWeatherLocation = data?.weatherLocation
    ? weatherLocationSchema.parse(data.weatherLocation)
    : null;
  const initialCommuteSetup = data?.commuteSetup ?? {
    routes: [] as CommuteRoute[],
    days: [...defaultCommuteDays] as CommuteDay[]
  };
  const deliveryRecords = $derived<DeliveryHistoryRecord[]>(data?.deliveryRecords ?? []);
  const initialSelectedCalendarConfiguration = data?.selectedCalendarConfiguration ?? null;
  const testDeliveryStatus = $derived(
    form?.outcome === 'sent'
      ? {
          message: 'Test Daily Summary sent.',
          tone: 'success' as const
        }
      : form?.outcome === 'failed'
        ? {
            message: form.message,
            tone: 'error' as const
          }
        : form?.outcome === 'unauthorized'
          ? {
              message: 'Google sign-in is required before a test Daily Summary can be sent.',
              tone: 'warning' as const
            }
          : null
  );
  let summaryTime = $state(initialSummaryConfiguration.summaryTime);
  let summaryTimeInput = $state(initialSummaryConfiguration.summaryTime);
  let userTimeZone = $state<UserTimeZone>(initialSummaryConfiguration.userTimeZone);
  let summaryTheme = $state<SummaryTheme>(initialSummaryConfiguration.summaryTheme);
  let summaryDeliveryEnabled = $state(initialSummaryConfiguration.summaryDeliveryEnabled);
  let enabledSections = $state<Record<SummarySection, boolean>>({
    ...initialSummaryConfiguration.sections
  });
  let todoTasks = $state<TodoTask[]>(initialTodoState.todoTasks);
  let todoDragTaskLists = $state<Record<string, TodoTask[]>>({});
  let todoDragCategories = $state<TodoCategory[] | null>(null);
  let todoCategories = $state<TodoCategory[]>(initialTodoState.todoCategories);
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
  let localSetupStatus = $state('Not saved in this browser yet.');
  let localSetupStatusTone = $state<'success' | 'warning' | 'error' | 'neutral'>('neutral');
  let lastLocalSetupSnapshot: string | null = null;
  let hydratedLocalSetupSnapshot: string | null = null;
  let lastUserSummaryConfigurationSnapshot: string | null = JSON.stringify(initialSummaryConfiguration);
  let queuedUserSummaryConfigurationSnapshot: string | null = null;
  let userSummaryConfigurationSaveQueue = Promise.resolve();
  let userSummaryConfigurationStatus = $state('Saved to your account.');
  let userSummaryConfigurationStatusTone = $state<'success' | 'warning' | 'error' | 'neutral'>(
    'success'
  );
  let lastUserTodoStateSnapshot: string | null = JSON.stringify(initialTodoState);
  let queuedUserTodoStateSnapshot: string | null = null;
  let userTodoStateSaveQueue = Promise.resolve();
  let userTodoStateStatus = $state('Todo state saved to your account.');
  let userTodoStateStatusTone = $state<'success' | 'warning' | 'error' | 'neutral'>('success');
  let weatherLocation = $state<WeatherLocation | null>(initialWeatherLocation);
  let weatherLocationSearchQuery = $state('');
  let weatherLocationSearchResults = $state<WeatherLocation[]>([]);
  let weatherLocationStatus = $state(
    initialWeatherLocation ? 'Weather Location saved to your account.' : 'No Weather Location saved yet.'
  );
  let weatherLocationStatusTone = $state<'success' | 'warning' | 'error' | 'neutral'>(
    initialWeatherLocation ? 'success' : 'neutral'
  );
  let commuteRoutes = $state<CommuteRoute[]>(initialCommuteSetup.routes);
  let commuteDays = $state<CommuteDay[]>([...initialCommuteSetup.days]);
  let editingCommuteRouteId = $state<string | null>(null);
  let commuteRouteName = $state('');
  let commuteOriginLatitude = $state('52.2285');
  let commuteOriginLongitude = $state('21.0037');
  let commuteDestinationLatitude = $state('52.2318');
  let commuteDestinationLongitude = $state('21.0067');
  let commuteOrigin = $state<CommutePoint | null>(null);
  let commuteDestination = $state<CommutePoint | null>(null);
  let commuteRouteStatus = $state('Select an Origin and Destination to create a Commute Route.');
  let commuteRouteStatusTone = $state<'success' | 'warning' | 'error' | 'neutral'>('neutral');
  let selectedCalendarConfiguration = $state<SelectedCalendarConfiguration | null>(
    initialSelectedCalendarConfiguration
  );
  let selectedCalendarStatus = $state(
    initialSelectedCalendarConfiguration ? 'Selected Calendars saved to your account.' : 'No Calendar list loaded.'
  );
  let selectedCalendarStatusTone = $state<'success' | 'warning' | 'error' | 'neutral'>(
    initialSelectedCalendarConfiguration ? 'success' : 'neutral'
  );
  let localSetupImportStatus = $state('No browser Local Setup was imported.');
  let localSetupImportStatusTone = $state<'success' | 'warning' | 'error' | 'neutral'>('neutral');
  let nextTodoId = initialTodoState.nextTodoId;

  onMount(() => {
    if (authState.mode === 'user') {
      if (new URL(globalThis.location.href).searchParams.get('localSetupImport') === '1') {
        void importVisitorLocalSetupAfterSignIn();
        return;
      }

      localSetupHydrated = true;
      todoControlsReady = true;
      return;
    }

    const loadOutcome = restoreVisitorLocalSetup();
    const restoredSetup = currentLocalSetup();
    hydratedLocalSetupSnapshot = localSetupSnapshot(restoredSetup);

    if (loadOutcome === 'loaded') {
      lastLocalSetupSnapshot = hydratedLocalSetupSnapshot;
    }

    if (loadOutcome === 'empty') {
      const saveOutcome = persistVisitorLocalSetup(restoredSetup);

      if (saveOutcome === 'saved') {
        lastLocalSetupSnapshot = hydratedLocalSetupSnapshot;
      }
    }

    localSetupHydrated = true;
    todoControlsReady = true;
  });

  const currentSummaryTime = () => {
    const result = summaryTimeSchema.safeParse(summaryTimeInput);

    return result.success ? result.data : summaryTime;
  };

  const currentSummaryConfiguration = (): SummaryConfiguration => ({
    summaryTime: currentSummaryTime(),
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
  const browserLocalSetupStorage = () => ({
    getItem: (key: string) => globalThis.localStorage.getItem(key),
    setItem: (key: string, value: string) => {
      globalThis.localStorage.setItem(key, value);
    }
  });
  const localSetupLoadStatus = (outcome: LocalSetupLoadOutcome) => {
    if (outcome === 'loaded') {
      return {
        message: 'Restored from this browser. Saved in this browser only',
        tone: 'success' as const
      };
    }

    if (outcome === 'empty') {
      return {
        message: 'Not saved in this browser yet.',
        tone: 'neutral' as const
      };
    }

    if (outcome === 'read-failed') {
      return {
        message: 'Browser storage is unavailable. Changes are not saved.',
        tone: 'error' as const
      };
    }

    return {
      message: 'Invalid browser data was ignored. Defaults are active.',
      tone: 'warning' as const
    };
  };
  const localSetupSaveStatus = (outcome: LocalSetupSaveOutcome) =>
    outcome === 'saved'
      ? {
          message: 'Saved in this browser only',
          tone: 'success' as const
        }
      : {
          message: 'Browser storage is unavailable. Changes are not saved.',
          tone: 'error' as const
        };
  const applyLocalSetup = (setup: LocalSetup) => {
    updateSummaryConfiguration(setup.summaryConfiguration);
    weatherLocation = setup.weatherLocation;
    commuteRoutes = setup.commuteRoutes;
    commuteDays = setup.commuteDays;
    editingCommuteRouteId = null;
    commuteRouteName = '';
    commuteOrigin = null;
    commuteDestination = null;
    commuteOriginLatitude = '52.2285';
    commuteOriginLongitude = '21.0037';
    commuteDestinationLatitude = '52.2318';
    commuteDestinationLongitude = '21.0067';
    weatherLocationSearchQuery = setup.weatherLocation?.label ?? '';
    weatherLocationStatus = setup.weatherLocation
      ? 'Weather Location saved in this browser only.'
      : 'No Weather Location saved yet.';
    weatherLocationStatusTone = setup.weatherLocation ? 'success' : 'neutral';
    todoCategories = setup.todoCategories;
    todoTasks = setup.todoTasks;
    nextTodoId = setup.nextTodoId;
  };
  const currentLocalSetup = (): LocalSetupInput => ({
    ...createDefaultLocalSetup(),
    summaryConfiguration: currentSummaryConfiguration(),
    weatherLocation,
    commuteRoutes,
    commuteDays,
    todoCategories,
    todoTasks,
    nextTodoId
  });
  const currentTodoState = () => ({
    todoCategories,
    todoTasks,
    nextTodoId
  });
  const localSetupSnapshot = (setup: LocalSetupInput) => JSON.stringify(setup);
  const restoreVisitorLocalSetup = () => {
    const result = loadLocalSetup(browserLocalSetupStorage());

    applyLocalSetup(result.setup);
    const status = localSetupLoadStatus(result.outcome);
    localSetupStatus = status.message;
    localSetupStatusTone = status.tone;

    return result.outcome;
  };
  const persistVisitorLocalSetup = (setup: LocalSetupInput) => {
    const result = saveLocalSetup(browserLocalSetupStorage(), setup);

    const status = localSetupSaveStatus(result.outcome);
    localSetupStatus = status.message;
    localSetupStatusTone = status.tone;

    return result.outcome;
  };
  const localSetupImportMessage = (outcome: string) => {
    if (outcome === 'imported') {
      return {
        message: 'Imported Local Setup from this browser.',
        tone: 'success' as const
      };
    }

    if (outcome === 'skipped-existing-setup') {
      return {
        message: 'Saved User setup kept. Browser Local Setup was not imported.',
        tone: 'success' as const
      };
    }

    if (outcome === 'invalid-local-setup' || outcome === 'invalid-draft') {
      return {
        message: 'Browser Local Setup could not be imported. Saved User setup is unchanged.',
        tone: 'warning' as const
      };
    }

    if (outcome === 'empty') {
      return {
        message: 'No browser Local Setup was found for import.',
        tone: 'neutral' as const
      };
    }

    if (outcome === 'unsupported-version' || outcome === 'schema-invalid' || outcome === 'invalid-json') {
      return {
        message: 'Invalid browser Local Setup was ignored. Saved User setup is unchanged.',
        tone: 'warning' as const
      };
    }

    if (outcome === 'read-failed' || outcome === 'import-failed') {
      return {
        message: 'Browser Local Setup import is unavailable. Saved User setup is unchanged.',
        tone: 'error' as const
      };
    }

    return {
      message: 'Browser Local Setup was not imported. Saved User setup is unchanged.',
      tone: 'neutral' as const
    };
  };
  const updateLocalSetupImportStatus = (outcome: string) => {
    const status = localSetupImportMessage(outcome);
    localSetupImportStatus = status.message;
    localSetupImportStatusTone = status.tone;
  };
  const removeLocalSetupImportUrlFlag = () => {
    const url = new URL(globalThis.location.href);
    url.searchParams.delete('localSetupImport');
    globalThis.history.replaceState(globalThis.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  };
  const markCurrentUserStateSaved = () => {
    const configuration = currentSummaryConfiguration();
    const todoState = currentTodoState();

    lastUserSummaryConfigurationSnapshot = JSON.stringify(configuration);
    lastUserTodoStateSnapshot = JSON.stringify(todoState);
  };
  const importVisitorLocalSetupAfterSignIn = async () => {
    const result = loadLocalSetup(browserLocalSetupStorage());

    if (result.outcome !== 'loaded') {
      updateLocalSetupImportStatus(result.outcome);
      localSetupHydrated = true;
      todoControlsReady = true;
      removeLocalSetupImportUrlFlag();
      return;
    }

    try {
      const response = await fetch('/local-setup-import', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(result.setup)
      });
      const importResult = (await response.json()) as { outcome?: string };
      const outcome = importResult.outcome ?? 'import-failed';

      updateLocalSetupImportStatus(outcome);

      if (response.ok && outcome === 'imported') {
        applyLocalSetup(result.setup);
      }
    } catch {
      updateLocalSetupImportStatus('import-failed');
    }

    markCurrentUserStateSaved();
    localSetupHydrated = true;
    todoControlsReady = true;
    removeLocalSetupImportUrlFlag();
  };
  const persistUserSummaryConfiguration = async (configuration: SummaryConfiguration) => {
    try {
      const response = await fetch('/summary-configuration', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(configuration)
      });

      if (!response.ok) {
        userSummaryConfigurationStatus = 'Account save failed. Try again.';
        userSummaryConfigurationStatusTone = response.status === 400 ? 'warning' : 'error';
        return false;
      }

      userSummaryConfigurationStatus = 'Saved to your account.';
      userSummaryConfigurationStatusTone = 'success';
      return true;
    } catch {
      userSummaryConfigurationStatus = 'Account save failed. Try again.';
      userSummaryConfigurationStatusTone = 'error';
      return false;
    }
  };
  const persistUserTodoState = async (todoState: ReturnType<typeof currentTodoState>) => {
    try {
      const response = await fetch('/todo-state', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(todoState)
      });

      if (!response.ok) {
        userTodoStateStatus = 'Todo save failed. Try again.';
        userTodoStateStatusTone = response.status === 400 ? 'warning' : 'error';
        return false;
      }

      userTodoStateStatus = 'Todo state saved to your account.';
      userTodoStateStatusTone = 'success';
      return true;
    } catch {
      userTodoStateStatus = 'Todo save failed. Try again.';
      userTodoStateStatusTone = 'error';
      return false;
    }
  };
  const searchWeatherLocation = async () => {
    const searchInput = globalThis.document?.getElementById('weather-location-search');
    const currentSearchQuery =
      searchInput instanceof HTMLInputElement ? searchInput.value : weatherLocationSearchQuery;
    weatherLocationSearchQuery = currentSearchQuery;
    weatherLocationStatus = 'Searching Weather Locations...';
    weatherLocationStatusTone = 'neutral';

    try {
      const response = await fetch(
        `/weather-location-search?q=${encodeURIComponent(currentSearchQuery)}`
      );
      const result = (await response.json()) as {
        outcome?: string;
        locations?: WeatherLocation[];
        reason?: string;
      };

      if (result.outcome === 'unavailable') {
        weatherLocationSearchResults = [];
        weatherLocationStatus = result.reason ?? 'Weather Location search is unavailable right now.';
        weatherLocationStatusTone = 'error';
        return;
      }

      if (!response.ok || result.outcome !== 'found') {
        weatherLocationSearchResults = [];
        weatherLocationStatus = 'Enter a valid city search.';
        weatherLocationStatusTone = 'warning';
        return;
      }

      weatherLocationSearchResults = result.locations ?? [];
      weatherLocationStatus =
        weatherLocationSearchResults.length > 0
          ? 'Choose a Weather Location result.'
          : 'No matching Weather Locations found.';
      weatherLocationStatusTone = weatherLocationSearchResults.length > 0 ? 'neutral' : 'warning';
    } catch {
      weatherLocationSearchResults = [];
      weatherLocationStatus = 'Weather Location search failed. Try again.';
      weatherLocationStatusTone = 'error';
    }
  };
  const saveWeatherLocation = async (location: WeatherLocation) => {
    if (authState.mode !== 'user') {
      weatherLocation = location;
      weatherLocationSearchResults = [];
      weatherLocationSearchQuery = location.label;
      weatherLocationStatus = 'Weather Location saved in this browser only.';
      weatherLocationStatusTone = 'success';
      return;
    }

    weatherLocationStatus = 'Saving Weather Location...';
    weatherLocationStatusTone = 'neutral';

    try {
      const response = await fetch('/weather-location', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(location)
      });

      if (!response.ok) {
        weatherLocationStatus = 'Weather Location save failed. Try again.';
        weatherLocationStatusTone = response.status === 400 ? 'warning' : 'error';
        return;
      }

      weatherLocation = location;
      weatherLocationSearchResults = [];
      weatherLocationSearchQuery = location.label;
      weatherLocationStatus = 'Weather Location saved to your account.';
      weatherLocationStatusTone = 'success';
    } catch {
      weatherLocationStatus = 'Weather Location save failed. Try again.';
      weatherLocationStatusTone = 'error';
    }
  };
  const selectCommutePoint = async (kind: 'origin' | 'destination') => {
    const latitude = Number(kind === 'origin' ? commuteOriginLatitude : commuteDestinationLatitude);
    const longitude = Number(kind === 'origin' ? commuteOriginLongitude : commuteDestinationLongitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      commuteRouteStatus = 'Enter valid latitude and longitude values.';
      commuteRouteStatusTone = 'warning';
      return;
    }

    commuteRouteStatus = `Selecting Commute ${kind === 'origin' ? 'Origin' : 'Destination'}...`;
    commuteRouteStatusTone = 'neutral';
    try {
      const response = await fetch('/commute-point-selection', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ latitude, longitude })
      });
      const result = (await response.json()) as { outcome?: string; point?: CommutePoint; reason?: string };
      if (!response.ok || result.outcome !== 'available' || !result.point) {
        commuteRouteStatus = `Commute point selection is unavailable${result.reason ? ` (${result.reason})` : ''}.`;
        commuteRouteStatusTone = 'error';
        return;
      }
      if (kind === 'origin') commuteOrigin = result.point;
      else commuteDestination = result.point;
      commuteRouteStatus = `Commute ${kind === 'origin' ? 'Origin' : 'Destination'} selected.`;
      commuteRouteStatusTone = 'success';
    } catch {
      commuteRouteStatus = 'Commute point selection is unavailable right now.';
      commuteRouteStatusTone = 'error';
    }
  };
  const clearCommuteRouteDraft = () => {
    editingCommuteRouteId = null;
    commuteRouteName = '';
    commuteOrigin = null;
    commuteDestination = null;
    commuteOriginLatitude = '52.2285';
    commuteOriginLongitude = '21.0037';
    commuteDestinationLatitude = '52.2318';
    commuteDestinationLongitude = '21.0067';
  };
  const saveCommuteRoute = () => {
    if (!editingCommuteRouteId && commuteRoutes.length >= 5) {
      commuteRouteStatus = 'You can save at most five Commute Routes.';
      commuteRouteStatusTone = 'warning';
      return;
    }
    const result = commuteRouteDraftSchema.safeParse({
      name: commuteRouteName,
      origin: commuteOrigin,
      destination: commuteDestination
    });
    if (!result.success) {
      commuteRouteStatus = 'Provide a valid route name, Origin, and Destination before saving.';
      commuteRouteStatusTone = 'warning';
      return;
    }
    if (editingCommuteRouteId) {
      if (authState.mode === 'user') {
        void saveUserCommuteRoute(editingCommuteRouteId, { ...result.data, enabled: commuteRoutes.find((route) => route.id === editingCommuteRouteId)?.enabled ?? true });
        return;
      }
      commuteRoutes = commuteRoutes.map((route) => route.id === editingCommuteRouteId ? { ...route, ...result.data } : route);
      clearCommuteRouteDraft();
      commuteRouteStatus = 'Commute Route updated in this browser only.';
      commuteRouteStatusTone = 'success';
      return;
    }
    const id = `route-${commuteRoutes.reduce((highest, route) => {
      const number = Number(route.id.replace(/^route-/, ''));
      return Number.isInteger(number) ? Math.max(highest, number) : highest;
    }, 0) + 1}`;
    if (authState.mode === 'user') {
      void createUserCommuteRoute(result.data);
      return;
    }
    commuteRoutes = [...commuteRoutes, { ...result.data, id, enabled: true }];
    clearCommuteRouteDraft();
    commuteRouteStatus = 'Commute Route saved in this browser only.';
    commuteRouteStatusTone = 'success';
  };
  const editCommuteRoute = (route: CommuteRoute) => {
    editingCommuteRouteId = route.id;
    commuteRouteName = route.name;
    commuteOrigin = route.origin;
    commuteDestination = route.destination;
    commuteOriginLatitude = route.origin.latitude.toString();
    commuteOriginLongitude = route.origin.longitude.toString();
    commuteDestinationLatitude = route.destination.latitude.toString();
    commuteDestinationLongitude = route.destination.longitude.toString();
    commuteRouteStatus = `Editing route: ${route.name}.`;
    commuteRouteStatusTone = 'neutral';
  };
  const deleteCommuteRoute = (route: CommuteRoute) => {
    if (authState.mode === 'user') {
      void deleteUserCommuteRoute(route);
      return;
    }
    commuteRoutes = commuteRoutes.filter((candidate) => candidate.id !== route.id);
    if (editingCommuteRouteId === route.id) clearCommuteRouteDraft();
    commuteRouteStatus = 'Commute Route deleted from this browser.';
    commuteRouteStatusTone = 'success';
  };
  const toggleCommuteRoute = (route: CommuteRoute) => {
    if (authState.mode === 'user') {
      void saveUserCommuteRoute(route.id, { ...route, enabled: !route.enabled });
      return;
    }
    commuteRoutes = commuteRoutes.map((candidate) =>
      candidate.id === route.id ? { ...candidate, enabled: !candidate.enabled } : candidate
    );
  };
  const toggleCommuteDay = (day: CommuteDay, checked: boolean) => {
    const nextDays = checked
      ? commuteDayValues.filter((candidate) => candidate === day || commuteDays.includes(candidate))
      : commuteDays.filter((candidate) => candidate !== day);
    if (authState.mode === 'user') {
      void saveUserCommuteDays(nextDays);
      return;
    }
    commuteDays = nextDays;
  };
  const createUserCommuteRoute = async (draft: Omit<CommuteRoute, 'id' | 'enabled'>) => {
    commuteRouteStatus = 'Saving Commute Route to your account...';
    commuteRouteStatusTone = 'neutral';
    try {
      const response = await fetch('/commute-routes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft) });
      const result = (await response.json()) as { outcome?: string; route?: CommuteRoute };
      if (response.ok && result.outcome === 'created' && result.route) {
        commuteRoutes = [...commuteRoutes, result.route];
        clearCommuteRouteDraft();
        commuteRouteStatus = 'Commute Route saved to your account.';
        commuteRouteStatusTone = 'success';
        return;
      }
      commuteRouteStatus = result.outcome === 'route-limit-reached' ? 'You can save at most five Commute Routes.' : 'Commute Route save failed. Try again.';
      commuteRouteStatusTone = response.status === 400 || response.status === 409 ? 'warning' : 'error';
    } catch {
      commuteRouteStatus = 'Commute Route save failed. Try again.';
      commuteRouteStatusTone = 'error';
    }
  };
  const saveUserCommuteRoute = async (routeId: string, route: Omit<CommuteRoute, 'id'>) => {
    commuteRouteStatus = 'Saving Commute Route to your account...';
    commuteRouteStatusTone = 'neutral';
    try {
      const response = await fetch(`/commute-routes/${encodeURIComponent(routeId)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(route) });
      const result = (await response.json()) as { outcome?: string; route?: CommuteRoute };
      if (response.ok && result.outcome === 'updated' && result.route) {
        commuteRoutes = commuteRoutes.map((candidate) => candidate.id === routeId ? result.route! : candidate);
        clearCommuteRouteDraft();
        commuteRouteStatus = 'Commute Route saved to your account.';
        commuteRouteStatusTone = 'success';
        return;
      }
      commuteRouteStatus = result.outcome === 'not-found' ? 'Commute Route is no longer available.' : 'Commute Route save failed. Try again.';
      commuteRouteStatusTone = response.status === 400 || response.status === 404 ? 'warning' : 'error';
    } catch {
      commuteRouteStatus = 'Commute Route save failed. Try again.';
      commuteRouteStatusTone = 'error';
    }
  };
  const deleteUserCommuteRoute = async (route: CommuteRoute) => {
    commuteRouteStatus = 'Deleting Commute Route from your account...';
    commuteRouteStatusTone = 'neutral';
    try {
      const response = await fetch(`/commute-routes/${encodeURIComponent(route.id)}`, { method: 'DELETE' });
      if (response.ok) {
        commuteRoutes = commuteRoutes.filter((candidate) => candidate.id !== route.id);
        if (editingCommuteRouteId === route.id) clearCommuteRouteDraft();
        commuteRouteStatus = 'Commute Route deleted from your account.';
        commuteRouteStatusTone = 'success';
        return;
      }
      commuteRouteStatus = 'Commute Route delete failed. Try again.';
      commuteRouteStatusTone = response.status === 404 ? 'warning' : 'error';
    } catch {
      commuteRouteStatus = 'Commute Route delete failed. Try again.';
      commuteRouteStatusTone = 'error';
    }
  };
  const saveUserCommuteDays = async (days: CommuteDay[]) => {
    commuteRouteStatus = 'Saving Commute Days to your account...';
    commuteRouteStatusTone = 'neutral';
    try {
      const response = await fetch('/commute-days', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(days) });
      if (response.ok) {
        commuteDays = days;
        commuteRouteStatus = 'Commute Days saved to your account.';
        commuteRouteStatusTone = 'success';
        return;
      }
      commuteRouteStatus = 'Commute Days save failed. Try again.';
      commuteRouteStatusTone = response.status === 400 ? 'warning' : 'error';
    } catch {
      commuteRouteStatus = 'Commute Days save failed. Try again.';
      commuteRouteStatusTone = 'error';
    }
  };
  const persistSelectedCalendars = async (calendars: SelectedCalendarOption[]) => {
    selectedCalendarStatus = 'Saving Selected Calendars...';
    selectedCalendarStatusTone = 'neutral';

    try {
      const response = await fetch('/selected-calendars', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(
          calendars.filter((calendar) => calendar.selected).map((calendar) => calendar.id)
        )
      });

      if (!response.ok) {
        selectedCalendarStatus = 'Selected Calendar save failed. Try again.';
        selectedCalendarStatusTone = response.status === 400 ? 'warning' : 'error';
        return false;
      }

      selectedCalendarStatus = 'Selected Calendars saved to your account.';
      selectedCalendarStatusTone = 'success';
      return true;
    } catch {
      selectedCalendarStatus = 'Selected Calendar save failed. Try again.';
      selectedCalendarStatusTone = 'error';
      return false;
    }
  };
  const toggleSelectedCalendar = async (calendarId: string, selected: boolean) => {
    if (!selectedCalendarConfiguration) {
      return;
    }

    const nextCalendars = selectedCalendarConfiguration.calendars.map((calendar) =>
      calendar.id === calendarId ? { ...calendar, selected } : calendar
    );
    const previousConfiguration = selectedCalendarConfiguration;

    selectedCalendarConfiguration = {
      calendars: nextCalendars,
      selectedCalendarIds: nextCalendars
        .filter((calendar) => calendar.selected)
        .map((calendar) => calendar.id)
    };

    const saved = await persistSelectedCalendars(nextCalendars);

    if (!saved) {
      selectedCalendarConfiguration = previousConfiguration;
    }
  };
  const queueUserSummaryConfigurationSave = (configuration: SummaryConfiguration, snapshot: string) => {
    queuedUserSummaryConfigurationSnapshot = snapshot;
    userSummaryConfigurationStatus = 'Saving to your account...';
    userSummaryConfigurationStatusTone = 'neutral';

    userSummaryConfigurationSaveQueue = userSummaryConfigurationSaveQueue.then(async () => {
      const saved = await persistUserSummaryConfiguration(configuration);

      if (saved) {
        lastUserSummaryConfigurationSnapshot = snapshot;
      }

      if (queuedUserSummaryConfigurationSnapshot === snapshot) {
        queuedUserSummaryConfigurationSnapshot = null;
      }
    });

    void userSummaryConfigurationSaveQueue;
  };
  const queueUserTodoStateSave = (todoState: ReturnType<typeof currentTodoState>, snapshot: string) => {
    queuedUserTodoStateSnapshot = snapshot;
    userTodoStateStatus = 'Saving Todo state to your account...';
    userTodoStateStatusTone = 'neutral';

    userTodoStateSaveQueue = userTodoStateSaveQueue.then(async () => {
      const saved = await persistUserTodoState(todoState);

      if (saved) {
        lastUserTodoStateSnapshot = snapshot;
      }

      if (queuedUserTodoStateSnapshot === snapshot) {
        queuedUserTodoStateSnapshot = null;
      }
    });

    void userTodoStateSaveQueue;
  };
  const urgencyLabel = (urgency: TodoUrgency) =>
    urgency === 'high' ? 'High urgency' : urgency === 'medium' ? 'Medium urgency' : 'Low urgency';
  const urgencyMark = (urgency: TodoUrgency) =>
    urgency === 'high' ? '!' : urgency === 'medium' ? '!' : '';
  const deliveryAttemptLabel = (attemptType: DeliveryHistoryRecord['attemptType']) =>
    attemptType === 'scheduled' ? 'Scheduled' : 'Test';
  const deliveryStatusPresentation = {
    processing: { label: 'Processing', classes: 'bg-sky-100 text-sky-800' },
    retrying: { label: 'Retrying', classes: 'bg-amber-100 text-amber-800' },
    sent: { label: 'Sent', classes: 'bg-emerald-100 text-emerald-800' },
    failed: { label: 'Failed', classes: 'bg-red-100 text-red-700' }
  } satisfies Record<DeliveryStatus, { label: string; classes: string }>;
  const deliveryTimeLabel = (timestamp: string | null) =>
    timestamp
      ? new Intl.DateTimeFormat(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short'
        }).format(new Date(timestamp))
      : 'Not completed';
  const todoDragListKey = (categoryId: string | null) => categoryId ?? '__uncategorized__';
  const visibleTodoCategories = () =>
    todoDragCategories ??
    todoCategories.toSorted((first, second) => first.position - second.position);
  const tasksForCategory = (categoryId: string | null) => tasksForTodoCategory(todoTasks, categoryId);
  const visibleTasksForCategory = (categoryId: string | null) =>
    todoDragTaskLists[todoDragListKey(categoryId)] ?? tasksForCategory(categoryId);
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
  const reorderTodoCategories = (orderedCategories: TodoCategory[]) => {
    todoCategories = reorderTodoCategoriesInModule(
      todoCategories,
      orderedCategories.map((category) => category.id)
    );
  };
  const handleTodoCategoryConsider = (
    event: CustomEvent<{ items: TodoCategory[]; info?: { trigger?: string } }>
  ) => {
    if (event.detail.info?.trigger === TRIGGERS.DRAG_STOPPED) {
      reorderTodoCategories(event.detail.items);
      todoDragCategories = null;
      return;
    }

    todoDragCategories = event.detail.items;
  };
  const handleTodoCategoryFinalize = (
    event: CustomEvent<{ items: TodoCategory[]; info?: { trigger?: string } }>
  ) => {
    reorderTodoCategories(event.detail.items);
    todoDragCategories = null;
  };
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
  const handleTodoConsider = (
    categoryId: string | null,
    event: CustomEvent<{ items: TodoTask[]; info?: { id?: string; trigger?: string } }>
  ) => {
    if (event.detail.info?.trigger === TRIGGERS.DRAG_STOPPED) {
      reorderTodoTasks(categoryId, event.detail.items, event.detail.info?.id);
      todoDragTaskLists = {};
      return;
    }

    todoDragTaskLists = {
      ...todoDragTaskLists,
      [todoDragListKey(categoryId)]: event.detail.items
    };
  };
  const handleTodoFinalize = (
    categoryId: string | null,
    event: CustomEvent<{ items: TodoTask[]; info?: { id?: string; trigger?: string } }>,
    detachMissingTasks = false
  ) => {
    reorderTodoTasks(categoryId, event.detail.items, event.detail.info?.id, detachMissingTasks);
    todoDragTaskLists = {};
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
  let previewRenderVersion = 0;

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
    if (authState.mode === 'user') {
      renderedSummaryHtml = data?.renderedSummaryHtml ?? '';
      return;
    }

    const renderVersion = ++previewRenderVersion;

    void buildDailySummaryInput({
      calendarReadiness,
      configuration: previewConfiguration,
      todoCategories,
      todoTasks,
      weatherLocation,
      commuteRoutes,
      commuteDays,
      commuteEstimateProvider: {
        async estimateCommute(request) {
          const response = await fetch('/commute-estimate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(request)
          });
          if (!response.ok) {
            return { outcome: 'unavailable', reason: 'provider-unavailable' };
          }

          const result = await response.json();
          return result?.outcome === 'available' || result?.outcome === 'unavailable'
            ? result
            : { outcome: 'unavailable', reason: 'provider-unavailable' };
        }
      }
    }).then((previewInput) => {
      if (renderVersion === previewRenderVersion) {
        renderedSummaryHtml = renderDailySummary(previewInput).html;
      }
    });
  });

  $effect(() => {
    if (authState.mode === 'user') {
      return;
    }

    const setup = currentLocalSetup();
    const snapshot = localSetupSnapshot(setup);

    if (!localSetupHydrated || snapshot === lastLocalSetupSnapshot || snapshot === hydratedLocalSetupSnapshot) {
      return;
    }

    const saveOutcome = persistVisitorLocalSetup(setup);

    if (saveOutcome === 'saved') {
      lastLocalSetupSnapshot = snapshot;
    }
  });

  $effect(() => {
    if (authState.mode !== 'user' || !localSetupHydrated) {
      return;
    }

    const configuration = currentSummaryConfiguration();
    const snapshot = JSON.stringify(configuration);

    if (snapshot === lastUserSummaryConfigurationSnapshot || snapshot === queuedUserSummaryConfigurationSnapshot) {
      return;
    }

    queueUserSummaryConfigurationSave(configuration, snapshot);
  });

  $effect(() => {
    if (authState.mode !== 'user' || !localSetupHydrated) {
      return;
    }

    const todoState = currentTodoState();
    const snapshot = JSON.stringify(todoState);

    if (snapshot === lastUserTodoStateSnapshot || snapshot === queuedUserTodoStateSnapshot) {
      return;
    }

    queueUserTodoStateSave(todoState, snapshot);
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
            <p class="text-sm font-semibold text-emerald-700">
              {authState.mode === 'user' ? 'User mode' : 'Visitor mode'}
            </p>
            <h1 class="mt-2 text-3xl font-semibold text-stone-950">Daily</h1>
            <p class="mt-3 max-w-2xl text-base text-stone-700">
              {#if authState.mode === 'user'}
                Your Daily Summary is connected to a durable account.
              {:else}
                Shape a Local Setup for a future Daily Summary. Google sign-in will be required before
                a Daily Summary can be sent.
              {/if}
            </p>
            {#if authState.mode === 'user'}
              <p class="mt-2 text-sm font-medium text-stone-700">
                Summary Recipient: {authState.summaryRecipient}
              </p>
            {:else}
              <p class="mt-2 text-sm font-medium text-stone-700">
                Local Setup is saved in this browser only.
              </p>
            {/if}
          </div>
          <div class="flex flex-wrap items-center gap-2">
            {#if authState.mode === 'user'}
              <form method="POST" action="/auth/sign-out">
                <button
                  class="inline-flex h-10 items-center gap-2 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-800 hover:bg-stone-50"
                  type="submit"
                >
                  Sign out
                </button>
              </form>
            {:else}
              <a
                class="inline-flex h-10 items-center gap-2 rounded-md border border-emerald-700 bg-emerald-700 px-3 text-sm font-medium text-white hover:bg-emerald-800"
                href="/auth/google"
              >
                <Mail size={18} aria-hidden="true" />
                Sign in with Google
              </a>
            {/if}
            {#if isAdministrator}
              <a
                class="inline-flex h-10 items-center gap-2 rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-800 hover:bg-stone-50"
                href="/admin"
              >
                <ShieldCheck size={18} aria-hidden="true" />
                Admin Panel
              </a>
            {/if}
          </div>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <Panel
          title="Summary Configuration"
          eyebrow={authState.mode === 'user' ? 'User Setup' : 'Local Setup'}
        >
          <div class="grid gap-3">
            <label class="grid gap-1">
              <span class="font-medium text-stone-800" id="summary-time-label">Summary Time</span>
              <input
                aria-labelledby="summary-time-label"
                class="h-10 rounded-md border border-stone-300 px-3"
                type="text"
                inputmode="numeric"
                pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                disabled={!localSetupHydrated}
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
                      disabled={!localSetupHydrated}
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
                    disabled={!localSetupHydrated}
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
                    disabled={!localSetupHydrated}
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
                disabled={!localSetupHydrated}
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
              <div class="rounded-md border border-stone-200 px-3 py-2">
                <label
                  class="flex items-center justify-between gap-3"
                  for={`${section.key}-section`}
                >
                  <span>{section.label} Section</span>
                  <input
                    id={`${section.key}-section`}
                    type="checkbox"
                    bind:checked={enabledSections[section.key]}
                    disabled={!localSetupHydrated}
                    onchange={(event) => {
                      toggleSection(section.key, readInputChecked(event));
                    }}
                  />
                </label>
                {#if section.key === 'calendar' && calendarReadiness.status !== 'demo'}
                  <p class="mt-2 text-sm font-medium text-amber-800">
                    {calendarReadiness.statusLabel}
                  </p>
                  <p class="mt-1 text-sm text-stone-600">
                    {calendarReadiness.detail}
                  </p>
                {/if}
              </div>
            {/each}
          </div>
        </Panel>
      </div>

      {#if enabledSections.weather}
        <Panel
          title="Weather Location"
          eyebrow={authState.mode === 'user' ? 'User Setup' : 'Local Setup'}
        >
          <div class="space-y-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="font-medium text-stone-900">
                  {weatherLocation?.label ?? 'No Weather Location selected'}
                </p>
                {#if weatherLocation}
                  <p class="mt-1 text-sm text-stone-600">
                    {weatherLocation.latitude.toFixed(4)}, {weatherLocation.longitude.toFixed(4)}
                  </p>
                {/if}
              </div>
              <CloudSun size={22} class="text-emerald-700" aria-hidden="true" />
            </div>

            <div class="grid gap-2 sm:grid-cols-[1fr_auto]">
              <label class="grid gap-1">
                <span class="font-medium text-stone-800">City Search</span>
                <input
                  class="h-10 rounded-md border border-stone-300 px-3"
                  bind:value={weatherLocationSearchQuery}
                  id="weather-location-search"
                  aria-label="City Search"
                  placeholder="Search city"
                  disabled={!localSetupHydrated}
                  oninput={(event) => {
                    weatherLocationSearchQuery = readInputValue(event);
                  }}
                  onkeydown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void searchWeatherLocation();
                    }
                  }}
                />
              </label>
              <button
                class="inline-flex h-10 items-center justify-center gap-2 self-end rounded-md border border-stone-300 px-4 text-sm font-semibold text-stone-800 hover:bg-stone-50"
                type="button"
                disabled={!localSetupHydrated}
                onclick={searchWeatherLocation}
              >
                <Search size={18} aria-hidden="true" />
                Search
              </button>
            </div>

            {#if weatherLocationSearchResults.length > 0}
              <ul class="grid gap-2" aria-label="Weather Location search results">
                {#each weatherLocationSearchResults as result}
                  <li class="rounded-md border border-stone-200 px-3 py-2">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                      <div class="min-w-0">
                        <p class="break-words font-medium text-stone-950">{result.label}</p>
                        <p class="mt-1 text-sm text-stone-600">
                          {result.latitude.toFixed(4)}, {result.longitude.toFixed(4)}
                        </p>
                      </div>
                      <button
                        class="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800"
                        type="button"
                        onclick={() => saveWeatherLocation(result)}
                      >
                        <Check size={16} aria-hidden="true" />
                        Select
                      </button>
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}

            <p
              class={`text-sm ${weatherLocationStatusTone === 'success' ? 'text-emerald-700' : weatherLocationStatusTone === 'warning' ? 'text-amber-700' : weatherLocationStatusTone === 'error' ? 'text-red-700' : 'text-stone-600'}`}
            >
              {weatherLocationStatus}
            </p>
          </div>
        </Panel>
      {/if}

      {#if enabledSections.commute}
        <Panel title="Commute Routes" eyebrow="Local Setup">
          <div class="space-y-4">
            <fieldset class="rounded-md border border-stone-200 p-3">
              <legend class="px-1 font-medium text-stone-900">Commute Days</legend>
              <div class="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                {#each commuteDayValues as day}
                  <label class="flex items-center gap-2 text-sm text-stone-800">
                    <input
                      type="checkbox"
                      aria-label={`${day[0]?.toUpperCase()}${day.slice(1)} Commute Day`}
                      checked={commuteDays.includes(day)}
                      disabled={!localSetupHydrated}
                      onchange={(event) => toggleCommuteDay(day, readInputChecked(event))}
                    />
                    {day[0]?.toUpperCase()}{day.slice(1)}
                  </label>
                {/each}
              </div>
              <p class="mt-2 text-sm text-stone-600">Choose any days, including none.</p>
            </fieldset>

            <div class="space-y-2" aria-label="Saved Commute Routes">
              {#if commuteRoutes.length === 0}
                <p class="text-sm text-stone-600">No Commute Routes saved yet.</p>
              {:else}
                {#each commuteRoutes as route}
                  <div class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-stone-200 p-3">
                    <div>
                      <p class="font-medium text-stone-900">{route.name}</p>
                      <p class="text-sm text-stone-600">{route.enabled ? 'Enabled' : 'Disabled'}</p>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <button
                        class="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-800 hover:bg-stone-50"
                        type="button"
                        disabled={!localSetupHydrated}
                        onclick={() => toggleCommuteRoute(route)}
                      >
                        {route.enabled ? 'Disable' : 'Enable'} {route.name}
                      </button>
                      <button
                        class="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-800 hover:bg-stone-50"
                        type="button"
                        disabled={!localSetupHydrated}
                        onclick={() => editCommuteRoute(route)}
                      >
                        Edit {route.name}
                      </button>
                      <button
                        class="rounded-md border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50"
                        type="button"
                        disabled={!localSetupHydrated}
                        onclick={() => deleteCommuteRoute(route)}
                      >
                        Delete {route.name}
                      </button>
                    </div>
                  </div>
                {/each}
              {/if}
            </div>

            <label class="grid gap-1">
              <span class="font-medium text-stone-800">Route Name {editingCommuteRouteId ? '(editing)' : ''}</span>
              <input
                class="h-10 rounded-md border border-stone-300 px-3"
                aria-label="Route Name"
                bind:value={commuteRouteName}
                disabled={!localSetupHydrated}
                placeholder="Morning commute"
              />
            </label>

            {#each [
              { kind: 'origin' as const, label: 'Commute Origin' },
              { kind: 'destination' as const, label: 'Commute Destination' }
            ] as selection}
              {@const selectedPoint = selection.kind === 'origin' ? commuteOrigin : commuteDestination}
              <div class="rounded-md border border-stone-200 p-3">
                <p class="font-medium text-stone-900">{selection.label}</p>
                {#if selectedPoint}
                  <p class="mt-1 text-sm text-stone-700">{selectedPoint.label}</p>
                  <p class="mt-1 text-sm text-stone-600">
                    {selectedPoint.latitude.toFixed(4)}, {selectedPoint.longitude.toFixed(4)}
                  </p>
                {:else}
                  <p class="mt-1 text-sm text-stone-600">No point selected.</p>
                {/if}
                <div class="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <input
                    class="h-10 rounded-md border border-stone-300 px-3"
                    aria-label={`${selection.label} Latitude`}
                    value={selection.kind === 'origin' ? commuteOriginLatitude : commuteDestinationLatitude}
                    disabled={!localSetupHydrated}
                    inputmode="decimal"
                    placeholder="Latitude"
                    oninput={(event) => {
                      if (selection.kind === 'origin') commuteOriginLatitude = readInputValue(event);
                      else commuteDestinationLatitude = readInputValue(event);
                    }}
                  />
                  <input
                    class="h-10 rounded-md border border-stone-300 px-3"
                    aria-label={`${selection.label} Longitude`}
                    value={selection.kind === 'origin' ? commuteOriginLongitude : commuteDestinationLongitude}
                    disabled={!localSetupHydrated}
                    inputmode="decimal"
                    placeholder="Longitude"
                    oninput={(event) => {
                      if (selection.kind === 'origin') commuteOriginLongitude = readInputValue(event);
                      else commuteDestinationLongitude = readInputValue(event);
                    }}
                  />
                  <button
                    class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-stone-300 px-4 text-sm font-semibold text-stone-800 hover:bg-stone-50"
                    type="button"
                    disabled={!localSetupHydrated}
                    onclick={() => selectCommutePoint(selection.kind)}
                  >
                    <MapPin size={18} aria-hidden="true" />
                    Select
                  </button>
                </div>
              </div>
            {/each}

            <button
              class="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-stone-400"
              type="button"
              disabled={!localSetupHydrated}
              onclick={saveCommuteRoute}
            >
              <Check size={18} aria-hidden="true" />
              {editingCommuteRouteId ? 'Save Commute Route' : 'Add Commute Route'}
            </button>
            {#if editingCommuteRouteId}
              <button
                class="ml-2 rounded-md border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50"
                type="button"
                disabled={!localSetupHydrated}
                onclick={clearCommuteRouteDraft}
              >
                Cancel editing Commute Route
              </button>
            {/if}
            <p
              class={`text-sm ${commuteRouteStatusTone === 'success' ? 'text-emerald-700' : commuteRouteStatusTone === 'warning' ? 'text-amber-700' : commuteRouteStatusTone === 'error' ? 'text-red-700' : 'text-stone-600'}`}
            >
              {commuteRouteStatus}
            </p>
          </div>
        </Panel>
      {/if}

      {#if enabledSections.calendar && calendarReadiness.status === 'demo'}
        <Panel title={calendarReadiness.label} eyebrow={calendarReadiness.detail}>
          <div class="space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <p class="font-medium text-stone-900">Week Ahead</p>
              <p class="rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-950">
                {calendarReadiness.label}
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
      {:else if enabledSections.calendar && calendarReadiness.status !== 'demo'}
        <Panel title={calendarReadiness.label} eyebrow="Google Calendar">
          <div class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <p class="font-medium text-stone-900">{calendarReadiness.statusLabel}</p>
              {#if calendarReadiness.status === 'connected'}
                <p class="rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-950">
                  Connected
                </p>
              {:else}
                <p class="rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-950">
                  Unavailable
                </p>
              {/if}
            </div>
            <p class="text-sm text-stone-600">
              {calendarReadiness.status === 'connected'
                ? calendarReadiness.detail
                : calendarReadiness.unavailableReason}
            </p>
            {#if authState.mode === 'user' && calendarReadiness.status === 'connected'}
              {#if selectedCalendarConfiguration}
                <fieldset class="grid gap-2 rounded-md border border-stone-200 p-3">
                  <legend class="font-medium text-stone-800">Selected Calendars</legend>
                  {#each selectedCalendarConfiguration.calendars as calendar}
                    <label
                      class="flex items-center justify-between gap-3 rounded-md border border-stone-200 px-3 py-2"
                      for={`selected-calendar-${calendar.id}`}
                    >
                      <span class="min-w-0">
                        <span class="block break-words font-medium text-stone-900">
                          {calendar.summary}
                        </span>
                        <span class="block text-sm text-stone-600">
                          {calendar.primary ? 'Primary Google calendar' : 'Google calendar'}
                          {calendar.unavailable ? ' unavailable from provider' : ''}
                        </span>
                      </span>
                      <span class="flex items-center gap-2">
                        {#if calendar.backgroundColor}
                          <span
                            class="h-4 w-4 rounded-sm border border-stone-300"
                            style={`background-color: ${calendar.backgroundColor}`}
                            aria-hidden="true"
                          ></span>
                        {/if}
                        <input
                          id={`selected-calendar-${calendar.id}`}
                          type="checkbox"
                          checked={calendar.selected}
                          onchange={(event) => {
                            void toggleSelectedCalendar(calendar.id, readInputChecked(event));
                          }}
                        />
                      </span>
                    </label>
                  {/each}
                  <p
                    class={`text-sm ${selectedCalendarStatusTone === 'success' ? 'text-emerald-700' : selectedCalendarStatusTone === 'warning' ? 'text-amber-700' : selectedCalendarStatusTone === 'error' ? 'text-red-700' : 'text-stone-600'}`}
                  >
                    {selectedCalendarStatus}
                  </p>
                </fieldset>
              {/if}
              <form method="POST" action="?/disconnectGoogleCalendar">
                <button
                  class="inline-flex h-10 items-center justify-center rounded-md border border-stone-300 px-4 text-sm font-semibold text-stone-800 hover:bg-stone-50"
                  type="submit"
                >
                  Disconnect Google Calendar
                </button>
              </form>
            {:else if authState.mode === 'user'}
              <a
                class="inline-flex h-10 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"
                href="/auth/google/calendar"
              >
                Connect Google Calendar
              </a>
            {/if}
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
                  {#each visibleTodoCategories() as category}
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
                  items: visibleTasksForCategory(null),
                  flipDurationMs: 150,
                  type: 'todo-task',
                  useCursorForDetection: true
                }}
                onconsider={(event) => handleTodoConsider(null, event)}
                onfinalize={(event) => handleTodoFinalize(null, event, true)}
              >
                {#each visibleTasksForCategory(null) as task (task.id)}
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

            <div
              class="grid gap-4"
              aria-label="Todo Categories"
              use:dragHandleZone={{
                items: visibleTodoCategories(),
                flipDurationMs: 150,
                type: 'todo-category',
                useCursorForDetection: true
              }}
              onconsider={handleTodoCategoryConsider}
              onfinalize={handleTodoCategoryFinalize}
            >
              {#each visibleTodoCategories() as category (category.id)}
                <section class="grid gap-2 rounded-md" aria-label={`${category.name} Todo Category`}>
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
                      <div class="flex min-w-0 items-center gap-2">
                        <span
                          class="inline-flex size-9 cursor-grab items-center justify-center rounded-md border border-stone-200 text-stone-500 active:cursor-grabbing"
                          role="button"
                          tabindex="0"
                          aria-label={`Move category ${category.name}`}
                          use:dragHandle
                        >
                          <GripVertical size={16} aria-hidden="true" />
                        </span>
                        <h3 class="font-semibold text-stone-950">{category.name}</h3>
                      </div>
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
                      items: visibleTasksForCategory(category.id),
                      flipDurationMs: 150,
                      type: 'todo-task',
                      useCursorForDetection: true
                    }}
                    onconsider={(event) => handleTodoConsider(category.id, event)}
                    onfinalize={(event) => handleTodoFinalize(category.id, event, true)}
                  >
                  {#each visibleTasksForCategory(category.id) as task (task.id)}
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
      <Panel
        title={authState.mode === 'user' ? 'Account Save' : 'Local Save'}
        eyebrow={authState.mode === 'user' ? 'User' : 'Visitor'}
      >
        {#if authState.mode === 'user'}
          <p
            class={`font-medium ${
              userSummaryConfigurationStatusTone === 'success'
                ? 'text-emerald-800'
                : userSummaryConfigurationStatusTone === 'warning'
                  ? 'text-amber-800'
                  : userSummaryConfigurationStatusTone === 'error'
                    ? 'text-red-700'
                    : 'text-stone-700'
            }`}
            role={userSummaryConfigurationStatusTone === 'error' ||
            userSummaryConfigurationStatusTone === 'warning'
              ? 'alert'
              : undefined}
          >
            {userSummaryConfigurationStatus}
          </p>
          <p class="mt-2">
            {#if userSummaryConfigurationStatusTone === 'success'}
              Your Summary Configuration is saved to your account.
            {:else if userSummaryConfigurationStatusTone === 'warning'}
              Check the Summary Configuration values and try again.
            {:else if userSummaryConfigurationStatusTone === 'error'}
              Your latest changes are not saved yet. Try again.
            {:else}
              Your Summary Configuration changes are being saved.
            {/if}
          </p>
          <p
            class={`mt-4 font-medium ${
              userTodoStateStatusTone === 'success'
                ? 'text-emerald-800'
                : userTodoStateStatusTone === 'warning'
                  ? 'text-amber-800'
                  : userTodoStateStatusTone === 'error'
                    ? 'text-red-700'
                    : 'text-stone-700'
            }`}
            role={userTodoStateStatusTone === 'error' || userTodoStateStatusTone === 'warning'
              ? 'alert'
              : undefined}
          >
            {userTodoStateStatus}
          </p>
          <p class="mt-2">
            {#if userTodoStateStatusTone === 'success'}
              Your Todo data is saved to your account.
            {:else if userTodoStateStatusTone === 'warning'}
              Check the Todo data and try again.
            {:else if userTodoStateStatusTone === 'error'}
              Your latest Todo changes are not saved yet. Try again.
            {:else}
              Your Todo changes are being saved.
            {/if}
          </p>
          <p
            class={`mt-4 font-medium ${
              localSetupImportStatusTone === 'success'
                ? 'text-emerald-800'
                : localSetupImportStatusTone === 'warning'
                  ? 'text-amber-800'
                  : localSetupImportStatusTone === 'error'
                    ? 'text-red-700'
                    : 'text-stone-700'
            }`}
            role={localSetupImportStatusTone === 'error' || localSetupImportStatusTone === 'warning'
              ? 'alert'
              : undefined}
          >
            {localSetupImportStatus}
          </p>
        {:else}
          <p
            class={`font-medium ${
              localSetupStatusTone === 'success'
                ? 'text-emerald-800'
                : localSetupStatusTone === 'warning'
                  ? 'text-amber-800'
                  : localSetupStatusTone === 'error'
                    ? 'text-red-700'
                    : 'text-stone-700'
            }`}
            role={localSetupStatusTone === 'error' || localSetupStatusTone === 'warning' ? 'alert' : undefined}
          >
            {localSetupStatus}
          </p>
          <p class="mt-2">
            This Local Setup stays on this device. It does not create a User account or enable email
            delivery.
          </p>
        {/if}
      </Panel>
      {#if authState.mode === 'user'}
        <Panel title="Sending Status" eyebrow="Test delivery">
          <div class="space-y-3">
            <p>
              Send a test Daily Summary to {authState.summaryRecipient}.
            </p>
            {#if testDeliveryStatus}
              <p
                class={`font-medium ${
                  testDeliveryStatus.tone === 'success'
                    ? 'text-emerald-800'
                    : testDeliveryStatus.tone === 'warning'
                      ? 'text-amber-800'
                      : 'text-red-700'
                }`}
                role={testDeliveryStatus.tone === 'success' ? 'status' : 'alert'}
              >
                {testDeliveryStatus.message}
              </p>
            {/if}
            <form method="POST" action="?/sendTestDailySummary">
              <button
                class="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"
                type="submit"
              >
                <Mail size={18} aria-hidden="true" />
                Send Test Daily Summary
              </button>
            </form>
          </div>
        </Panel>
        <Panel title="Delivery History" eyebrow="Last 30 days">
          {#if deliveryRecords.length > 0}
            <ul class="grid gap-3" aria-label="Delivery Record History">
              {#each deliveryRecords as record}
                <li class="grid gap-2 rounded-md border border-stone-200 p-3">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <p class="font-semibold text-stone-950">
                      {deliveryAttemptLabel(record.attemptType)} Daily Summary
                    </p>
                    <span
                      class={`rounded-md px-2 py-1 text-xs font-semibold ${deliveryStatusPresentation[record.deliveryStatus].classes}`}
                    >
                      {deliveryStatusPresentation[record.deliveryStatus].label}
                    </span>
                  </div>
                  <dl class="grid gap-1 text-sm text-stone-700">
                    <div class="flex flex-wrap justify-between gap-2">
                      <dt>{record.attemptType === 'scheduled' ? 'Scheduled for' : 'Requested'}</dt>
                      <dd>
                        {deliveryTimeLabel(
                          record.attemptType === 'scheduled' ? record.scheduledAt : record.requestedAt
                        )}
                      </dd>
                    </div>
                    <div class="flex flex-wrap justify-between gap-2">
                      <dt>Completed</dt>
                      <dd>{deliveryTimeLabel(record.completedAt)}</dd>
                    </div>
                    {#if record.attemptType === 'scheduled'}
                      <div class="flex flex-wrap justify-between gap-2">
                        <dt>Attempts</dt>
                        <dd>{record.attemptCount ?? 'Not available'}</dd>
                      </div>
                    {:else}
                      <div class="flex flex-wrap justify-between gap-2">
                        <dt>Provider</dt>
                        <dd>{record.providerName}</dd>
                      </div>
                      {#if record.providerMessageId}
                        <div class="flex flex-wrap justify-between gap-2">
                          <dt>Message id</dt>
                          <dd class="break-all">{record.providerMessageId}</dd>
                        </div>
                      {/if}
                      {#if record.providerStatusMetadata}
                        <div class="flex flex-wrap justify-between gap-2">
                          <dt>Status metadata</dt>
                          <dd>{record.providerStatusMetadata}</dd>
                        </div>
                      {/if}
                      {#if record.errorClassification}
                        <div class="flex flex-wrap justify-between gap-2">
                          <dt>Error classification</dt>
                          <dd>{record.errorClassification}</dd>
                        </div>
                      {/if}
                    {/if}
                  </dl>
                </li>
              {/each}
            </ul>
          {:else}
            <p>No Delivery Records in the last 30 days.</p>
          {/if}
        </Panel>
      {:else}
        <Panel title="Sending Status" eyebrow="Milestone 1">
          <p>
            Google sign-in is required before a test Daily Summary can be sent.
          </p>
        </Panel>
      {/if}
      <Panel title="Scope Guard" eyebrow="Remaining delivery scope">
        <ul class="list-disc space-y-2 pl-5">
          <li>No provider connections</li>
          <li>No scheduled worker</li>
        </ul>
      </Panel>
    </aside>
  </div>
</main>
