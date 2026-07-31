<script lang="ts">
  import {
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    CalendarDays,
    Check,
    ChevronRight,
    CloudSun,
    GripVertical,
    History,
    Inbox,
    ListTodo,
    LogIn,
    LogOut,
    Mail,
    MapPin,
    Pause,
    Pencil,
    Play,
    Plus,
    Search,
    Send,
    Settings,
    ShieldCheck,
    Star,
    Trash2,
    X
  } from '@lucide/svelte';
  import { dragHandle, dragHandleZone, SHADOW_ITEM_MARKER_PROPERTY_NAME, TRIGGERS } from 'svelte-dnd-action';
  import { onMount, tick } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import type { ActionData, PageData } from './$types';
  import { calendarReadinessForAuthMode } from '$lib/calendarReadiness';
  import { buildDailySummaryInput } from '$lib/dailySummaryPreview';
  import type { DeliveryHistoryRecord, DeliveryStatus } from '$lib/deliveryRecords';
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
    sameSavedLocationCoordinates,
    savedCommuteAddressSchema,
    savedWeatherCitySchema,
    type SavedCommuteAddress,
    type SavedWeatherCity
  } from '$lib/savedLocation';
  import {
    commuteDayValues,
    commuteRouteDraftSchema,
    defaultCommuteDays,
    type CommuteDay,
    type CommutePoint,
    type CommuteRoute
  } from '$lib/commuteRoute';
  import type { SelectedCalendarConfiguration, SelectedCalendarOption } from '$lib/selectedCalendars';
  import { accountDeletionConfirmation } from '$lib/accountDeletion';
  import DailyLogo from '$lib/components/DailyLogo.svelte';

  const visitorAuthState = { mode: 'visitor' } as const;
  type CommuteAddressSuggestion = { placeId: string; label: string };
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
  const summarySectionLabel = (section: SummarySection) =>
    summarySections.find((candidate) => candidate.key === section)?.label ?? 'Summary';
  const initialSummaryConfiguration = summaryConfigurationSchema.parse(
    data?.summaryConfiguration ?? defaultSummaryConfiguration
  );
  const resolvedSystemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const availableTimeZones =
    typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone')
      : ['Europe/Warsaw', 'America/New_York'];
  const supportedTimeZones = [
    initialSummaryConfiguration.userTimeZone,
    resolvedSystemTimeZone,
    'UTC',
    ...availableTimeZones
  ].filter((timeZone, index, timeZones) => timeZones.indexOf(timeZone) === index);
  const initialTodoState = todoStateSchema.parse(data?.todoState ?? createDefaultTodoState());
  const initialWeatherLocation = data?.weatherLocation
    ? weatherLocationSchema.parse(data.weatherLocation)
    : null;
  const initialSavedWeatherCities = (data?.savedWeatherCities ?? []).map((city) =>
    savedWeatherCitySchema.parse(city)
  );
  const initialSavedCommuteAddresses = (data?.savedCommuteAddresses ?? []).map((address) =>
    savedCommuteAddressSchema.parse(address)
  );
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
  let savedWeatherCities = $state<SavedWeatherCity[]>(initialSavedWeatherCities);
  let savedCommuteAddresses = $state<SavedCommuteAddress[]>(initialSavedCommuteAddresses);
  let savedWeatherCitySaveVersion = 0;
  let savedCommuteAddressSaveVersion = 0;
  let savedWeatherCitySaveQueue = Promise.resolve();
  let savedCommuteAddressSaveQueue = Promise.resolve();
  let weatherLocationSearchQuery = $state('');
  let weatherLocationSearchResults = $state<WeatherLocation[]>([]);
  let activeWeatherLocationSuggestion = $state(-1);
  let weatherLocationSearchTimer: ReturnType<typeof setTimeout> | undefined;
  let weatherLocationSearchRequest = 0;
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
  let commuteRouteDays = $state<CommuteDay[]>([...defaultCommuteDays]);
  let commuteOrigin = $state<CommutePoint | null>(null);
  let commuteDestination = $state<CommutePoint | null>(null);
  let commuteSearchQueries = $state({ origin: '', destination: '' });
  let commuteSearchResults = $state({ origin: [] as CommuteAddressSuggestion[], destination: [] as CommuteAddressSuggestion[] });
  let activeCommuteSuggestion = $state({ origin: -1, destination: -1 });
  let activeCommuteSearchField = $state<'origin' | 'destination' | null>(null);
  let commuteSearchSessionTokens = { origin: '', destination: '' };
  let commuteSearchTimers: { origin?: ReturnType<typeof setTimeout>; destination?: ReturnType<typeof setTimeout> } = {};
  let commuteSearchRequests = { origin: 0, destination: 0 };
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
  let taskPlacementOpen = $state(false);
  let taskPlacementDialog = $state<HTMLDialogElement>();
  let weatherDialogOpen = $state(false);
  let weatherDialog = $state<HTMLDialogElement>();
  let commuteDialogOpen = $state(false);
  let commuteDialog = $state<HTMLDialogElement>();
  let commuteEditorOpen = $state(false);
  let calendarDialogOpen = $state(false);
  let calendarDialog = $state<HTMLDialogElement>();
  let calendarSettingsOpen = $state(false);
  let calendarSettingsDialog = $state<HTMLDialogElement>();
  let secondaryPanel = $state<'settings' | 'history' | null>(null);
  let secondaryDialog = $state<HTMLDialogElement>();
  let categoryComposerOpen = $state(false);
  let newCategoryInput = $state<HTMLInputElement>();
  let categoryPendingDeletion = $state<TodoCategory | null>(null);
  let categoryDeletionDialog = $state<HTMLDialogElement>();
  let categoryDeletionCloseButton = $state<HTMLButtonElement>();
  let summaryDeliveryDialogOpen = $state(false);
  let summaryDeliveryDialog = $state<HTMLDialogElement>();
  let summaryDeliveryHoursButton = $state<HTMLButtonElement>();
  let summaryDeliveryMinutesButton = $state<HTMLButtonElement>();
  let summaryDeliveryTimeZoneSelect = $state<HTMLSelectElement>();
  let summaryTimeDraft = $state('07:00');
  let userTimeZoneDraft = $state<UserTimeZone>('UTC');
  let activeSummaryTimePart = $state<'hours' | 'minutes'>('hours');
  let summaryTimeZoneEditorOpen = $state(false);
  let calendarDisconnectConfirmation = $state(false);

  onMount(() => {
    if (authState.mode === 'user') {
      if (new URL(globalThis.location.href).searchParams.get('localSetupImport') === '1') {
        void importVisitorLocalSetupAfterSignIn();
        return;
      }

      if (data?.hasSavedSummaryConfiguration === false) {
        useSystemTimeZone();
      }
      localSetupHydrated = true;
      todoControlsReady = true;
      return;
    }

    const loadOutcome = restoreVisitorLocalSetup();
    if (loadOutcome === 'empty') {
      useSystemTimeZone();
    }
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

  const systemTimeZone = () => {
    const result = summaryConfigurationSchema.shape.userTimeZone.safeParse(resolvedSystemTimeZone);
    return result.success ? result.data : 'UTC';
  };

  const useSystemTimeZone = () => {
    patchSummaryConfiguration({ userTimeZone: systemTimeZone() });
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
    savedWeatherCities = setup.savedWeatherCities;
    savedCommuteAddresses = setup.savedCommuteAddresses;
    commuteRoutes = setup.commuteRoutes;
    commuteDays = setup.commuteDays;
    editingCommuteRouteId = null;
    commuteRouteName = '';
    commuteRouteDays = [...defaultCommuteDays];
    commuteOrigin = null;
    commuteDestination = null;
    commuteSearchQueries = { origin: '', destination: '' };
    commuteSearchSessionTokens = { origin: '', destination: '' };
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
    savedWeatherCities,
    savedCommuteAddresses,
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
  const cancelPendingWeatherLocationSearch = () => {
    clearTimeout(weatherLocationSearchTimer);
    weatherLocationSearchTimer = undefined;
    weatherLocationSearchRequest += 1;
  };
  const isSavedWeatherCity = (city: SavedWeatherCity) =>
    savedWeatherCities.some((candidate) => sameSavedLocationCoordinates(candidate, city));
  const isSavedCommuteAddress = (address: SavedCommuteAddress) =>
    savedCommuteAddresses.some((candidate) => sameSavedLocationCoordinates(candidate, address));
  const savedWeatherCityButtonLabel = (city: SavedWeatherCity) =>
    `${isSavedWeatherCity(city) ? 'Remove' : 'Add'} ${city.label} ${
      isSavedWeatherCity(city) ? 'from' : 'to'
    } Saved Weather Cities`;
  const savedCommuteAddressButtonLabel = (address: SavedCommuteAddress) =>
    `${isSavedCommuteAddress(address) ? 'Remove' : 'Add'} ${address.label} ${
      isSavedCommuteAddress(address) ? 'from' : 'to'
    } Saved Commute Addresses`;
  const showSavedWeatherLocations = () => {
    cancelPendingWeatherLocationSearch();
    weatherLocationSearchResults = [...savedWeatherCities];
    activeWeatherLocationSuggestion = savedWeatherCities.length > 0 ? 0 : -1;
    weatherLocationStatus = savedWeatherCities.length
      ? 'Choose a Saved Weather City or search for a city.'
      : 'No Saved Weather Cities yet. Search for a city to add one.';
    weatherLocationStatusTone = 'neutral';
  };
  const persistSavedWeatherCities = (
    nextCities: SavedWeatherCity[],
    previousCities: SavedWeatherCity[]
  ) => {
    if (authState.mode !== 'user') return;

    const requestVersion = ++savedWeatherCitySaveVersion;
    const requestedSnapshot = JSON.stringify(nextCities);

    savedWeatherCitySaveQueue = savedWeatherCitySaveQueue.then(async () => {
      try {
        const response = await fetch('/saved-weather-cities', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ cities: nextCities })
        });

        if (response.ok) return;
        if (requestVersion !== savedWeatherCitySaveVersion) return;

        if (JSON.stringify(savedWeatherCities) === requestedSnapshot) {
          savedWeatherCities = previousCities;
        }
        const message = response.status === 400
          ? 'Saved Weather Cities could not be updated.'
          : 'Saved Weather Cities are temporarily unavailable.';
        weatherLocationStatus = message;
        weatherLocationStatusTone = response.status === 400 ? 'warning' : 'error';
      } catch {
        if (requestVersion !== savedWeatherCitySaveVersion) return;

        if (JSON.stringify(savedWeatherCities) === requestedSnapshot) {
          savedWeatherCities = previousCities;
        }
        weatherLocationStatus = 'Saved Weather Cities could not be updated. Try again.';
        weatherLocationStatusTone = 'error';
      }
    });

    return savedWeatherCitySaveQueue;
  };
  const persistSavedCommuteAddresses = (
    nextAddresses: SavedCommuteAddress[],
    previousAddresses: SavedCommuteAddress[]
  ) => {
    if (authState.mode !== 'user') return;

    const requestVersion = ++savedCommuteAddressSaveVersion;
    const requestedSnapshot = JSON.stringify(nextAddresses);

    savedCommuteAddressSaveQueue = savedCommuteAddressSaveQueue.then(async () => {
      try {
        const response = await fetch('/saved-commute-addresses', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ addresses: nextAddresses })
        });

        if (response.ok) return;
        if (requestVersion !== savedCommuteAddressSaveVersion) return;

        if (JSON.stringify(savedCommuteAddresses) === requestedSnapshot) {
          savedCommuteAddresses = previousAddresses;
        }
        commuteRouteStatus = response.status === 400
          ? 'Saved Commute Addresses could not be updated.'
          : 'Saved Commute Addresses are temporarily unavailable.';
        commuteRouteStatusTone = response.status === 400 ? 'warning' : 'error';
      } catch {
        if (requestVersion !== savedCommuteAddressSaveVersion) return;

        if (JSON.stringify(savedCommuteAddresses) === requestedSnapshot) {
          savedCommuteAddresses = previousAddresses;
        }
        commuteRouteStatus = 'Saved Commute Addresses could not be updated. Try again.';
        commuteRouteStatusTone = 'error';
      }
    });

    return savedCommuteAddressSaveQueue;
  };
  const toggleSavedWeatherCity = async (city: SavedWeatherCity) => {
    const normalizedCity = savedWeatherCitySchema.parse(city);
    const previousCities = savedWeatherCities;
    const nextCities = isSavedWeatherCity(normalizedCity)
      ? savedWeatherCities.filter(
          (candidate) => !sameSavedLocationCoordinates(candidate, normalizedCity)
        )
      : [...savedWeatherCities, normalizedCity];

    if (nextCities.length > 20) {
      weatherLocationStatus = 'You can save up to 20 Saved Weather Cities.';
      weatherLocationStatusTone = 'warning';
      return;
    }

    savedWeatherCities = nextCities;
    if (weatherLocationSearchQuery.trim().length === 0) {
      showSavedWeatherLocations();
    }
    if (authState.mode === 'visitor') return;
    await persistSavedWeatherCities(nextCities, previousCities);
  };
  const toggleSavedCommuteAddress = async (address: SavedCommuteAddress) => {
    const normalizedAddress = savedCommuteAddressSchema.parse(address);
    const previousAddresses = savedCommuteAddresses;
    const nextAddresses = isSavedCommuteAddress(normalizedAddress)
      ? savedCommuteAddresses.filter(
          (candidate) => !sameSavedLocationCoordinates(candidate, normalizedAddress)
        )
      : [...savedCommuteAddresses, normalizedAddress];

    if (nextAddresses.length > 20) {
      commuteRouteStatus = 'You can save up to 20 Saved Commute Addresses.';
      commuteRouteStatusTone = 'warning';
      return;
    }

    savedCommuteAddresses = nextAddresses;
    if (authState.mode === 'visitor') return;
    await persistSavedCommuteAddresses(nextAddresses, previousAddresses);
  };
  const searchWeatherLocation = async () => {
    cancelPendingWeatherLocationSearch();
    const searchInput = globalThis.document?.getElementById('weather-location-search');
    const currentSearchQuery =
      searchInput instanceof HTMLInputElement ? searchInput.value : weatherLocationSearchQuery;
    weatherLocationSearchQuery = currentSearchQuery;
    const request = weatherLocationSearchRequest;
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

      if (request !== weatherLocationSearchRequest) return;

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
      activeWeatherLocationSuggestion = weatherLocationSearchResults.length > 0 ? 0 : -1;
      weatherLocationStatus =
        weatherLocationSearchResults.length > 0
          ? 'Choose a Weather Location result.'
          : 'No matching Weather Locations found.';
      weatherLocationStatusTone = weatherLocationSearchResults.length > 0 ? 'neutral' : 'warning';
    } catch {
      if (request !== weatherLocationSearchRequest) return;
      weatherLocationSearchResults = [];
      weatherLocationStatus = 'Weather Location search failed. Try again.';
      weatherLocationStatusTone = 'error';
    }
  };
  const suggestWeatherLocations = () => {
    cancelPendingWeatherLocationSearch();
    weatherLocationSearchResults = [];
    activeWeatherLocationSuggestion = -1;

    const query = weatherLocationSearchQuery.trim();
    if (query.length === 0) {
      showSavedWeatherLocations();
      return;
    }

    if (query.length < 2) {
      weatherLocationStatus = 'Type at least 2 characters to see city suggestions.';
      weatherLocationStatusTone = 'neutral';
      return;
    }

    weatherLocationSearchTimer = setTimeout(() => {
      weatherLocationSearchTimer = undefined;
      void searchWeatherLocation();
    }, 300);
  };
  const saveWeatherLocation = async (location: WeatherLocation) => {
    cancelPendingWeatherLocationSearch();

    if (authState.mode !== 'user') {
      weatherLocation = location;
      weatherLocationSearchResults = [];
      weatherLocationSearchQuery = location.label;
      weatherLocationStatus = 'Weather Location saved in this browser only.';
      weatherLocationStatusTone = 'success';
      closeWeatherDialog();
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
      closeWeatherDialog();
    } catch {
      weatherLocationStatus = 'Weather Location save failed. Try again.';
      weatherLocationStatusTone = 'error';
    }
  };
  const showSavedCommuteLocations = (kind: 'origin' | 'destination') => {
    clearTimeout(commuteSearchTimers[kind]);
    commuteSearchRequests[kind] += 1;
    commuteSearchResults[kind] = [];
    activeCommuteSuggestion[kind] = savedCommuteAddresses.length > 0 ? 0 : -1;
  };
  const selectSavedCommuteLocation = (
    kind: 'origin' | 'destination',
    location: SavedCommuteAddress
  ) => {
    commuteSearchQueries[kind] = location.label;
    if (kind === 'origin') commuteOrigin = location;
    else commuteDestination = location;
    commuteSearchResults[kind] = [];
    commuteSearchSessionTokens[kind] = '';
    activeCommuteSuggestion[kind] = -1;
    commuteRouteStatus = `Commute ${kind === 'origin' ? 'Origin' : 'Destination'} selected from Saved Commute Addresses.`;
    commuteRouteStatusTone = 'success';
  };
  const suggestCommutePoints = (kind: 'origin' | 'destination') => {
    clearTimeout(commuteSearchTimers[kind]);
    commuteSearchRequests[kind] += 1;
    commuteSearchResults[kind] = [];
    activeCommuteSuggestion[kind] = -1;
    const query = commuteSearchQueries[kind].trim();
    if (query.length === 0) {
      showSavedCommuteLocations(kind);
      return;
    }
    if (query.length < 3) return;
    commuteSearchSessionTokens[kind] ||= crypto.randomUUID();
    const request = commuteSearchRequests[kind];
    commuteSearchTimers[kind] = setTimeout(async () => {
      try {
        const parameters = new URLSearchParams({
          q: commuteSearchQueries[kind],
          sessionToken: commuteSearchSessionTokens[kind]
        });
        const response = await fetch(`/commute-point-search?${parameters}`);
        const result = (await response.json()) as { outcome?: string; suggestions?: CommuteAddressSuggestion[]; reason?: string };
        if (request !== commuteSearchRequests[kind]) return;
        commuteSearchResults[kind] = result.outcome === 'available' ? result.suggestions ?? [] : [];
        activeCommuteSuggestion[kind] = commuteSearchResults[kind].length > 0 ? 0 : -1;
        if (result.outcome === 'unavailable') {
          commuteRouteStatus = result.reason === 'places-monthly-cap'
            ? 'Monthly address search limit has been reached.'
            : 'Address search is unavailable right now.';
          commuteRouteStatusTone = 'warning';
        }
      } catch {
        if (request === commuteSearchRequests[kind]) commuteSearchResults[kind] = [];
      }
    }, 300);
  };
  const handleCommuteSearchKeydown = (
    event: KeyboardEvent,
    kind: 'origin' | 'destination'
  ) => {
    if (commuteSearchQueries[kind].trim().length === 0) {
      const savedAddressSuggestions = savedCommuteAddresses;
      if (event.key === 'ArrowDown' && savedAddressSuggestions.length) {
        event.preventDefault();
        activeCommuteSuggestion[kind] =
          (activeCommuteSuggestion[kind] + 1) % savedAddressSuggestions.length;
      } else if (event.key === 'ArrowUp' && savedAddressSuggestions.length) {
        event.preventDefault();
        activeCommuteSuggestion[kind] =
          (activeCommuteSuggestion[kind] - 1 + savedAddressSuggestions.length) %
          savedAddressSuggestions.length;
      } else if (event.key === 'Enter' && savedAddressSuggestions[activeCommuteSuggestion[kind]]) {
        event.preventDefault();
        selectSavedCommuteLocation(kind, savedAddressSuggestions[activeCommuteSuggestion[kind]]);
      } else if (event.key === 'Escape') {
        commuteSearchResults[kind] = [];
        activeCommuteSuggestion[kind] = -1;
      }
      return;
    }

    const suggestions = commuteSearchResults[kind];
    if (event.key === 'ArrowDown' && suggestions.length) {
      event.preventDefault();
      activeCommuteSuggestion[kind] =
        (activeCommuteSuggestion[kind] + 1) % suggestions.length;
    } else if (event.key === 'ArrowUp' && suggestions.length) {
      event.preventDefault();
      activeCommuteSuggestion[kind] =
        (activeCommuteSuggestion[kind] - 1 + suggestions.length) % suggestions.length;
    } else if (event.key === 'Enter' && suggestions[activeCommuteSuggestion[kind]]) {
      event.preventDefault();
      void selectCommuteSuggestion(kind, suggestions[activeCommuteSuggestion[kind]]);
    } else if (event.key === 'Escape') {
      commuteSearchResults[kind] = [];
      activeCommuteSuggestion[kind] = -1;
    }
  };
  const selectCommuteSuggestion = async (kind: 'origin' | 'destination', suggestion: CommuteAddressSuggestion) => {
    clearTimeout(commuteSearchTimers[kind]);
    const selectionRequest = ++commuteSearchRequests[kind];
    commuteSearchResults[kind] = [];
    commuteRouteStatus = 'Resolving selected address...';
    commuteRouteStatusTone = 'neutral';
    try {
      const response = await fetch('/commute-point-selection', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          placeId: suggestion.placeId,
          sessionToken: commuteSearchSessionTokens[kind]
        })
      });
      const result = (await response.json()) as { outcome?: string; point?: CommutePoint; reason?: string };
      if (selectionRequest !== commuteSearchRequests[kind]) return;
      if (result.outcome !== 'available' || !result.point) {
        commuteRouteStatus = result.reason === 'places-monthly-cap'
          ? 'Monthly address search limit has been reached.'
          : 'The selected address could not be resolved.';
        commuteRouteStatusTone = 'warning';
        return;
      }
      commuteSearchQueries[kind] = result.point.label;
      if (kind === 'origin') commuteOrigin = result.point;
      else commuteDestination = result.point;
      commuteSearchSessionTokens[kind] = '';
      commuteRouteStatus = `Commute ${kind === 'origin' ? 'Origin' : 'Destination'} selected.`;
      commuteRouteStatusTone = 'success';
    } catch {
      if (selectionRequest !== commuteSearchRequests[kind]) return;
      commuteRouteStatus = 'The selected address could not be resolved.';
      commuteRouteStatusTone = 'error';
    }
  };
  const clearCommuteRouteDraft = () => {
    commuteEditorOpen = false;
    editingCommuteRouteId = null;
    for (const kind of ['origin', 'destination'] as const) {
      clearTimeout(commuteSearchTimers[kind]);
      commuteSearchRequests[kind] += 1;
    }
    commuteSearchResults = { origin: [], destination: [] };
    activeCommuteSuggestion = { origin: -1, destination: -1 };
    activeCommuteSearchField = null;
    commuteRouteName = '';
    commuteRouteDays = [...defaultCommuteDays];
    commuteOrigin = null;
    commuteDestination = null;
    commuteSearchQueries = { origin: '', destination: '' };
    commuteSearchSessionTokens = { origin: '', destination: '' };
  };
  const requestCommutePreviewDuration = async (route: { origin: CommutePoint; destination: CommutePoint }) => {
    const response = await fetch('/commute-estimate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(route)
    });
    if (!response.ok) return null;

    const result = await response.json();
    return result?.outcome === 'available' && Number.isFinite(result.estimate?.durationMinutes)
      ? Math.round(result.estimate.durationMinutes)
      : null;
  };
  const saveCommuteRoute = async () => {
    if (!editingCommuteRouteId && commuteRoutes.length >= 5) {
      commuteRouteStatus = 'You can save at most five Commute Routes.';
      commuteRouteStatusTone = 'warning';
      return;
    }
    const result = commuteRouteDraftSchema.safeParse({
      name: commuteRouteName,
      origin: commuteOrigin,
      destination: commuteDestination,
      days: commuteRouteDays
    });
    if (!result.success) {
      commuteRouteStatus = 'Provide a valid route name, Origin, and Destination before saving.';
      commuteRouteStatusTone = 'warning';
      return;
    }
    if (editingCommuteRouteId) {
      const existingRoute = commuteRoutes.find((route) => route.id === editingCommuteRouteId);
      if (!existingRoute) {
        commuteRouteStatus = 'Commute Route is no longer available.';
        commuteRouteStatusTone = 'warning';
        return;
      }
      if (authState.mode === 'user') {
        void saveUserCommuteRoute(editingCommuteRouteId, { ...result.data, enabled: existingRoute.enabled });
        return;
      }
      let previewDurationMinutes = existingRoute.previewDurationMinutes ?? null;
      const endpointsChanged =
        existingRoute.origin.latitude !== result.data.origin.latitude ||
        existingRoute.origin.longitude !== result.data.origin.longitude ||
        existingRoute.destination.latitude !== result.data.destination.latitude ||
        existingRoute.destination.longitude !== result.data.destination.longitude;
      if (endpointsChanged) {
        try {
          previewDurationMinutes = await requestCommutePreviewDuration(result.data);
        } catch {
          previewDurationMinutes = null;
        }
        if (previewDurationMinutes === null) {
          commuteRouteStatus = 'Commute estimate is unavailable, so the route was not updated.';
          commuteRouteStatusTone = 'error';
          return;
        }
      }
      commuteRoutes = commuteRoutes.map((route) => route.id === editingCommuteRouteId
        ? { ...route, ...result.data, previewDurationMinutes }
        : route);
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
    commuteRouteStatus = 'Fetching a baseline Commute estimate...';
    commuteRouteStatusTone = 'neutral';
    let previewDurationMinutes: number | null;
    try {
      previewDurationMinutes = await requestCommutePreviewDuration(result.data);
    } catch {
      previewDurationMinutes = null;
    }
    if (previewDurationMinutes === null) {
      commuteRouteStatus = 'Commute estimate is unavailable, so the route was not saved.';
      commuteRouteStatusTone = 'error';
      return;
    }
    commuteRoutes = [...commuteRoutes, { ...result.data, id, enabled: true, previewDurationMinutes }];
    clearCommuteRouteDraft();
    commuteRouteStatus = 'Commute Route saved in this browser only.';
    commuteRouteStatusTone = 'success';
  };
  const editCommuteRoute = (route: CommuteRoute) => {
    commuteEditorOpen = true;
    editingCommuteRouteId = route.id;
    commuteRouteName = route.name;
    commuteRouteDays = [...route.days];
    commuteOrigin = route.origin;
    commuteDestination = route.destination;
    commuteSearchQueries = { origin: route.origin.label, destination: route.destination.label };
    commuteSearchSessionTokens = { origin: '', destination: '' };
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
  const toggleCommuteRouteDay = (day: CommuteDay, checked: boolean) => {
    const nextDays = checked
      ? commuteDayValues.filter(
          (candidate) => candidate === day || commuteRouteDays.includes(candidate)
        )
      : commuteRouteDays.filter((candidate) => candidate !== day);
    commuteRouteDays = nextDays;
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
      commuteRouteStatus = result.outcome === 'route-limit-reached'
        ? 'You can save at most five Commute Routes.'
        : result.outcome === 'estimate-unavailable'
          ? 'Travel time is unavailable. Check both addresses and try again.'
          : result.outcome === 'invalid-route'
            ? 'Check the route name, addresses, and selected days.'
            : 'The route could not be saved. Refresh the page and try again.';
      commuteRouteStatusTone = response.status === 400 || response.status === 409 ? 'warning' : 'error';
    } catch {
      commuteRouteStatus = 'The route could not be saved. Check your connection and try again.';
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
      commuteRouteStatus = result.outcome === 'not-found'
        ? 'Commute Route is no longer available.'
        : result.outcome === 'estimate-unavailable'
          ? 'Travel time is unavailable. Check both addresses and try again.'
          : result.outcome === 'invalid-route'
            ? 'Check the route name, addresses, and selected days.'
            : 'The route could not be saved. Refresh the page and try again.';
      commuteRouteStatusTone = response.status === 400 || response.status === 404 ? 'warning' : 'error';
    } catch {
      commuteRouteStatus = 'The route could not be saved. Check your connection and try again.';
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
      return;
    }

    await invalidateAll();
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
  const unknownDeliveryStatusPresentation = {
    label: 'Unknown',
    classes: 'bg-stone-100 text-stone-700'
  };
  const deliveryStatusPresentationFor = (deliveryStatus: string) =>
    deliveryStatusPresentation[deliveryStatus as DeliveryStatus] ??
    unknownDeliveryStatusPresentation;
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

  const openTaskPlacement = async () => {
    if (!newTodoTitle.trim()) {
      return;
    }

    newTodoCategoryId = '';
    newTodoUrgency = 'low';
    taskPlacementOpen = true;
    await tick();
    taskPlacementDialog?.showModal();
    taskPlacementDialog?.focus();
  };

  const closeTaskPlacement = () => {
    taskPlacementDialog?.close();
    taskPlacementOpen = false;
  };

  const confirmTaskPlacement = () => {
    createTodoTask();
    closeTaskPlacement();
  };

  const cycleTaskPlacementCategory = (direction: -1 | 1) => {
    const categoryIds = [
      ...visibleTodoCategories().map((category) => category.id),
      ''
    ];
    const currentIndex = categoryIds.indexOf(newTodoCategoryId);
    newTodoCategoryId =
      categoryIds[(currentIndex + direction + categoryIds.length) % categoryIds.length] ?? '';
  };

  const cycleTaskPlacementUrgency = (direction: -1 | 1) => {
    const urgencies: TodoUrgency[] = ['low', 'medium', 'high'];
    const currentIndex = urgencies.indexOf(newTodoUrgency);
    newTodoUrgency =
      urgencies[(currentIndex + direction + urgencies.length) % urgencies.length] ?? 'low';
  };

  const handleTaskPlacementKeydown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      cycleTaskPlacementCategory(event.key === 'ArrowUp' ? -1 : 1);
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      cycleTaskPlacementUrgency(event.key === 'ArrowLeft' ? -1 : 1);
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      confirmTaskPlacement();
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeTaskPlacement();
    }
  };

  const showDialog = async (
    kind: 'weather' | 'commute' | 'calendar' | 'calendar-settings'
  ) => {
    if (kind === 'weather') {
      weatherDialogOpen = true;
      weatherLocationSearchQuery = '';
      showSavedWeatherLocations();
    }
    if (kind === 'commute') commuteDialogOpen = true;
    if (kind === 'calendar') calendarDialogOpen = true;
    if (kind === 'calendar-settings') calendarSettingsOpen = true;
    await tick();
    const dialog = {
      weather: weatherDialog,
      commute: commuteDialog,
      calendar: calendarDialog,
      'calendar-settings': calendarSettingsDialog
    }[kind];
    dialog?.showModal();
    dialog?.focus();
  };

  const closeWeatherDialog = () => {
    cancelPendingWeatherLocationSearch();
    weatherLocationSearchResults = [];
    weatherDialog?.close();
    weatherDialogOpen = false;
  };

  const closeCommuteDialog = () => {
    commuteDialog?.close();
    commuteDialogOpen = false;
    commuteEditorOpen = false;
    clearCommuteRouteDraft();
  };

  const startNewCommuteRoute = () => {
    clearCommuteRouteDraft();
    commuteEditorOpen = true;
  };

  const closeCalendarDialog = () => {
    calendarDialog?.close();
    calendarDialogOpen = false;
  };

  const openCalendarSettings = async () => {
    closeCalendarDialog();
    calendarDisconnectConfirmation = false;
    await showDialog('calendar-settings');
  };

  const closeCalendarSettings = () => {
    calendarSettingsDialog?.close();
    calendarSettingsOpen = false;
    calendarDisconnectConfirmation = false;
  };

  const returnToCalendarAgenda = async () => {
    closeCalendarSettings();
    await showDialog('calendar');
  };

  const openSecondaryPanel = async (panel: 'settings' | 'history') => {
    secondaryPanel = panel;
    await tick();
    secondaryDialog?.showModal();
    secondaryDialog?.focus();
  };

  const closeSecondaryPanel = () => {
    secondaryDialog?.close();
    secondaryPanel = null;
  };

  const handleSecondaryPanelClick = (event: MouseEvent) => {
    const dialog = secondaryDialog;
    if (!dialog) return;

    const bounds = dialog.getBoundingClientRect();
    const clickedOutside =
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom;

    if (clickedOutside) closeSecondaryPanel();
  };

  const openSummaryDeliveryDialog = async () => {
    summaryTimeDraft = summaryTime;
    userTimeZoneDraft = userTimeZone;
    activeSummaryTimePart = 'hours';
    summaryTimeZoneEditorOpen = false;
    summaryDeliveryDialogOpen = true;
    await tick();
    summaryDeliveryDialog?.showModal();
    summaryDeliveryHoursButton?.focus();
  };

  const closeSummaryDeliveryDialog = () => {
    summaryDeliveryDialog?.close();
    summaryDeliveryDialogOpen = false;
  };

  const summaryTimeParts = () => {
    const [hours = '00', minutes = '00'] = summaryTimeDraft.split(':');
    return { hours: Number(hours), minutes: Number(minutes) };
  };

  const adjustSummaryTime = (part: 'hours' | 'minutes', direction: 1 | -1) => {
    activeSummaryTimePart = part;
    const current = summaryTimeParts();
    const nextHours = part === 'hours'
      ? (current.hours + direction + 24) % 24
      : current.hours;
    const nextMinutes = part === 'minutes'
      ? (current.minutes + direction + 60) % 60
      : current.minutes;
    summaryTimeDraft = `${String(nextHours).padStart(2, '0')}:${String(nextMinutes).padStart(2, '0')}`;
    activateSummaryTimePart(part);
  };

  const activateSummaryTimePart = (part: 'hours' | 'minutes') => {
    activeSummaryTimePart = part;
    (part === 'hours' ? summaryDeliveryHoursButton : summaryDeliveryMinutesButton)?.focus();
  };

  const handleSummaryTimeKeydown = (
    part: 'hours' | 'minutes',
    event: KeyboardEvent
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveSummaryDeliveryTime();
      return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      activateSummaryTimePart(event.key === 'ArrowLeft' ? 'hours' : 'minutes');
      return;
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      adjustSummaryTime(part, event.key === 'ArrowUp' ? 1 : -1);
    }
  };

  const editSummaryTimeZone = async () => {
    summaryTimeZoneEditorOpen = true;
    await tick();
    summaryDeliveryTimeZoneSelect?.focus();
  };

  const saveSummaryDeliveryTime = () => {
    const result = summaryConfigurationSchema.safeParse({
      ...currentSummaryConfiguration(),
      summaryTime: summaryTimeDraft,
      userTimeZone: userTimeZoneDraft
    });
    if (!result.success) return;

    updateSummaryConfiguration(result.data);
    closeSummaryDeliveryDialog();
  };

  const openCategoryComposer = async () => {
    categoryComposerOpen = true;
    await tick();
    newCategoryInput?.focus();
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

  const confirmTodoCategoryDeletion = () => {
    const category = categoryPendingDeletion;
    if (!category) return;
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
    categoryDeletionDialog?.close();
    categoryPendingDeletion = null;
  };

  const requestTodoCategoryDeletion = async (category: TodoCategory) => {
    categoryPendingDeletion = category;
    await tick();
    categoryDeletionDialog?.showModal();
    categoryDeletionCloseButton?.focus();
  };

  const cancelTodoCategoryDeletion = () => {
    categoryDeletionDialog?.close();
    categoryPendingDeletion = null;
  };
  const calendarAgendaDays = $derived(
    authState.mode === 'visitor'
      ? []
      : [
          ...(data?.calendarSection?.today
            ? [
                {
                  label: data.calendarSection.today.label,
                  events: [
                    ...data.calendarSection.today.allDayEvents.map((event) => ({
                      id: event.id,
                      title: event.title,
                      time: 'All day',
                      calendarLabel: event.calendarLabel,
                      calendarColor: event.calendarColor ?? '#617d49'
                    })),
                    ...data.calendarSection.today.timedEvents.map((event) => ({
                      id: event.id,
                      title: event.title,
                      time: event.localStartTime,
                      calendarLabel: event.calendarLabel,
                      calendarColor: event.calendarColor ?? '#617d49'
                    }))
                  ]
                }
              ]
            : []),
          ...(data?.calendarSection?.weekAhead ?? []).map((day) => ({
            label: day.label,
            events: [
              ...day.allDayEvents.map((event) => ({
                id: event.id,
                title: event.title,
                time: 'All day',
                calendarLabel: event.calendarLabel,
                calendarColor: event.calendarColor ?? '#617d49'
              })),
              ...day.timedEvents.map((event) => ({
                id: event.id,
                title: event.title,
                time: event.localStartTime,
                calendarLabel: event.calendarLabel,
                calendarColor: event.calendarColor ?? '#617d49'
              }))
            ]
          }))
        ]
  );
  const calendarEventCount = $derived(
    calendarAgendaDays.reduce((total, day) => total + day.events.length, 0)
  );
  const selectedTaskCategoryName = $derived(
    newTodoCategoryId
      ? todoCategories.find((category) => category.id === newTodoCategoryId)?.name ?? 'Ungrouped'
      : 'Ungrouped'
  );
  const boardDateLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  })
    .format(new Date())
    .toUpperCase();
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
      commuteDays
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

