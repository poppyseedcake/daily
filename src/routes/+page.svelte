<script lang="ts">
  import { CalendarDays, Mail, ShieldCheck } from '@lucide/svelte';
  import Panel from '$lib/components/Panel.svelte';
  import { buildDemoCalendarSection } from '$lib/demoCalendar';
  import { renderDailySummary, type DailySummaryInput } from '$lib/dailySummaryRenderer';
  import {
    defaultSummaryConfiguration,
    summaryConfigurationSchema,
    type SummaryConfiguration,
    type SummarySection,
    type SummaryTheme,
    type UserTimeZone
  } from '$lib/summaryConfiguration';

  const summarySections: Array<{ key: SummarySection; label: string }> = [
    { key: 'weather', label: 'Weather' },
    { key: 'commute', label: 'Commute' },
    { key: 'calendar', label: 'Calendar' },
    { key: 'todo', label: 'Todo' }
  ];
  const userTimeZones: UserTimeZone[] = ['Europe/Warsaw', 'America/New_York', 'UTC'];
  const initialSummaryConfiguration = summaryConfigurationSchema.parse(defaultSummaryConfiguration);
  let summaryTime = $state(initialSummaryConfiguration.summaryTime);
  let summaryTimeInput = $state(initialSummaryConfiguration.summaryTime);
  let userTimeZone = $state<UserTimeZone>(initialSummaryConfiguration.userTimeZone);
  let summaryTheme = $state<SummaryTheme>(initialSummaryConfiguration.summaryTheme);
  let summaryDeliveryEnabled = $state(initialSummaryConfiguration.summaryDeliveryEnabled);
  let enabledSections = $state<Record<SummarySection, boolean>>({
    ...initialSummaryConfiguration.sections
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
  let renderedSummary = $state(
    renderDailySummary({
      configuration: currentSummaryConfiguration(),
      sections: {
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
          label: 'Demo Calendar',
          detail: ''
        },
        todo: {
          status: 'unavailable',
          label: 'Todo',
          reason: 'Todo source is not connected yet.'
        }
      }
    })
  );

  $effect(() => {
    renderedSummary = renderDailySummary({
      configuration: {
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
      },
      sections: previewSections
    });
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
                checked={summaryDeliveryEnabled}
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

      <Panel title="Daily Summary Preview" eyebrow="Preview">
        <div class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="font-medium text-stone-900">Next summary: {summaryTime} {userTimeZone}</p>
            <p class="rounded-md bg-stone-900 px-2 py-1 text-xs font-semibold text-white">
              {summaryTheme === 'dark' ? 'Dark preview' : 'Light preview'}
            </p>
          </div>
          <div class="overflow-hidden rounded-md border border-stone-200">
            {#key renderedSummary.html}
              {@html renderedSummary.html}
            {/key}
          </div>
          <button
            class="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"
            type="button"
            disabled={!summaryDeliveryEnabled}
          >
            <Mail size={18} aria-hidden="true" />
            Preview Daily Summary
          </button>
        </div>
      </Panel>
    </section>

    <aside class="space-y-4">
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