{#snippet SummarySectionToggle(section: SummarySection, statusId: string)}
  <button
    class="daily-context-tile__toggle"
    type="button"
    disabled={!localSetupHydrated}
    aria-label={enabledSections[section] ? 'Pause section' : 'Resume section'}
    aria-describedby={statusId}
    aria-pressed={enabledSections[section]}
    title={enabledSections[section] ? `Pause ${summarySectionLabel(section)} section` : `Resume ${summarySectionLabel(section)} section`}
    onclick={() => toggleSection(section, !enabledSections[section])}
  >
    {#if enabledSections[section]}<Pause size={14} aria-hidden="true" />{:else}<Play size={14} aria-hidden="true" />{/if}
  </button>
{/snippet}

{#snippet TodoTaskRow(task: TodoTask)}
  <li
    class:daily-task--editing={editingTaskId === task.id}
    class:daily-task--drop-placeholder={isDndShadowTask(task)}
    class="daily-task"
    aria-label={task.title}
  >
    {#if editingTaskId === task.id}
      <span class="daily-task-checkbox" aria-hidden="true"></span>
      <span class={`daily-priority daily-priority--${editingTaskUrgency}`} aria-hidden="true"></span>
      <div class="daily-task-editor">
        <input
          bind:value={editingTaskTitle}
          aria-label="Edit Todo Task"
          onkeydown={(event) => {
            if (event.key === 'Enter') saveEditingTodoTask();
            if (event.key === 'Escape') editingTaskId = null;
          }}
        />
        <div class="daily-priority-picker" role="group" aria-label="Edit Urgency">
          <button
            class:is-selected={editingTaskUrgency === 'low'}
            type="button"
            aria-label="No urgency"
            aria-pressed={editingTaskUrgency === 'low'}
            onclick={() => (editingTaskUrgency = 'low')}
          ><span class="daily-priority daily-priority--low"></span>None</button>
          <button
            class:is-selected={editingTaskUrgency === 'medium'}
            type="button"
            aria-label="Medium urgency"
            aria-pressed={editingTaskUrgency === 'medium'}
            onclick={() => (editingTaskUrgency = 'medium')}
          ><span class="daily-priority daily-priority--medium"></span>Soon</button>
          <button
            class:is-selected={editingTaskUrgency === 'high'}
            type="button"
            aria-label="High urgency"
            aria-pressed={editingTaskUrgency === 'high'}
            onclick={() => (editingTaskUrgency = 'high')}
          ><span class="daily-priority daily-priority--high"></span>Urgent</button>
        </div>
      </div>
      <div class="daily-task-edit-actions">
        <button type="button" aria-label="Save Todo Task" onclick={saveEditingTodoTask}><Check size={17} /></button>
        <button type="button" aria-label="Cancel editing Todo Task" onclick={() => (editingTaskId = null)}><X size={17} /></button>
      </div>
    {:else}
      <span
        class="daily-drag-handle"
        role="button"
        tabindex="0"
        aria-label={`Move ${task.title}`}
        use:dragHandle
      ><GripVertical size={14} aria-hidden="true" /></span>
      <label class="daily-task-check-label">
        <input
          type="checkbox"
          aria-label={`Complete ${task.title}`}
          onchange={() => completeTodoTask(task.id)}
        />
        <span class="daily-task-checkbox" aria-hidden="true"><Check size={14} /></span>
      </label>
      <span
        class={`daily-priority daily-priority--${task.urgency}`}
        aria-label={urgencyLabel(task.urgency)}
      ></span>
      <span class="daily-task-title">{task.title}</span>
      <button
        class="daily-task-edit"
        type="button"
        aria-label={`Edit ${task.title}`}
        onclick={() => startEditingTodoTask(task)}
      ><Pencil size={15} aria-hidden="true" /></button>
    {/if}
  </li>
{/snippet}

{#snippet TodoTaskList(categoryId: string | null, label: string)}
  <ul
    class="daily-task-list"
    aria-label={label}
    use:dragHandleZone={{
      items: visibleTasksForCategory(categoryId),
      flipDurationMs: 150,
      type: 'todo-task',
      useCursorForDetection: true,
      dropTargetStyle: { outline: 'none' },
      dropTargetClasses: ['daily-task-list--drop-target']
    }}
    onconsider={(event) => handleTodoConsider(categoryId, event)}
    onfinalize={(event) => handleTodoFinalize(categoryId, event, categoryId !== null)}
  >
    {#each visibleTasksForCategory(categoryId) as task (task.id)}
      {@render TodoTaskRow(task)}
    {/each}
  </ul>
{/snippet}

<main class="daily-board-shell">
  <aside class="daily-rail" aria-label="Primary navigation">
    <a class="daily-brand" href="/" aria-label="Daily home"><DailyLogo compact /></a>
    <nav class="daily-rail-bottom">
      {#if authState.mode === 'user'}
        <button type="button" aria-label="Open delivery history" onclick={() => void openSecondaryPanel('history')}><History size={20} /></button>
      {/if}
      {#if isAdministrator}
        <a href="/admin" aria-label="Open Admin Panel" title="Open Admin Panel"><ShieldCheck size={20} /></a>
      {/if}
      <button
        type="button"
        aria-label="Open settings"
        disabled={!localSetupHydrated}
        onclick={() => void openSecondaryPanel('settings')}
      ><Settings size={20} /></button>
      {#if authState.mode === 'visitor'}
        <a href="/auth/google" aria-label="Sign in with Google" title="Sign in with Google">
          <LogIn size={19} />
        </a>
      {:else}
        <form method="POST" action="/auth/sign-out">
          <button type="submit" aria-label="Sign out" title="Sign out"><LogOut size={19} /></button>
        </form>
      {/if}
    </nav>
  </aside>

  <section class="daily-board-main" id="task-board">
    {#if form?.accountDeletionSucceeded}
      <div class="daily-notice daily-notice--success" role="status">
        Your Daily account and locally held User data were deleted. You are now in Visitor mode.
      </div>
    {/if}

    <header class="daily-board-header">
      <div class="daily-board-heading">
        <a class="daily-mobile-brand" href="/" aria-label="Daily home"><DailyLogo /></a>
        <div>
          <span>DAILY / {boardDateLabel}</span>
          <h1 class="sr-only">Daily</h1>
        </div>
      </div>
      <div class="daily-header-actions">
        {#if authState.mode === 'visitor'}
          <span class="daily-visitor">Visitor preview</span>
        {/if}
        <label class:daily-delivery--paused={!summaryDeliveryEnabled} class="daily-delivery">
          <input
            id="summary-delivery"
            type="checkbox"
            bind:checked={summaryDeliveryEnabled}
            disabled={!localSetupHydrated}
            onchange={(event) => {
              patchSummaryConfiguration({ summaryDeliveryEnabled: readInputChecked(event) });
            }}
          />
          <span class="daily-switch" aria-hidden="true"><i></i></span>
          <span>
            {#if authState.mode === 'visitor'}
              <strong>{summaryDeliveryEnabled ? 'Preview only' : 'Delivery paused'}</strong>
              <small>Sign in to receive emails</small>
            {:else}
              <strong>{summaryDeliveryEnabled ? 'Delivery on' : 'Delivery paused'}</strong>
              <small>{summaryDeliveryEnabled ? `Daily at ${summaryTime}` : 'No emails will be sent'}</small>
            {/if}
          </span>
        </label>
      </div>
    </header>

    {#if authState.mode === 'visitor'}
      <aside class="daily-visitor-banner" aria-labelledby="visitor-preview-title">
        <span class="daily-visitor-banner__mark" aria-hidden="true"><Mail size={17} /></span>
        <div>
          <strong id="visitor-preview-title">Visitor preview</strong>
          <p>Explore and configure Daily here. Sign in with Google to receive Daily Summaries by email.</p>
        </div>
        <a class="daily-visitor-banner__action" href="/auth/google">
          Sign in with Google <ArrowRight size={15} aria-hidden="true" />
        </a>
      </aside>
    {/if}

    <section class="daily-context-ribbon" id="daily-context" aria-label="Daily Summary sections and delivery">
      <div
        class:daily-context-tile--paused={!enabledSections.weather}
        class="daily-context-tile"
        data-summary-section="weather"
      >
        <button
          class="daily-context-tile__main"
          type="button"
          disabled={!localSetupHydrated}
          aria-label={`Weather. ${weatherLocation?.label ?? 'Choose a city'}`}
          aria-haspopup="dialog"
          onclick={() => void showDialog('weather')}
        >
          <CloudSun size={18} aria-hidden="true" />
          <span>
            <small id="weather-section-status">Weather · {enabledSections.weather ? 'Active' : 'Paused'}</small>
            <strong>{weatherLocation?.label ?? 'Choose a city'}</strong>
          </span>
          <span class="daily-context-tile__arrow" aria-hidden="true"><ChevronRight size={15} /></span>
        </button>
        {@render SummarySectionToggle('weather', 'weather-section-status')}
      </div>
      <div
        class:daily-context-tile--paused={!enabledSections.commute}
        class="daily-context-tile"
        data-summary-section="commute"
      >
        <button
          class="daily-context-tile__main"
          type="button"
          disabled={!localSetupHydrated}
          aria-label={`Commute. ${commuteRoutes.length} ${commuteRoutes.length === 1 ? 'route' : 'routes'}`}
          aria-haspopup="dialog"
          onclick={() => void showDialog('commute')}
        >
          <MapPin size={18} aria-hidden="true" />
          <span>
            <small id="commute-section-status">Commute · {enabledSections.commute ? 'Active' : 'Paused'}</small>
            <strong>{commuteRoutes.length === 0 ? 'Add a route' : `${commuteRoutes.length} ${commuteRoutes.length === 1 ? 'route' : 'routes'}`}</strong>
          </span>
          <span class="daily-context-tile__arrow" aria-hidden="true"><ChevronRight size={15} /></span>
        </button>
        {@render SummarySectionToggle('commute', 'commute-section-status')}
      </div>
      <div
        class:daily-context-tile--paused={!enabledSections.calendar}
        class="daily-context-tile"
        data-summary-section="calendar"
      >
        <button
          class="daily-context-tile__main"
          type="button"
          disabled={!localSetupHydrated}
          aria-label={`Calendar. ${calendarReadiness.status === 'connected' ? `${calendarEventCount} events` : 'Connect Google Calendar'}`}
          aria-haspopup="dialog"
          onclick={() => void showDialog('calendar')}
        >
          <CalendarDays size={18} aria-hidden="true" />
          <span>
            <small id="calendar-section-status">Calendar · {enabledSections.calendar ? 'Active' : 'Paused'}{calendarReadiness.status === 'connected' ? ' · Google' : ' · Not connected'}</small>
            <strong>
              {calendarReadiness.status === 'connected'
                ? `${calendarEventCount} events this week`
                : 'Connect Google Calendar'}
            </strong>
          </span>
          <span class="daily-context-tile__arrow" aria-hidden="true"><ChevronRight size={15} /></span>
        </button>
        {@render SummarySectionToggle('calendar', 'calendar-section-status')}
      </div>
      <div
        class:daily-context-tile--paused={!enabledSections.todo}
        class="daily-context-tile"
        data-summary-section="todo"
      >
        <button
          class="daily-context-tile__main"
          type="button"
          disabled={!localSetupHydrated}
          aria-label="Todo. Open task list"
          onclick={() => document.getElementById('todo-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          <ListTodo size={18} aria-hidden="true" />
          <span>
            <small id="todo-section-status">Todo · {enabledSections.todo ? 'Active' : 'Paused'}</small>
            <strong>Open task list</strong>
          </span>
          <span class="daily-context-tile__arrow" aria-hidden="true"><ChevronRight size={15} /></span>
        </button>
        {@render SummarySectionToggle('todo', 'todo-section-status')}
      </div>
      <button
        class="daily-context-tile daily-context-summary"
        type="button"
        aria-label={`Mail delivery. ${authState.mode === 'visitor' ? 'Sign in is required to receive Daily Summaries' : summaryDeliveryEnabled ? `${summaryTime}, ${userTimeZone}` : 'Paused'}`}
        aria-haspopup="dialog"
        onclick={() => void openSummaryDeliveryDialog()}
      >
        {#if summaryDeliveryEnabled}<Send size={18} />{:else}<Pause size={18} />{/if}
        <span>
          <small>{authState.mode === 'visitor' ? 'Mail delivery · Sign in required' : 'Mail delivery'}</small>
          <strong>{summaryDeliveryEnabled ? `${summaryTime} · ${userTimeZone}` : 'Paused'}</strong>
        </span>
        <ChevronRight size={15} />
      </button>
    </section>

    <form
      class="daily-capture"
      onsubmit={(event) => {
        event.preventDefault();
        void openTaskPlacement();
      }}
    >
      <Plus size={19} aria-hidden="true" />
      <input
        bind:value={newTodoTitle}
        aria-label="New Todo Task"
        placeholder="Capture a task…"
        maxlength="120"
        disabled={!todoControlsReady}
        onkeydown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void openTaskPlacement();
          }
        }}
      />
      <button type="submit" aria-label="Add Todo Task" disabled={!newTodoTitle.trim()}>Continue</button>
    </form>

    <div class="daily-groups-toolbar" id="todo-section">
      <div><h2>Groups</h2><span>{todoCategories.length} active</span></div>
      {#if !categoryComposerOpen}
        <button type="button" onclick={() => void openCategoryComposer()}><Plus size={15} />New group</button>
      {/if}
    </div>

    {#if categoryComposerOpen}
      <form
        class="daily-group-composer"
        onsubmit={(event) => {
          event.preventDefault();
          createTodoCategory();
          if (!newCategoryName) categoryComposerOpen = false;
        }}
      >
        <Plus size={16} />
        <label>
          <span>Group name</span>
          <input
            bind:this={newCategoryInput}
            bind:value={newCategoryName}
            aria-label="New Todo Category"
            maxlength="80"
            placeholder="e.g. Home"
            onkeydown={(event) => {
              if (event.key === 'Escape') {
                categoryComposerOpen = false;
                newCategoryName = '';
              }
            }}
          />
        </label>
        <button type="button" onclick={() => (categoryComposerOpen = false)}>Cancel</button>
        <button type="submit" aria-label="Add Todo Category">Add group</button>
      </form>
    {/if}

    <div
      class="daily-columns"
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
      {#each visibleTodoCategories() as category, categoryIndex (category.id)}
        <section class={`daily-column daily-column--${(categoryIndex % 3) + 1}`} aria-label={`${category.name} Todo Category`}>
          <header>
            {#if editingCategoryId === category.id}
              <input bind:value={editingCategoryName} aria-label="Edit Todo Category" />
              <button type="button" aria-label="Save Todo Category" onclick={saveEditingTodoCategory}><Check size={16} /></button>
            {:else}
              <div>
                <span
                  class="daily-category-mark"
                  role="button"
                  tabindex="0"
                  aria-label={`Move category ${category.name}`}
                  use:dragHandle
                >{categoryIndex + 1}</span>
                <h2>{category.name}</h2>
              </div>
              <div class="daily-column-actions">
                <span>{tasksForCategory(category.id).length}</span>
                <button type="button" aria-label={`Rename ${category.name}`} onclick={() => startEditingTodoCategory(category)}><Pencil size={14} /></button>
                <button type="button" aria-label={`Delete ${category.name}`} onclick={() => void requestTodoCategoryDeletion(category)}><Trash2 size={14} /></button>
              </div>
            {/if}
          </header>
          {@render TodoTaskList(category.id, `${category.name} Todo Tasks`)}
        </section>
      {/each}
    </div>

    <section class="daily-ungrouped" aria-labelledby="ungrouped-heading">
      <header>
        <span class="daily-ungrouped-icon"><Inbox size={16} /></span>
        <div><h2 id="ungrouped-heading">Ungrouped</h2></div>
        <span>{tasksForCategory(null).length}</span>
      </header>
      {@render TodoTaskList(null, 'No Category Todo Tasks')}
    </section>

    {#if authState.mode === 'visitor' ||
      userTodoStateStatusTone === 'error' ||
      userTodoStateStatusTone === 'warning'}
      <p class={`daily-save-state daily-save-state--${authState.mode === 'user' ? userTodoStateStatusTone : localSetupStatusTone}`}>
        {authState.mode === 'user' ? userTodoStateStatus : localSetupStatus}
      </p>
    {/if}
  </section>
</main>

<style>
  :global(body) {
    background: #f7f8f5;
  }

  :global(*) {
    box-sizing: border-box;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .daily-board-shell {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    background: #f7f8f5;
    color: #181a17;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }

  .daily-board-shell :is(button, a, input, select):focus-visible,
  .daily-dialog :is(button, a, input):focus-visible,
  .daily-secondary-dialog :is(button, a, input, select, summary):focus-visible {
    outline: 2px solid #617d49;
    outline-offset: 2px;
  }

  /* Composite fields own the focus ring so the control reads as one surface. */
  .daily-capture input:focus-visible,
  .daily-search-field input:focus-visible,
  .daily-route-editor input:focus-visible {
    outline: 0;
  }

  .daily-rail {
    position: sticky;
    top: 0;
    z-index: 10;
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 18px 0;
    border-right: 1px solid #dfe3dc;
    background: #fff;
  }

  .daily-brand {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    text-decoration: none;
  }

  .daily-mobile-brand {
    display: none;
    flex-shrink: 0;
    text-decoration: none;
  }

  .daily-rail nav {
    display: grid;
    gap: 9px;
    margin-top: 52px;
  }

  .daily-rail nav a,
  .daily-rail nav button {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border: 1px solid transparent;
    border-radius: 9px;
    background: transparent;
    color: #70766d;
    text-decoration: none;
  }

  .daily-rail nav a:hover,
  .daily-rail nav button:hover {
    border-color: #dfe4da;
    background: #f2f4ec;
    color: #4e6b38;
  }

  .daily-rail .daily-rail-bottom {
    margin-top: auto;
  }

  .daily-rail-bottom form {
    margin: 0;
  }

  .daily-rail-bottom > a:last-child,
  .daily-rail-bottom > button:last-child,
  .daily-rail-bottom > form:last-child button {
    border-color: #d8ddd4;
    background: #fff;
    color: #4b5048;
  }

  .daily-board-main {
    min-width: 0;
    padding: 28px clamp(22px, 3.5vw, 58px) 72px;
  }

  .daily-notice {
    margin-bottom: 18px;
    border: 1px solid #b9c9ad;
    border-radius: 9px;
    background: #f0f5eb;
    padding: 12px 14px;
    color: #425637;
    font-size: 12px;
  }

  .daily-board-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 30px;
    margin-bottom: 22px;
  }

  .daily-board-heading {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .daily-board-heading > div > span {
    color: #71776e;
    font-size: 10px;
    font-weight: 650;
    letter-spacing: 0.06em;
  }

  .daily-header-actions {
    display: flex;
    align-items: center;
    gap: 22px;
  }

  .daily-visitor {
    color: #526d3f;
    font-size: 11px;
    font-weight: 700;
  }

  .daily-visitor-banner {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 13px;
    margin: -2px 0 20px;
    border: 1px solid #b9c9ad;
    border-radius: 10px;
    background: #f0f5eb;
    padding: 11px 12px;
    color: #425637;
  }

  .daily-visitor-banner__mark {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px solid #c3d2b8;
    border-radius: 8px;
    background: #fff;
    color: #587542;
  }

  .daily-visitor-banner strong,
  .daily-visitor-banner p {
    display: block;
  }

  .daily-visitor-banner strong {
    color: #33462a;
    font-size: 11px;
    font-weight: 750;
  }

  .daily-visitor-banner p {
    margin: 3px 0 0;
    color: #5c6b55;
    font-size: 10px;
    line-height: 1.45;
  }

  .daily-visitor-banner__action {
    min-height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border: 1px solid #587542;
    border-radius: 8px;
    background: #587542;
    color: #fff;
    padding: 0 11px;
    font-size: 9px;
    font-weight: 750;
    text-decoration: none;
    white-space: nowrap;
  }

  .daily-visitor-banner__action:hover {
    border-color: #496238;
    background: #496238;
  }

  .daily-delivery {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid #d9ded5;
    border-radius: 9px;
    background: #fff;
    padding: 9px 12px;
    cursor: pointer;
  }

  .daily-delivery > input,
  .daily-settings-toggle > input,
  .daily-calendar-sources input {
    position: absolute;
    opacity: 0;
    z-index: 2;
    cursor: pointer;
  }

  .daily-delivery > input {
    top: 9px;
    left: 12px;
    width: 34px;
    height: 20px;
  }

  .daily-delivery strong,
  .daily-delivery small {
    display: block;
  }

  .daily-delivery strong {
    font-size: 11px;
  }

  .daily-delivery small {
    margin-top: 2px;
    color: #747a71;
    font-size: 9px;
  }

  .daily-switch {
    position: relative;
    width: 34px;
    height: 20px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: #617d49;
    transition: background 150ms ease;
  }

  .daily-switch i {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgb(28 33 25 / 0.22);
    transform: translateX(14px);
    transition: transform 150ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .daily-delivery--paused .daily-switch,
  .daily-settings-toggle > input:not(:checked) + .daily-switch,
  .daily-calendar-sources input:not(:checked) + .daily-switch {
    background: #c9cec5;
  }

  .daily-delivery--paused .daily-switch i,
  .daily-settings-toggle > input:not(:checked) + .daily-switch i,
  .daily-calendar-sources input:not(:checked) + .daily-switch i {
    transform: none;
  }

  .daily-context-ribbon {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    border: 1px solid #dfe3dc;
    border-radius: 10px;
    overflow: hidden;
    background: #fff;
  }

  .daily-context-tile {
    --daily-context-toggle-offset: 40px;
    position: relative;
    min-width: 0;
    min-height: 70px;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: center;
    border: 0;
    border-right: 1px solid #e3e6e0;
    background: transparent;
    color: #586053;
    padding: 0 10px 0 16px;
    text-align: left;
  }

  .daily-context-tile__main {
    width: 100%;
    min-width: 0;
    min-height: 70px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border: 0;
    background: transparent;
    color: inherit;
    padding: 12px 0;
    text-align: left;
    cursor: pointer;
  }

  .daily-context-tile__arrow {
    display: inline-grid;
    place-items: center;
    line-height: 0;
    transform: translateX(0);
    transition: transform 150ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .daily-context-tile__main:hover {
    color: #496238;
  }

  .daily-context-tile__main:disabled,
  .daily-context-tile__toggle:disabled {
    cursor: not-allowed;
  }

  .daily-context-tile__toggle {
    position: absolute;
    top: 50%;
    right: 10px;
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border: 1px solid #d8ddd4;
    border-radius: 8px;
    background: #f7f8f5;
    color: #617d49;
    padding: 0;
    cursor: pointer;
    opacity: 0;
    pointer-events: none;
    transform: translateY(-50%) translateX(4px);
    transition: opacity 150ms ease, transform 150ms cubic-bezier(0.16, 1, 0.3, 1), background 150ms ease, border-color 150ms ease, color 150ms ease;
  }

  .daily-context-tile:hover .daily-context-tile__arrow,
  .daily-context-tile:has(.daily-context-tile__toggle:focus-visible) .daily-context-tile__arrow {
    transform: translateX(calc(-1 * var(--daily-context-toggle-offset)));
  }

  .daily-context-tile:hover .daily-context-tile__toggle,
  .daily-context-tile__toggle:focus-visible {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(-50%) translateX(0);
  }

  @media (hover: none) {
    .daily-context-tile__toggle {
      display: none;
    }
  }

  .daily-context-tile__toggle:hover {
    border-color: #b9c9ad;
    background: #eef3ea;
    color: #496238;
  }

  .daily-context-tile--paused {
    background: #faf9f6;
    color: #888d84;
  }

  .daily-context-tile--paused .daily-context-tile__main strong {
    color: #70766d;
  }

  .daily-context-tile--paused .daily-context-tile__toggle {
    border-color: #e2d5c2;
    background: #fffaf2;
    color: #8b6b47;
  }

  .daily-context-tile:last-child {
    border-right: 0;
  }

  .daily-context-tile span {
    min-width: 0;
  }

  .daily-context-tile small,
  .daily-context-tile strong {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .daily-context-tile small {
    margin-bottom: 3px;
    color: #7b8178;
    font-size: 9px;
  }

  .daily-context-tile strong {
    color: #2b3029;
    font-size: 11px;
  }

  .daily-context-summary {
    grid-template-columns: auto minmax(0, 1fr) auto;
    min-height: 70px;
    gap: 10px;
    padding: 12px 16px;
    cursor: pointer;
  }

  button.daily-context-summary:hover {
    background: #f3f5f0;
    color: #496238;
  }

  .daily-capture {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    margin: 22px 0 24px;
    border: 1px solid #cfd5cb;
    border-radius: 10px;
    background: #fff;
    color: #687064;
    padding: 8px 9px 8px 14px;
    box-shadow: 0 6px 18px rgb(30 39 24 / 0.05);
  }

  .daily-capture:focus-within {
    border-color: #6b8556;
    box-shadow: 0 0 0 3px rgb(92 120 69 / 0.12);
  }

  .daily-capture input {
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    padding: 8px 0;
    color: #20241f;
    font-size: 14px;
  }

  .daily-capture button,
  .daily-groups-toolbar button,
  .daily-group-composer button {
    min-height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid #d8ddd4;
    border-radius: 8px;
    background: #fff;
    color: #4f6244;
    padding: 0 12px;
    font-size: 10px;
    font-weight: 750;
  }

  .daily-capture button {
    border-color: #587542;
    background: #587542;
    color: #fff;
  }

  .daily-capture button:disabled {
    border-color: #d9ded5;
    background: #e8ebe5;
    color: #92978f;
  }

  .daily-groups-toolbar,
  .daily-groups-toolbar > div {
    display: flex;
    align-items: center;
  }

  .daily-groups-toolbar {
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .daily-groups-toolbar > div {
    gap: 9px;
  }

  .daily-groups-toolbar h2 {
    margin: 0;
    font-size: 13px;
  }

  .daily-groups-toolbar span {
    color: #7b8178;
    font-size: 9px;
  }

  .daily-group-composer {
    display: grid;
    grid-template-columns: auto minmax(160px, 1fr) auto auto;
    align-items: center;
    gap: 9px;
    margin-bottom: 12px;
    border: 1px solid #cfd5cb;
    border-radius: 9px;
    background: #fff;
    padding: 9px 10px;
    color: #627158;
  }

  .daily-group-composer label span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
  }

  .daily-group-composer input {
    width: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    padding: 8px;
    color: #252a23;
    font-size: 12px;
  }

  .daily-group-composer button:last-child {
    border-color: #587542;
    background: #587542;
    color: #fff;
  }

  .daily-columns {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .daily-column {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
    border: 1px solid #dfe3dc;
    border-radius: 10px;
    background: #fff;
  }

  .daily-column > header {
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border-bottom: 1px solid #e3e6e0;
    padding: 8px 10px;
  }

  .daily-column > header > div,
  .daily-column-actions {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .daily-column h2 {
    margin: 0;
    overflow: hidden;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .daily-category-mark {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: #e5ecdf;
    color: #4e683c;
    cursor: grab;
    font-size: 9px;
    font-weight: 800;
  }

  .daily-column--2 .daily-category-mark {
    background: #f4ead5;
    color: #8c652a;
  }

  .daily-column--3 .daily-category-mark {
    background: #e2e8ef;
    color: #50677e;
  }

  .daily-column-actions > span {
    color: #7c8279;
    font-size: 9px;
  }

  .daily-column-actions button,
  .daily-column > header > button {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: #8a9086;
  }

  .daily-column-actions button:hover {
    background: #f1f3ee;
    color: #4f6244;
  }

  .daily-column > header > input {
    min-width: 0;
    flex: 1;
    border: 1px solid #b9c5b2;
    border-radius: 7px;
    padding: 7px 9px;
  }

  .daily-task-list {
    position: relative;
    flex: 1;
    min-height: 46px;
    margin: 0;
    padding: 0;
    list-style: none;
    transition: background-color 150ms ease, box-shadow 150ms ease;
  }

  .daily-task-list:empty {
    display: grid;
    place-items: center;
  }

  .daily-task-list:empty::before {
    color: #9aa096;
    content: 'Clear';
    font-size: 9px;
  }

  :global(.daily-task-list--drop-target) {
    background: #f5f8f2;
    box-shadow: inset 0 0 0 1px #b1c6a5;
  }

  :global(.daily-task-list--drop-target:empty)::before {
    color: #587542;
    content: 'Drop task here';
    font-size: 10px;
    font-weight: 700;
  }

  .daily-task {
    min-height: 46px;
    display: grid;
    grid-template-columns: 18px 22px 10px minmax(0, 1fr) 32px;
    align-items: center;
    gap: 7px;
    border-bottom: 1px solid #eceeea;
    padding: 4px 5px 4px 7px;
  }

  .daily-task:last-child {
    border-bottom: 0;
  }

  .daily-task--drop-placeholder {
    position: relative;
    border-bottom-color: transparent;
    background: transparent;
  }

  .daily-task--drop-placeholder > * {
    visibility: hidden;
  }

  .daily-task--drop-placeholder::before {
    position: absolute;
    top: 50%;
    right: 12px;
    left: 12px;
    height: 1px;
    background: #83937a;
    content: "";
  }

  .daily-task--drop-placeholder::after {
    position: absolute;
    top: calc(50% - 3px);
    left: 9px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #617d49;
    content: "";
  }

  .daily-task:hover {
    background: #fafbf9;
  }

  .daily-drag-handle {
    display: grid;
    width: 18px;
    height: 32px;
    place-items: center;
    color: #a2a79e;
    cursor: grab;
  }

  .daily-task-check-label {
    position: relative;
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
  }

  .daily-task-check-label input {
    position: absolute;
    inset: 0;
    z-index: 2;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .daily-task-checkbox {
    width: 20px;
    height: 20px;
    display: grid;
    place-items: center;
    border: 1px solid #cfd5cb;
    border-radius: 6px;
    background: #fff;
    color: #587542;
    pointer-events: none;
  }

  .daily-task-checkbox :global(svg) {
    opacity: 0;
  }

  .daily-task-check-label:hover .daily-task-checkbox :global(svg),
  .daily-task-check-label input:focus-visible + .daily-task-checkbox :global(svg) {
    opacity: 1;
  }

  .daily-priority {
    width: 9px;
    height: 9px;
    display: block;
    align-self: center;
    border-radius: 50%;
  }

  .daily-priority--high {
    background: #d84a4a;
  }

  .daily-priority--medium {
    background: #e1ad2f;
  }

  .daily-priority--low {
    border: 1px solid #c8cdc4;
    background: transparent;
  }

  .daily-task-title {
    align-self: center;
    min-width: 0;
    overflow: hidden;
    color: #2c302a;
    font-size: 11px;
    font-weight: 580;
    line-height: 20px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .daily-task-edit {
    align-self: center;
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: #777e73;
    opacity: 0;
  }

  .daily-task:hover .daily-task-edit,
  .daily-task-edit:focus-visible {
    opacity: 1;
  }

  .daily-task--editing {
    grid-template-columns: 22px 10px minmax(0, 1fr) auto;
    align-items: start;
    padding: 7px 6px 8px 28px;
  }

  .daily-task--editing > .daily-task-checkbox,
  .daily-task--editing > .daily-priority {
    margin-top: 7px;
  }

  .daily-task-editor {
    min-width: 0;
  }

  .daily-task-editor > input {
    width: 100%;
    min-height: 34px;
    border: 1px solid #9ead96;
    border-radius: 7px;
    outline: 2px solid rgb(92 120 69 / 0.12);
    padding: 6px 9px;
    color: #252a23;
    font-size: 12px;
    font-weight: 650;
  }

  .daily-priority-picker {
    display: flex;
    gap: 4px;
    margin-top: 5px;
  }

  .daily-priority-picker button {
    min-height: 27px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    color: #737a70;
    padding: 0 7px;
    font-size: 9px;
  }

  .daily-priority-picker button.is-selected {
    border-color: #b8c4b1;
    background: #f2f5ee;
    color: #34422d;
    font-weight: 750;
  }

  .daily-task-edit-actions {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .daily-task-edit-actions button {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 7px;
    background: #edf2e9;
    color: #4f6c3a;
  }

  .daily-task-edit-actions button:last-child {
    background: transparent;
    color: #737a70;
  }

  .daily-ungrouped {
    display: grid;
    grid-template-columns: minmax(180px, 0.3fr) minmax(0, 1fr);
    gap: 14px;
    margin-top: 14px;
    border: 1px dashed #cbd1c7;
    border-radius: 10px;
    background: #f4f6f2;
    padding: 10px;
  }

  .daily-ungrouped > header {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
  }

  .daily-ungrouped-icon {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px dashed #bec5b9;
    border-radius: 8px;
    background: #fff;
    color: #687064;
  }

  .daily-ungrouped h2 {
    margin: 0;
    font-size: 12px;
  }

  .daily-ungrouped > header > span:last-child {
    color: #70766d;
    font-size: 9px;
  }

  .daily-ungrouped .daily-task-list {
    overflow: hidden;
    border: 1px solid #e1e5de;
    border-radius: 8px;
    background: #fff;
  }

  .daily-save-state {
    margin: 14px 2px 0;
    color: #747b71;
    font-size: 9px;
    text-align: right;
  }

  .daily-save-state--success {
    color: #587542;
  }

  .daily-dialog::backdrop,
  .daily-secondary-dialog::backdrop {
    background: rgb(20 24 18 / 0.5);
  }

  .daily-dialog {
    position: fixed;
    inset: 0;
    width: min(410px, calc(100% - 32px));
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
  }

  .daily-dialog-kicker {
    display: block;
    margin-bottom: 7px;
    color: #6d7767;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-align: center;
    text-transform: uppercase;
  }

  .daily-dialog h2 {
    margin: 0 0 17px;
    color: #20251f;
    font-size: 21px;
    font-weight: 730;
    letter-spacing: -0.025em;
    line-height: 1.2;
    text-align: center;
  }

  .daily-dialog fieldset {
    min-width: 0;
    margin: 0;
    border: 0;
    padding: 0;
  }

  .daily-dialog footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 22px;
    border-top: 1px solid #e2e6df;
    padding-top: 16px;
  }

  .daily-dialog footer > button,
  .daily-dialog-heading > button {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border: 1px solid #d9ded5;
    border-radius: 8px;
    background: #fff;
    color: #687064;
  }

  .daily-placement-dialog {
    width: min(360px, calc(100% - 32px));
  }

  .daily-confirm-dialog {
    width: min(380px, calc(100% - 32px));
  }

  .daily-confirm-dialog p {
    margin: -5px auto 0;
    max-width: 32ch;
    color: #687064;
    font-size: 11px;
    line-height: 1.55;
    text-align: center;
  }

  .daily-confirm-dialog footer {
    justify-content: space-between;
  }

  .daily-confirm-dialog footer button {
    font-size: 10px;
    font-weight: 750;
  }

  .daily-confirm-dialog footer .is-danger {
    width: auto;
    min-width: 112px;
    padding: 0 16px;
  }

  .daily-confirm-dialog footer .is-danger {
    border-color: #a75047;
    background: #a75047;
    color: #fff;
  }

  .daily-delivery-dialog {
    width: min(390px, calc(100% - 32px));
  }

  .daily-delivery-form {
    display: grid;
    gap: 16px;
  }

  .daily-time-picker {
    display: grid;
    grid-template-columns: minmax(0, 96px) 20px minmax(0, 96px);
    align-items: center;
    justify-content: center;
    gap: 8px;
    outline: 0;
    padding: 5px 0 2px;
  }

  .daily-time-segment {
    display: grid;
    justify-items: center;
    gap: 3px;
  }

  .daily-time-segment > button:not(.daily-time-value) {
    width: 38px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: #8a9286;
  }

  .daily-time-segment > button:not(.daily-time-value):hover {
    background: #f0f3ed;
    color: #526d3f;
  }

  .daily-time-value {
    width: 88px;
    min-height: 76px;
    border: 1px solid transparent;
    border-radius: 12px;
    background: transparent;
    color: #283025;
    font: 730 45px/1 "Helvetica Neue", Helvetica, Arial, sans-serif;
    letter-spacing: -0.035em;
  }

  .daily-time-value.is-active {
    border-color: #879d77;
    background: #f1f5ed;
    box-shadow: 0 2px 8px rgb(53 69 43 / 0.08);
    color: #24321e;
  }

  .daily-time-colon {
    color: #5f675b;
    font-size: 37px;
    font-weight: 650;
    transform: translateY(-1px);
  }

  .daily-time-zone {
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: #6d7569;
  }

  .daily-time-zone > span {
    min-width: 0;
    text-align: center;
  }

  .daily-time-zone small,
  .daily-time-zone strong {
    display: inline;
    font-size: 9px;
  }

  .daily-time-zone small::after {
    content: " · ";
  }

  .daily-time-zone strong {
    color: #596254;
    font-weight: 650;
  }

  .daily-time-zone > button {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: #788174;
  }

  .daily-time-zone > button:hover {
    background: #f0f3ed;
    color: #526d3f;
  }

  .daily-time-zone label {
    width: 100%;
  }

  .daily-time-zone label > span {
    display: block;
    margin-bottom: 6px;
    color: #687064;
    font-size: 9px;
    font-weight: 750;
  }

  .daily-time-zone select {
    width: 100%;
    min-height: 43px;
    border: 1px solid #d3d9cf;
    border-radius: 9px;
    outline: 0;
    background: #fff;
    color: #4d5549;
    padding: 0 11px;
    font-size: 11px;
  }

  .daily-time-zone select:focus {
    border-color: #6b8556;
    box-shadow: 0 0 0 3px rgb(92 120 69 / 0.14);
  }

  .daily-delivery-form footer button:last-child {
    width: auto;
    min-width: 112px;
    border-color: #587542;
    background: #587542;
    color: #fff;
    padding: 0 14px;
    font-size: 10px;
    font-weight: 750;
  }

  .daily-placement-dialog > h2 {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
  }

  .daily-placement-title {
    margin: 0 0 25px;
    overflow-wrap: anywhere;
    color: #20251f;
    font-size: 18px;
    font-weight: 700;
    line-height: 1.35;
    text-align: center;
  }

  .daily-placement-group,
  .daily-placement-priority {
    display: grid;
    align-items: center;
    justify-content: center;
  }

  .daily-placement-group {
    grid-template-columns: 42px minmax(0, 200px) 42px;
  }

  .daily-placement-priority {
    grid-template-columns: 42px 48px 42px;
    margin-top: 16px !important;
  }

  .daily-placement-group legend,
  .daily-placement-priority legend {
    grid-column: 1 / -1;
    width: 100%;
    margin-bottom: 5px;
    color: #687064;
    font-size: 9px;
    font-weight: 750;
    text-align: center;
  }

  .daily-placement-group button,
  .daily-placement-priority button {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #6b7268;
  }

  .daily-placement-group output {
    min-height: 46px;
    display: grid;
    place-items: center;
    border: 1px solid #cfd5cb;
    border-radius: 9px;
    background: #fff;
    padding: 8px;
    font-size: 14px;
    font-weight: 700;
  }

  .daily-placement-dot {
    width: 32px;
    height: 32px;
    justify-self: center;
    border-radius: 50%;
  }

  .daily-placement-dot--low {
    border: 2px solid #a9afa5;
    background: #fff;
  }

  .daily-placement-dot--medium {
    background: #e1ad2f;
  }

  .daily-placement-dot--high {
    background: #d84a4a;
  }

  .daily-placement-dialog footer button:last-child {
    border-color: #587542;
    background: #587542;
    color: #fff;
  }

  .daily-city-dialog {
    width: min(390px, calc(100% - 32px));
  }

  .daily-search-field {
    min-height: 46px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 9px;
    border: 1px solid #cfd5cb;
    border-radius: 9px;
    background: #fff;
    color: #687064;
    padding: 0 12px;
  }

  .daily-search-field:focus-within {
    border-color: #789464;
    box-shadow: 0 0 0 3px rgb(97 125 73 / 0.14);
  }

  .daily-search-field input {
    min-width: 0;
    border: 0;
    outline: 0;
    padding: 12px 0;
    color: #252a23;
    font-size: 12px;
  }

  .daily-city-results {
    max-height: 260px;
    display: grid;
    gap: 3px;
    margin-top: 10px;
    overflow-y: auto;
  }

  .daily-suggestions-label {
    margin: 12px 0 3px;
    color: #687064;
    font-size: 9px;
    font-weight: 750;
  }

  .daily-location-suggestion {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 34px;
    align-items: stretch;
    gap: 3px;
    border: 1px solid transparent;
    border-radius: 9px;
  }

  .daily-location-suggestion:is(:hover, .is-highlighted) {
    border-color: #d9ded5;
    background: #f0f3eb;
  }

  .daily-location-pick {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #4b5148;
    padding: 8px 7px 8px 10px;
    text-align: left;
  }

  .daily-location-pick:hover,
  .daily-location-suggestion.is-highlighted .daily-location-pick {
    color: #3f5730;
  }

  .daily-location-favorite,
  .daily-inline-favorite {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: #9aa196;
  }

  .daily-location-favorite {
    width: 34px;
  }

  .daily-location-favorite:hover,
  .daily-location-favorite:focus-visible,
  .daily-inline-favorite:hover,
  .daily-inline-favorite:focus-visible,
  .daily-location-favorite.is-saved,
  .daily-inline-favorite.is-saved {
    color: #607d49;
  }

  .daily-saved-location-empty {
    min-height: 112px;
  }

  .daily-city-results strong,
  .daily-city-results small {
    display: block;
  }

  .daily-city-results strong {
    font-size: 11px;
  }

  .daily-city-results small {
    margin-top: 3px;
    color: #6b7367;
    font-size: 9px;
  }

  .daily-dialog-status {
    margin: 12px 0 0;
    color: #737a70;
    font-size: 9px;
    line-height: 1.5;
  }

  .daily-dialog-status--error {
    color: #a24b43;
  }

  .daily-route-list {
    display: grid;
    gap: 4px;
  }

  .daily-route-list > button {
    min-height: 74px;
    display: grid;
    grid-template-columns: 14px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    border: 1px solid transparent;
    border-radius: 9px;
    background: transparent;
    color: #4a5146;
    padding: 10px;
    text-align: left;
  }

  .daily-route-list > button:hover {
    border-color: #d9ded5;
    background: #f0f3eb;
  }

  .daily-route-list strong,
  .daily-route-list small,
  .daily-route-list em {
    display: block;
  }

  .daily-route-list strong {
    font-size: 11px;
  }

  .daily-route-list small {
    margin-top: 3px;
    overflow: hidden;
    color: #6b7367;
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .daily-route-list em {
    margin-top: 6px;
    color: #587542;
    font-size: 8px;
    font-style: normal;
  }

  .daily-route-line {
    position: relative;
    width: 12px;
    height: 38px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
  }

  .daily-route-line::before {
    position: absolute;
    inset: 5px auto;
    width: 1px;
    background: #aab2a5;
    content: "";
  }

  .daily-route-line i {
    z-index: 1;
    width: 7px;
    height: 7px;
    border: 1.5px solid #708164;
    border-radius: 50%;
    background: #fff;
  }

  .daily-route-line i:last-child {
    background: #617d49;
  }

  .daily-add-route {
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
    font-size: 10px;
    font-weight: 700;
  }

  .daily-weekdays {
    margin-top: 20px !important;
  }

  .daily-weekdays legend,
  .daily-route-editor label > span {
    display: block;
    margin-bottom: 6px;
    color: #687064;
    font-size: 9px;
    font-weight: 750;
  }

  .daily-weekdays > div {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 6px;
  }

  .daily-weekdays button {
    aspect-ratio: 1;
    border: 1px solid #d4d9d0;
    border-radius: 50%;
    background: #fff;
    color: #737a70;
    font-size: 9px;
    font-weight: 750;
  }

  .daily-weekdays button.is-selected {
    border-color: #617d49;
    background: #617d49;
    color: #fff;
  }

  .daily-dialog-heading {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) 42px;
    align-items: start;
    margin-bottom: 17px;
  }

  .daily-dialog-heading h2 {
    margin-bottom: 0;
  }

  .daily-route-editor {
    display: grid;
    gap: 14px;
  }

  .daily-route-editor input {
    width: 100%;
    min-height: 43px;
    border: 1px solid #cfd5cb;
    border-radius: 9px;
    outline: 0;
    background: #fff;
    padding: 10px 12px;
    color: #252a23;
    font-size: 11px;
  }

  .daily-route-editor input:focus {
    border-color: #6b8556;
    box-shadow: 0 0 0 2px rgb(92 120 69 / 0.14);
  }

  .daily-route-point small {
    display: block;
    margin-top: 4px;
    color: #587542;
    font-size: 8px;
  }

  .daily-selected-location {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 9px;
    margin-top: 4px;
  }

  .daily-selected-location small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .daily-inline-favorite {
    flex-shrink: 0;
    min-height: 26px;
    padding: 0 7px;
    font-size: 8px;
    font-weight: 750;
  }

  .daily-route-suggestions {
    display: grid;
    gap: 3px;
    margin: -8px 0 0;
    padding: 0;
    list-style: none;
  }

  .daily-route-suggestions > button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border: 1px solid #e0e4dc;
    border-radius: 7px;
    background: #fff;
    padding: 7px 9px;
    font-size: 9px;
    color: #20241f;
    text-align: left;
    cursor: pointer;
  }

  .daily-route-suggestions > button:is(:hover, .is-highlighted) {
    border-color: #90a481;
    background: #f4f7f1;
  }

  .daily-route-suggestions small {
    color: #587542;
    font-weight: 750;
  }

  .daily-route-editor-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    border-top: 1px solid #e2e6df;
    padding-top: 14px;
  }

  .daily-route-editor-actions button {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    border: 1px solid #587542;
    border-radius: 8px;
    background: #587542;
    color: #fff;
    padding: 0 14px;
    font-size: 10px;
    font-weight: 750;
  }

  .daily-route-editor-actions .is-danger {
    margin-right: auto;
    border-color: #e1d2cf;
    background: #fff;
    color: #a24b43;
    padding-inline: 12px;
  }

  .daily-dialog-empty {
    min-height: 150px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 5px;
    color: #737a70;
    text-align: center;
  }

  .daily-dialog-empty strong {
    margin-top: 4px;
    font-size: 11px;
  }

  .daily-dialog-empty span {
    font-size: 9px;
  }

  .daily-google-mark {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    margin: 0 auto 12px;
    border: 1px solid #d9ded5;
    border-radius: 50%;
    background: #fff;
    color: #4285f4;
    font-size: 13px;
    font-weight: 800;
  }

  .daily-calendar-intro {
    max-width: 34ch;
    margin: -5px auto 18px;
    color: #636c60;
    font-size: 10px;
    line-height: 1.55;
    text-align: center;
  }

  .daily-calendar-scope {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 11px;
    border-block: 1px solid #dfe3dc;
    color: #587044;
    padding: 14px 4px;
  }

  .daily-calendar-scope strong,
  .daily-calendar-scope small {
    display: block;
  }

  .daily-calendar-scope strong {
    color: #30352e;
    font-size: 10px;
  }

  .daily-calendar-scope small {
    margin-top: 3px;
    color: #71796e;
    font-size: 8px;
  }

  .daily-google-button {
    min-height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid #587542;
    border-radius: 8px;
    background: #587542;
    color: #fff;
    padding: 0 13px;
    font-size: 10px;
    font-weight: 750;
    text-decoration: none;
  }

  .daily-calendar-dialog {
    width: min(460px, calc(100% - 32px));
  }

  .daily-calendar-agenda {
    max-height: min(510px, calc(100dvh - 184px));
    overflow-y: auto;
  }

  .daily-calendar-agenda section + section {
    margin-top: 17px;
  }

  .daily-calendar-agenda h3 {
    margin: 0 0 6px;
    color: #687064;
    font-size: 9px;
  }

  .daily-calendar-agenda article {
    min-height: 55px;
    display: grid;
    grid-template-columns: 48px 8px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    border-top: 1px solid #e3e7e0;
    padding: 8px 4px;
  }

  .daily-calendar-agenda time {
    color: #626a5f;
    font-size: 9px;
  }

  .daily-calendar-agenda article > i,
  .daily-calendar-sources label > i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--calendar-color);
  }

  .daily-calendar-agenda strong,
  .daily-calendar-agenda small {
    display: block;
  }

  .daily-calendar-agenda strong {
    font-size: 11px;
  }

  .daily-calendar-agenda small {
    margin-top: 3px;
    color: #6f776c;
    font-size: 8px;
  }

  .daily-calendar-dialog footer > span {
    color: #747b71;
    font-size: 9px;
  }

  .daily-calendar-sources {
    border-top: 1px solid #dfe3dc;
  }

  .daily-calendar-sources label {
    position: relative;
    min-height: 60px;
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid #e1e5de;
    padding: 8px 4px;
    cursor: pointer;
  }

  .daily-calendar-sources strong,
  .daily-calendar-sources small {
    display: block;
  }

  .daily-calendar-sources strong {
    font-size: 11px;
  }

  .daily-calendar-sources small {
    margin-top: 3px;
    color: #71796e;
    font-size: 8px;
  }

  .daily-disconnect {
    min-height: 38px;
    display: block;
    margin: 20px 0 0 auto;
    border: 1px solid #e1d2cf;
    border-radius: 8px;
    background: #fff;
    color: #9a473f;
    padding: 0 11px;
    font-size: 9px;
    font-weight: 720;
  }

  .daily-disconnect-confirm {
    margin-top: 20px;
    border-top: 1px solid #e1d2cf;
    padding-top: 16px;
  }

  .daily-disconnect-confirm strong {
    font-size: 11px;
  }

  .daily-disconnect-confirm p {
    color: #756863;
    font-size: 9px;
  }

  .daily-disconnect-confirm > div {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .daily-disconnect-confirm button {
    min-height: 38px;
    border: 1px solid #d9ded5;
    border-radius: 8px;
    background: #fff;
    color: #626a5f;
    padding: 0 11px;
    font-size: 9px;
    font-weight: 720;
  }

  .daily-disconnect-confirm form button {
    border-color: #a75047;
    background: #a75047;
    color: #fff;
  }

  .daily-secondary-dialog {
    position: fixed;
    inset: 0 0 0 auto;
    width: min(430px, 100%);
    height: 100dvh;
    max-height: none;
    margin: 0 0 0 auto;
    overflow-y: auto;
    border: 0;
    background: #f8f9f6;
    color: #20241f;
    padding: 28px;
    box-shadow: -18px 0 48px rgb(5 11 22 / 0.2);
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }

  .daily-secondary-dialog > header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    border-bottom: 1px solid #dbe1d8;
    padding-bottom: 20px;
  }

  .daily-secondary-dialog header small {
    color: #717c6e;
    font-size: 9px;
  }

  .daily-secondary-dialog header h2 {
    margin: 4px 0 0;
    font-size: 27px;
    letter-spacing: -0.03em;
  }

  .daily-secondary-dialog header button {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border: 1px solid #cfd6cc;
    border-radius: 50%;
    background: #fff;
    color: #60685d;
  }

  .daily-history-list {
    display: grid;
    margin: 22px 0 0;
    padding: 0;
    list-style: none;
  }

  .daily-history-list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid #dbe1d8;
    padding: 16px 0;
  }

  .daily-history-list strong,
  .daily-history-list small {
    display: block;
  }

  .daily-history-list strong {
    font-size: 11px;
  }

  .daily-history-list small {
    margin-top: 4px;
    color: #707b6d;
    font-size: 9px;
  }

  .daily-history-list > li > span {
    color: #587542;
    font-size: 9px;
    font-weight: 750;
  }

  .daily-settings-section {
    border-bottom: 1px solid #dbe1d8;
    padding: 22px 0;
  }

  .daily-settings-section h3 {
    margin: 0 0 14px;
    font-size: 12px;
  }

  .daily-settings-section p {
    color: #697166;
    font-size: 10px;
    line-height: 1.55;
  }

  .daily-settings-grid {
    display: grid;
    grid-template-columns: 0.7fr 1.3fr;
    gap: 10px;
  }

  .daily-settings-grid label > span {
    display: block;
    margin-bottom: 5px;
    color: #697166;
    font-size: 8px;
    font-weight: 750;
  }

  .daily-settings-grid input,
  .daily-settings-grid select,
  .daily-delete-account input {
    width: 100%;
    min-height: 40px;
    border: 1px solid #cfd5cb;
    border-radius: 8px;
    background: #fff;
    padding: 0 10px;
    color: #252a23;
    font-size: 10px;
  }

  .daily-theme-choice {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 10px;
  }

  .daily-theme-choice label {
    min-height: 40px;
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid #d8ddd4;
    border-radius: 8px;
    background: #fff;
    padding: 0 10px;
    font-size: 9px;
  }

  .daily-settings-toggle {
    position: relative;
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-top: 1px solid #e1e5de;
    cursor: pointer;
    font-size: 10px;
  }

  .daily-settings-toggle .daily-switch {
    margin-left: auto;
  }

  .daily-settings-toggle > input,
  .daily-calendar-sources input {
    top: 50%;
    right: 0;
    width: 34px;
    height: 20px;
    margin: 0;
    transform: translateY(-50%);
  }

  .daily-preview-details {
    border-bottom: 1px solid #dbe1d8;
    padding: 18px 0;
  }

  .daily-preview-details summary {
    cursor: pointer;
    font-size: 11px;
    font-weight: 750;
  }

  .daily-preview-details > div {
    margin-top: 14px;
    overflow: hidden;
    border: 1px solid #e1e5de;
    border-radius: 8px;
    background: #fff;
    padding: 10px;
    font-size: 9px;
  }

  .daily-preview-details > div > span {
    display: inline-block;
    margin-bottom: 8px;
    border-radius: 4px;
    background: #eef2ea;
    padding: 4px 6px;
    color: #587542;
  }

  .daily-preview-details button,
  .daily-settings-section button,
  .daily-settings-section a {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border: 1px solid #d8ddd4;
    border-radius: 8px;
    background: #fff;
    color: #4f6244;
    padding: 0 12px;
    font-size: 9px;
    font-weight: 750;
    text-decoration: none;
  }

  .daily-delete-account {
    display: grid;
    gap: 8px;
    margin-top: 20px;
    border-top: 1px solid #e4d4d1;
    padding-top: 16px;
  }

  .daily-delete-account h4 {
    margin: 0;
    color: #8f4039;
    font-size: 11px;
  }

  .daily-delete-account label {
    color: #756863;
    font-size: 8px;
  }

  .daily-delete-account button {
    border-color: #a75047;
    background: #a75047;
    color: #fff;
  }

  @media (max-width: 1120px) {
    .daily-context-ribbon {
      grid-template-columns: repeat(2, 1fr);
    }

    .daily-context-tile:nth-child(even) {
      border-right: 0;
    }

    .daily-context-tile:nth-child(-n + 4) {
      border-bottom: 1px solid #e3e6e0;
    }
  }

  @media (max-width: 820px) {
    .daily-board-shell {
      display: block;
    }

    .daily-rail {
      position: fixed;
      top: auto;
      bottom: 0;
      width: 100%;
      height: 64px;
      flex-direction: row;
      justify-content: space-around;
      padding: 0 8px;
      border-top: 1px solid #dfe3dc;
      border-right: 0;
    }

    .daily-brand {
      display: none;
    }

    .daily-mobile-brand {
      display: inline-flex;
    }

    .daily-rail nav,
    .daily-rail .daily-rail-bottom {
      display: flex;
      margin: 0;
    }

    .daily-rail nav a,
    .daily-rail nav button {
      width: 44px;
      height: 44px;
    }

    .daily-board-main {
      padding: 20px 16px 100px;
    }

    .daily-board-header {
      align-items: flex-start;
      flex-direction: column;
      gap: 15px;
    }

    .daily-board-heading {
      gap: 12px;
    }

    .daily-header-actions {
      width: 100%;
      justify-content: space-between;
    }

    .daily-visitor-banner {
      grid-template-columns: auto minmax(0, 1fr);
      align-items: start;
    }

    .daily-visitor-banner__action {
      grid-column: 2;
      justify-self: start;
    }

    .daily-context-ribbon {
      display: flex;
      overflow-x: auto;
      scrollbar-width: none;
      scroll-snap-type: x mandatory;
    }

    .daily-context-ribbon::-webkit-scrollbar {
      display: none;
    }

    .daily-context-tile {
      min-width: 210px;
      border-bottom: 0 !important;
      scroll-snap-align: start;
    }

    .daily-columns {
      grid-template-columns: 1fr;
    }

    .daily-ungrouped {
      grid-template-columns: 1fr;
    }

    .daily-column-actions button,
    .daily-task-edit,
    .daily-task-edit-actions button {
      width: 44px;
      height: 44px;
    }

    .daily-task-edit {
      opacity: 1;
    }

    .daily-task {
      grid-template-columns: 18px 30px 10px minmax(0, 1fr) 44px;
      min-height: 56px;
    }

    .daily-task-checkbox {
      width: 24px;
      height: 24px;
    }

    .daily-task--editing {
      grid-template-columns: 24px 10px minmax(0, 1fr) 44px;
      padding-left: 8px;
    }
  }

  @media (max-width: 500px) {
    .daily-header-actions {
      align-items: stretch;
      flex-direction: column;
    }

    .daily-visitor-banner {
      margin-bottom: 16px;
    }

    .daily-delivery {
      justify-content: space-between;
      flex-direction: row-reverse;
    }

    .daily-delivery > input {
      right: 12px;
      left: auto;
    }

    .daily-capture {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .daily-capture button {
      grid-column: 1 / -1;
      min-height: 44px;
    }

    .daily-group-composer {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .daily-group-composer button {
      min-height: 44px;
    }

    .daily-group-composer button:nth-last-child(2) {
      grid-column: 1 / 2;
    }

    .daily-dialog {
      width: calc(100% - 24px);
      max-height: calc(100dvh - 24px);
      padding: 18px 14px;
    }

    .daily-secondary-dialog {
      padding: 22px 18px 90px;
    }

    .daily-settings-grid {
      grid-template-columns: 1fr;
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

{#if categoryPendingDeletion}
  <dialog
    bind:this={categoryDeletionDialog}
    class="daily-dialog daily-confirm-dialog"
    aria-labelledby="category-deletion-title"
    oncancel={(event) => {
      event.preventDefault();
      cancelTodoCategoryDeletion();
    }}
  >
    <h2 id="category-deletion-title">Delete group?</h2>
    <p>
      “{categoryPendingDeletion.name}” and all tasks inside it will be permanently deleted.
    </p>
    <footer>
      <button
        bind:this={categoryDeletionCloseButton}
        type="button"
        aria-label="Close delete group dialog"
        onclick={cancelTodoCategoryDeletion}
      ><X size={20} /></button>
      <button class="is-danger" type="button" onclick={confirmTodoCategoryDeletion}>Delete group</button>
    </footer>
  </dialog>
{/if}

{#if summaryDeliveryDialogOpen}
  <dialog
    bind:this={summaryDeliveryDialog}
    class="daily-dialog daily-delivery-dialog"
    aria-labelledby="summary-delivery-dialog-title"
    oncancel={(event) => {
      event.preventDefault();
      closeSummaryDeliveryDialog();
    }}
  >
    <span class="daily-dialog-kicker">Mail delivery</span>
    <h2 id="summary-delivery-dialog-title">Delivery time</h2>
    <form
      class="daily-delivery-form"
      onsubmit={(event) => {
        event.preventDefault();
        saveSummaryDeliveryTime();
      }}
    >
      <div
        class="daily-time-picker"
        role="group"
        aria-label="Mail delivery time"
      >
        <div class="daily-time-segment">
          <button type="button" aria-label="Increase hours" onclick={() => adjustSummaryTime('hours', 1)}>
            <ArrowUp size={18} />
          </button>
          <button
            bind:this={summaryDeliveryHoursButton}
            type="button"
            class="daily-time-value"
            class:is-active={activeSummaryTimePart === 'hours'}
            role="spinbutton"
            aria-label="Hours"
            aria-valuemin="0"
            aria-valuemax="23"
            aria-valuenow={summaryTimeParts().hours}
            data-active={activeSummaryTimePart === 'hours'}
            onclick={() => activateSummaryTimePart('hours')}
            onkeydown={(event) => handleSummaryTimeKeydown('hours', event)}
          >{String(summaryTimeParts().hours).padStart(2, '0')}</button>
          <button type="button" aria-label="Decrease hours" onclick={() => adjustSummaryTime('hours', -1)}>
            <ArrowDown size={18} />
          </button>
        </div>
        <span class="daily-time-colon" aria-hidden="true">:</span>
        <div class="daily-time-segment">
          <button type="button" aria-label="Increase minutes" onclick={() => adjustSummaryTime('minutes', 1)}>
            <ArrowUp size={18} />
          </button>
          <button
            bind:this={summaryDeliveryMinutesButton}
            type="button"
            class="daily-time-value"
            class:is-active={activeSummaryTimePart === 'minutes'}
            role="spinbutton"
            aria-label="Minutes"
            aria-valuemin="0"
            aria-valuemax="59"
            aria-valuenow={summaryTimeParts().minutes}
            data-active={activeSummaryTimePart === 'minutes'}
            onclick={() => activateSummaryTimePart('minutes')}
            onkeydown={(event) => handleSummaryTimeKeydown('minutes', event)}
          >{String(summaryTimeParts().minutes).padStart(2, '0')}</button>
          <button type="button" aria-label="Decrease minutes" onclick={() => adjustSummaryTime('minutes', -1)}>
            <ArrowDown size={18} />
          </button>
        </div>
      </div>
      <div class="daily-time-zone">
        {#if summaryTimeZoneEditorOpen}
          <label>
            <span>Time zone</span>
            <select
              bind:this={summaryDeliveryTimeZoneSelect}
              bind:value={userTimeZoneDraft}
              aria-label="User Time Zone"
            >
              {#each supportedTimeZones as timeZone}
                <option value={timeZone}>
                  {timeZone}{timeZone === systemTimeZone() ? ' · System' : ''}
                </option>
              {/each}
            </select>
          </label>
        {:else}
          <span><small>Time zone</small><strong>{userTimeZoneDraft}</strong></span>
          <button type="button" aria-label="Edit time zone" onclick={() => void editSummaryTimeZone()}>
            <Pencil size={14} />
          </button>
        {/if}
      </div>
      <footer>
        <button type="button" aria-label="Cancel delivery time" onclick={closeSummaryDeliveryDialog}><X size={20} /></button>
        <button type="submit" disabled={!summaryTimeSchema.safeParse(summaryTimeDraft).success}>
          Save delivery time
        </button>
      </footer>
    </form>
  </dialog>
{/if}

{#if taskPlacementOpen}
  <dialog
    bind:this={taskPlacementDialog}
    class="daily-dialog daily-placement-dialog"
    aria-labelledby="task-placement-title"
    tabindex="-1"
    onkeydown={handleTaskPlacementKeydown}
    oncancel={(event) => {
      event.preventDefault();
      closeTaskPlacement();
    }}
  >
    <span class="daily-dialog-kicker">New task</span>
    <h2 id="task-placement-title">Add task</h2>
    <p class="daily-placement-title">{newTodoTitle}</p>
    <fieldset class="daily-placement-group">
      <legend>Group</legend>
      <button type="button" aria-label="Previous group" onclick={() => cycleTaskPlacementCategory(-1)}><ArrowUp size={18} /></button>
      <output>{selectedTaskCategoryName}</output>
      <button type="button" aria-label="Next group" onclick={() => cycleTaskPlacementCategory(1)}><ArrowDown size={18} /></button>
    </fieldset>
    <fieldset class="daily-placement-priority">
      <legend>Urgency</legend>
      <button type="button" aria-label="Previous urgency" onclick={() => cycleTaskPlacementUrgency(-1)}><ArrowLeft size={18} /></button>
      <output class={`daily-placement-dot daily-placement-dot--${newTodoUrgency}`}>
        <span class="sr-only">{urgencyLabel(newTodoUrgency)}</span>
      </output>
      <button type="button" aria-label="Next urgency" onclick={() => cycleTaskPlacementUrgency(1)}><ArrowRight size={18} /></button>
    </fieldset>
    <footer>
      <button type="button" aria-label="Cancel adding task" onclick={closeTaskPlacement}><X size={20} /></button>
      <button type="button" aria-label="Confirm adding task" onclick={confirmTaskPlacement}><Check size={20} /></button>
    </footer>
  </dialog>
{/if}

{#if weatherDialogOpen}
  <dialog
    bind:this={weatherDialog}
    class="daily-dialog daily-city-dialog"
    aria-labelledby="weather-dialog-title"
    oncancel={(event) => {
      event.preventDefault();
      closeWeatherDialog();
    }}
  >
    <span class="daily-dialog-kicker">Weather</span>
    <h2 id="weather-dialog-title">Choose a city</h2>
    <label class="daily-search-field">
      <Search size={17} />
      <input
        id="weather-location-search"
        bind:value={weatherLocationSearchQuery}
        aria-label="City Search"
        role="combobox"
        aria-controls="weather-location-suggestions"
        aria-expanded={weatherLocationSearchResults.length > 0}
        aria-autocomplete="list"
        aria-activedescendant={activeWeatherLocationSuggestion >= 0
          ? `weather-location-option-${activeWeatherLocationSuggestion}`
          : undefined}
        placeholder="Search city or place"
        oninput={(event) => {
          weatherLocationSearchQuery = readInputValue(event);
          suggestWeatherLocations();
        }}
        onkeydown={(event) => {
          if (event.key === 'ArrowDown' && weatherLocationSearchResults.length) {
            event.preventDefault();
            activeWeatherLocationSuggestion =
              (activeWeatherLocationSuggestion + 1) % weatherLocationSearchResults.length;
          }
          if (event.key === 'ArrowUp' && weatherLocationSearchResults.length) {
            event.preventDefault();
            activeWeatherLocationSuggestion =
              (activeWeatherLocationSuggestion - 1 + weatherLocationSearchResults.length) %
              weatherLocationSearchResults.length;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            const suggestion = weatherLocationSearchResults[activeWeatherLocationSuggestion];
            if (suggestion) void saveWeatherLocation(suggestion);
            else void searchWeatherLocation();
          }
          if (event.key === 'Escape') closeWeatherDialog();
        }}
      />
    </label>
    {#if weatherLocationSearchQuery.trim().length === 0 && savedWeatherCities.length > 0}
      <p class="daily-suggestions-label">Saved Weather Cities</p>
    {:else if weatherLocationSearchQuery.trim().length > 0 && weatherLocationSearchResults.length > 0}
      <p class="daily-suggestions-label">Search results</p>
    {/if}
    <div class="daily-city-results" id="weather-location-suggestions" role="listbox" aria-label="Weather Location search results">
      {#each weatherLocationSearchResults as result, index}
        <div class="daily-location-suggestion" class:is-highlighted={index === activeWeatherLocationSuggestion}>
          <button
            id={`weather-location-option-${index}`}
            class="daily-location-pick"
            type="button"
            role="option"
            aria-selected={weatherLocation?.label === result.label}
            onclick={() => void saveWeatherLocation(result)}
          >
            <MapPin size={16} />
            <span>
              <strong>{result.label}</strong>
              {#if weatherLocationSearchQuery.trim().length > 0}
                <small>{result.latitude.toFixed(4)}, {result.longitude.toFixed(4)}</small>
              {/if}
            </span>
            {#if weatherLocation?.label === result.label}<Check size={16} />{/if}
          </button>
          <button
            class="daily-location-favorite"
            class:is-saved={isSavedWeatherCity(result)}
            type="button"
            aria-label={savedWeatherCityButtonLabel(result)}
            aria-pressed={isSavedWeatherCity(result)}
            title={savedWeatherCityButtonLabel(result)}
            onclick={() => void toggleSavedWeatherCity(result)}
          ><Star size={15} fill={isSavedWeatherCity(result) ? 'currentColor' : 'none'} /></button>
        </div>
      {/each}
    </div>
    {#if weatherLocationSearchQuery.trim().length === 0 && savedWeatherCities.length === 0}
      <div class="daily-dialog-empty daily-saved-location-empty"><Star size={20} /><strong>No Saved Weather Cities yet</strong><span>Choose a city, then save it with the star.</span></div>
    {/if}
    {#if weatherLocationStatusTone === 'error' || weatherLocationStatusTone === 'warning'}
      <p class="daily-dialog-status" role="alert">{weatherLocationStatus}</p>
    {/if}
    <footer><button type="button" aria-label="Close city picker" onclick={closeWeatherDialog}><X size={20} /></button></footer>
  </dialog>
{/if}

{#if commuteDialogOpen}
  <dialog
    bind:this={commuteDialog}
    class="daily-dialog daily-commute-dialog"
    aria-labelledby="commute-dialog-title"
    oncancel={(event) => {
      event.preventDefault();
      closeCommuteDialog();
    }}
  >
    {#if !commuteEditorOpen}
      <span class="daily-dialog-kicker">Commute</span>
      <h2 id="commute-dialog-title">Your routes</h2>
      <div class="daily-route-list" aria-label="Saved Commute Routes">
        {#each commuteRoutes as route (route.id)}
          <button type="button" onclick={() => editCommuteRoute(route)}>
            <span class="daily-route-line"><i></i><i></i></span>
            <span>
              <strong>{route.name}</strong>
              <small>{route.origin.label} → {route.destination.label}</small>
              <em>
                {route.days.map((day) => day.slice(0, 2).toUpperCase()).join(' · ') || 'No days'}
                · {route.enabled ? 'Enabled' : 'Paused'}
              </em>
            </span>
            <Pencil size={15} />
          </button>
        {:else}
          <div class="daily-dialog-empty"><MapPin size={20} /><strong>No routes yet</strong><span>Add a route to include commute updates.</span></div>
        {/each}
      </div>
      <button class="daily-add-route" type="button" onclick={startNewCommuteRoute}><Plus size={17} />Add route</button>
      <footer><button type="button" aria-label="Close commute routes" onclick={closeCommuteDialog}><X size={20} /></button></footer>
    {:else}
      <header class="daily-dialog-heading">
        <button type="button" aria-label="Back to routes" onclick={clearCommuteRouteDraft}><ArrowLeft size={18} /></button>
        <div><span class="daily-dialog-kicker">Commute</span><h2 id="commute-dialog-title">{editingCommuteRouteId ? 'Edit route' : 'Add route'}</h2></div>
        <span></span>
      </header>
      <form
        class="daily-route-editor"
        onsubmit={(event) => {
          event.preventDefault();
          void saveCommuteRoute();
        }}
      >
        <label>
          <span>Route name</span>
          <input bind:value={commuteRouteName} aria-label="Route Name" placeholder="Morning commute" />
        </label>
        {#each [
          { kind: 'origin' as const, label: 'Commute Origin' },
          { kind: 'destination' as const, label: 'Commute Destination' }
        ] as selection}
          {@const selectedPoint = selection.kind === 'origin' ? commuteOrigin : commuteDestination}
          <div class="daily-route-point">
            <label>
              <span>{selection.label}</span>
              <input
                aria-label={`${selection.label} Search`}
                value={commuteSearchQueries[selection.kind]}
                role="combobox"
                aria-autocomplete="list"
                aria-controls={`commute-${selection.kind}-suggestions`}
                aria-expanded={activeCommuteSearchField === selection.kind && (commuteSearchResults[selection.kind].length > 0 || (commuteSearchQueries[selection.kind].trim().length === 0 && savedCommuteAddresses.length > 0))}
                aria-activedescendant={activeCommuteSuggestion[selection.kind] >= 0
                  ? commuteSearchQueries[selection.kind].trim().length === 0
                    ? `commute-${selection.kind}-saved-option-${activeCommuteSuggestion[selection.kind]}`
                    : `commute-${selection.kind}-option-${activeCommuteSuggestion[selection.kind]}`
                  : undefined}
                placeholder={selection.kind === 'origin' ? 'Enter starting point' : 'Enter destination'}
                onfocus={() => {
                  activeCommuteSearchField = selection.kind;
                  if (commuteSearchQueries[selection.kind].trim().length === 0) {
                    showSavedCommuteLocations(selection.kind);
                  }
                }}
                oninput={(event) => {
                  commuteSearchQueries[selection.kind] = readInputValue(event);
                  suggestCommutePoints(selection.kind);
                }}
                onkeydown={(event) => handleCommuteSearchKeydown(event, selection.kind)}
              />
            </label>
            {#if selectedPoint}
              <div class="daily-selected-location">
                <small>{selectedPoint.label}</small>
                <button
                  class="daily-inline-favorite"
                  class:is-saved={isSavedCommuteAddress(selectedPoint)}
                  type="button"
                  aria-label={savedCommuteAddressButtonLabel(selectedPoint)}
                  aria-pressed={isSavedCommuteAddress(selectedPoint)}
                  title={savedCommuteAddressButtonLabel(selectedPoint)}
                  onclick={() => void toggleSavedCommuteAddress(selectedPoint)}
                ><Star size={13} fill={isSavedCommuteAddress(selectedPoint) ? 'currentColor' : 'none'} />{isSavedCommuteAddress(selectedPoint) ? 'Saved' : 'Save address'}</button>
              </div>
            {/if}
          </div>
          {#if activeCommuteSearchField === selection.kind && commuteSearchQueries[selection.kind].trim().length === 0 && savedCommuteAddresses.length > 0}
            <p class="daily-suggestions-label">Saved Commute Addresses</p>
            <div
              id={`commute-${selection.kind}-suggestions`}
              class="daily-city-results"
              role="listbox"
              aria-label={`${selection.label} Saved Commute Addresses`}
            >
              {#each savedCommuteAddresses as location, index}
                <div class="daily-location-suggestion" class:is-highlighted={index === activeCommuteSuggestion[selection.kind]}>
                  <button
                    id={`commute-${selection.kind}-saved-option-${index}`}
                    class="daily-location-pick"
                    type="button"
                    role="option"
                    aria-label={`${location.label} Saved Commute Address`}
                    aria-selected={index === activeCommuteSuggestion[selection.kind]}
                    onclick={() => selectSavedCommuteLocation(selection.kind, location)}
                  >
                    <MapPin size={16} />
                    <span><strong>{location.label}</strong></span>
                  </button>
                  <button
                    class="daily-location-favorite"
                    class:is-saved={isSavedCommuteAddress(location)}
                    type="button"
                    aria-label={savedCommuteAddressButtonLabel(location)}
                    aria-pressed="true"
                    title={savedCommuteAddressButtonLabel(location)}
                    onclick={() => void toggleSavedCommuteAddress(location)}
                  ><Star size={14} fill="currentColor" /></button>
                </div>
              {/each}
            </div>
          {/if}
          {#if commuteSearchResults[selection.kind].length}
            <div
              id={`commute-${selection.kind}-suggestions`}
              class="daily-route-suggestions"
              role="listbox"
              aria-label={`${selection.label} suggestions`}
            >
              {#each commuteSearchResults[selection.kind] as suggestion, index}
                <button
                  id={`commute-${selection.kind}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeCommuteSuggestion[selection.kind]}
                  class:is-highlighted={index === activeCommuteSuggestion[selection.kind]}
                  aria-label={`Select ${suggestion.label}`}
                  onclick={() => void selectCommuteSuggestion(selection.kind, suggestion)}
                >
                  <span>{suggestion.label}</span>
                  <small>Select</small>
                </button>
              {/each}
            </div>
          {/if}
        {/each}
        <fieldset class="daily-weekdays" aria-label="Route days">
          <legend>Route days</legend>
          <div>
            {#each commuteDayValues as day}
              <button
                class:is-selected={commuteRouteDays.includes(day)}
                type="button"
                aria-label={`${day[0]?.toUpperCase()}${day.slice(1)} route day`}
                aria-pressed={commuteRouteDays.includes(day)}
                onclick={() => toggleCommuteRouteDay(day, !commuteRouteDays.includes(day))}
              >{day.slice(0, 1).toUpperCase()}</button>
            {/each}
          </div>
        </fieldset>
        <div class="daily-route-editor-actions">
          {#if editingCommuteRouteId}
            <button class="is-danger" type="button" aria-label={`Delete ${commuteRouteName}`} onclick={() => {
              const route = commuteRoutes.find((candidate) => candidate.id === editingCommuteRouteId);
              if (route) deleteCommuteRoute(route);
            }}><Trash2 size={17} /></button>
          {/if}
          <button type="submit"><Check size={17} />Save route</button>
        </div>
      </form>
      <p class={`daily-dialog-status daily-dialog-status--${commuteRouteStatusTone}`}>{commuteRouteStatus}</p>
    {/if}
  </dialog>
{/if}

{#if calendarDialogOpen}
  <dialog
    bind:this={calendarDialog}
    class="daily-dialog daily-calendar-dialog"
    aria-labelledby="calendar-dialog-title"
    oncancel={(event) => {
      event.preventDefault();
      closeCalendarDialog();
    }}
  >
    {#if calendarReadiness.status !== 'connected'}
      <span class="daily-google-mark" aria-hidden="true">G</span>
      <span class="daily-dialog-kicker">Google Calendar</span>
      <h2 id="calendar-dialog-title">Connect your calendar</h2>
      <p class="daily-calendar-intro">Continue to Google and allow read-only access to your calendars.</p>
      <div class="daily-calendar-scope"><CalendarDays size={18} /><span><strong>View calendar events</strong><small>Daily cannot create, edit or delete events.</small></span></div>
      <footer>
        <button type="button" aria-label="Close calendar" onclick={closeCalendarDialog}><X size={20} /></button>
        <a class="daily-google-button" href={authState.mode === 'user' ? '/auth/google/calendar' : '/auth/google'}>
          Continue with Google <ArrowRight size={17} />
        </a>
      </footer>
    {:else}
      <header class="daily-dialog-heading">
        <span></span>
        <div>
          <span class="daily-dialog-kicker">Google Calendar</span>
          <h2 id="calendar-dialog-title">Next 7 days</h2>
        </div>
        {#if authState.mode === 'user'}
          <button type="button" aria-label="Calendar settings" onclick={() => void openCalendarSettings()}><Settings size={18} /></button>
        {:else}<span></span>{/if}
      </header>
      <div class="daily-calendar-agenda">
        {#each calendarAgendaDays as day}
          <section>
            <h3>{day.label}</h3>
            {#each day.events as event}
              <article>
                <time>{event.time}</time>
                <i style={`--calendar-color:${event.calendarColor}`}></i>
                <span><strong>{event.title}</strong><small>{event.calendarLabel}</small></span>
              </article>
            {/each}
          </section>
        {:else}
          <div class="daily-dialog-empty"><CalendarDays size={20} /><strong>No events to show</strong><span>Your next seven days are clear.</span></div>
        {/each}
      </div>
      <footer><button type="button" aria-label="Close calendar" onclick={closeCalendarDialog}><X size={20} /></button><span>{calendarEventCount} events</span></footer>
    {/if}
  </dialog>
{/if}

{#if calendarSettingsOpen}
  <dialog
    bind:this={calendarSettingsDialog}
    class="daily-dialog daily-calendar-dialog"
    aria-labelledby="calendar-settings-title"
    oncancel={(event) => {
      event.preventDefault();
      void returnToCalendarAgenda();
    }}
  >
    <header class="daily-dialog-heading">
      <button type="button" aria-label="Back to events" onclick={() => void returnToCalendarAgenda()}><ArrowLeft size={18} /></button>
      <div><span class="daily-dialog-kicker">Google Calendar</span><h2 id="calendar-settings-title">Calendars</h2></div>
      <span></span>
    </header>
    <div class="daily-calendar-sources" role="group" aria-label="Selected Calendars">
      {#each selectedCalendarConfiguration?.calendars ?? [] as calendar}
        <label for={`selected-calendar-${calendar.id}`}>
          <i style={`--calendar-color:${calendar.backgroundColor ?? '#617d49'}`}></i>
          <span><strong>{calendar.summary}</strong><small>{calendar.primary ? 'Primary calendar' : 'Google calendar'}</small></span>
          <input
            id={`selected-calendar-${calendar.id}`}
            type="checkbox"
            checked={calendar.selected}
            onchange={(event) => void toggleSelectedCalendar(calendar.id, readInputChecked(event))}
          />
          <span class="daily-switch" aria-hidden="true"><i></i></span>
        </label>
      {/each}
    </div>
    <p class="daily-dialog-status">{selectedCalendarStatus}</p>
    {#if calendarDisconnectConfirmation}
      <div class="daily-disconnect-confirm" role="alert">
        <strong>Disconnect Google Calendar?</strong>
        <p>Calendar Events will no longer appear in Daily.</p>
        <div>
          <button type="button" onclick={() => (calendarDisconnectConfirmation = false)}>Keep connected</button>
          <form method="POST" action="?/disconnectGoogleCalendar">
            <button type="submit">Disconnect</button>
          </form>
        </div>
      </div>
    {:else}
      <button class="daily-disconnect" type="button" onclick={() => (calendarDisconnectConfirmation = true)}>Disconnect Google Calendar</button>
    {/if}
  </dialog>
{/if}

{#if secondaryPanel}
  <dialog
    bind:this={secondaryDialog}
    class="daily-secondary-dialog"
    aria-labelledby="secondary-panel-title"
    onclick={handleSecondaryPanelClick}
    oncancel={(event) => {
      event.preventDefault();
      closeSecondaryPanel();
    }}
  >
    <header>
      <div><small>Daily</small><h2 id="secondary-panel-title">{secondaryPanel === 'settings' ? 'Settings' : 'Delivery history'}</h2></div>
      <button type="button" aria-label="Close panel" onclick={closeSecondaryPanel}><X size={19} /></button>
    </header>

    {#if secondaryPanel === 'history'}
      {#if deliveryRecords.length}
        <ul class="daily-history-list" aria-label="Delivery Record History">
          {#each deliveryRecords as record}
            {@const presentation = deliveryStatusPresentationFor(record.deliveryStatus)}
            <li>
              <div>
                <strong>{deliveryAttemptLabel(record.attemptType)} Daily Summary</strong>
                <small>{deliveryTimeLabel(record.attemptType === 'scheduled' ? record.scheduledAt : record.requestedAt)}</small>
              </div>
              <span>{presentation.label}</span>
            </li>
          {/each}
        </ul>
      {:else}
        <div class="daily-dialog-empty"><History size={20} /><strong>No Delivery Records</strong><span>No Delivery Records in the last 30 days.</span></div>
      {/if}
    {:else}
      <section class="daily-settings-section">
        <h3>Summary</h3>
        <div class="daily-settings-grid">
          <label>
            <span>Summary Time</span>
            <input
              aria-label="Summary Time"
              value={summaryTimeInput}
              oninput={(event) => updateSummaryTimeInput(readInputValue(event))}
            />
          </label>
          <label>
            <span>User Time Zone</span>
            <select
              aria-label="User Time Zone"
              bind:value={userTimeZone}
              onchange={() => patchSummaryConfiguration({ userTimeZone })}
            >
              {#each supportedTimeZones as timeZone}<option value={timeZone}>{timeZone}</option>{/each}
            </select>
          </label>
        </div>
        <div class="daily-theme-choice" role="radiogroup" aria-label="Summary Theme">
          <label><input type="radio" name="daily-theme" value="light" bind:group={summaryTheme} onchange={() => patchSummaryConfiguration({ summaryTheme: 'light' })} />Light Theme</label>
          <label><input type="radio" name="daily-theme" value="dark" bind:group={summaryTheme} onchange={() => patchSummaryConfiguration({ summaryTheme: 'dark' })} />Dark Theme</label>
        </div>
      </section>
      <section class="daily-settings-section">
        <h3>Summary Sections</h3>
        {#each summarySections as section}
          <label class="daily-settings-toggle" for={`${section.key}-section-board`}>
            <span>{section.label} Section</span>
            <input
              id={`${section.key}-section-board`}
              type="checkbox"
              checked={enabledSections[section.key]}
              onchange={(event) => toggleSection(section.key, readInputChecked(event))}
            />
            <span class="daily-switch" aria-hidden="true"><i></i></span>
          </label>
        {/each}
      </section>
      <details class="daily-preview-details">
        <summary>Daily Summary preview</summary>
        <div>
          <p>Next summary: {summaryTime} {userTimeZone}</p>
          <span>{summaryTheme === 'dark' ? 'Dark preview' : 'Light preview'}</span>
          {@html renderedSummaryHtml}
          <button type="button" disabled={!canPreviewDailySummary(previewConfiguration)}>Preview Daily Summary</button>
        </div>
      </details>
      {#if authState.mode === 'user'}
        <section class="daily-settings-section">
          <h3>Test delivery</h3>
          <p>Send a test Daily Summary to {authState.summaryRecipient}.</p>
          {#if testDeliveryStatus}
            <p role={testDeliveryStatus.tone === 'success' ? 'status' : 'alert'}>
              {testDeliveryStatus.message}
            </p>
          {/if}
          <form method="POST" action="?/sendTestDailySummary">
            <button type="submit"><Send size={16} />Send Test Daily Summary</button>
          </form>
        </section>
        <section class="daily-settings-section">
          <h3>Account</h3>
          <p>Summary Recipient: {authState.summaryRecipient}</p>
          <form method="POST" action="/auth/sign-out"><button type="submit">Sign out</button></form>
          <form class="daily-delete-account" method="POST" action="?/deleteAccount">
            <h4>Delete Daily account</h4>
            <p>This is irreversible.</p>
            <label for="account-deletion-confirmation-board">Enter {accountDeletionConfirmation} exactly to confirm</label>
            <input id="account-deletion-confirmation-board" name="confirmation" autocomplete="off" required />
            {#if form?.accountDeletionError}<p role="alert">{form.accountDeletionError}</p>{/if}
            <button type="submit">Permanently delete my account</button>
          </form>
        </section>
      {:else}
        <section class="daily-settings-section">
          <h3>Visitor preview</h3>
          <p>Local Setup is saved in this browser only. Sign in with Google to receive Daily Summaries by email.</p>
          <a class="daily-google-button" href="/auth/google"><Mail size={17} />Sign in with Google</a>
        </section>
      {/if}
    {/if}
  </dialog>
{/if}
