<script lang="ts">
  import { CalendarDays, CloudSun, ListTodo, Mail, Settings, ShieldCheck } from '@lucide/svelte';
  import Panel from '$lib/components/Panel.svelte';
  import {
    defaultSummaryConfiguration,
    summaryConfigurationSchema,
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
  let userTimeZone = $state<UserTimeZone>(initialSummaryConfiguration.userTimeZone);
  let summaryTheme = $state<SummaryTheme>(initialSummaryConfiguration.summaryTheme);
  let summaryDeliveryEnabled = $state(initialSummaryConfiguration.summaryDeliveryEnabled);
  let enabledSections = $state<Record<SummarySection, boolean>>({
    ...initialSummaryConfiguration.sections
  });

  const toggleSection = (section: SummarySection, enabled: boolean) => {
    enabledSections = { ...enabledSections, [section]: enabled };
  };

  const readInputChecked = (event: Event) => (event.currentTarget as HTMLInputElement).checked;
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
                bind:value={summaryTime}
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
                      checked={userTimeZone === timeZone}
                      onchange={() => {
                        userTimeZone = timeZone;
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
                    checked={summaryTheme === 'light'}
                    onchange={() => {
                      summaryTheme = 'light';
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
                    checked={summaryTheme === 'dark'}
                    onchange={() => {
                      summaryTheme = 'dark';
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
                  summaryDeliveryEnabled = readInputChecked(event);
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
                  checked={enabledSections[section.key]}
                  onchange={(event) => {
                    toggleSection(section.key, readInputChecked(event));
                  }}
                />
              </label>
            {/each}
          </div>
        </Panel>
      </div>

      <Panel title="Daily Summary Preview" eyebrow="Preview">
        <div class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="font-medium text-stone-900">Next summary: {summaryTime} {userTimeZone}</p>
            <p class="rounded-md bg-stone-900 px-2 py-1 text-xs font-semibold text-white">
              {summaryTheme === 'dark' ? 'Dark preview' : 'Light preview'}
            </p>
          </div>
          <div class="grid gap-3 md:grid-cols-3">
            {#if enabledSections.weather}
              <div class="rounded-md bg-sky-50 p-3">
                <CloudSun size={20} aria-hidden="true" />
                <p class="mt-2 font-medium text-stone-900">Weather Snapshot</p>
                <p class="mt-1 text-stone-700">A placeholder forecast keeps the preview scannable.</p>
              </div>
            {/if}
            {#if enabledSections.commute}
              <div class="rounded-md bg-indigo-50 p-3">
                <Settings size={20} aria-hidden="true" />
                <p class="mt-2 font-medium text-stone-900">Mock Commute</p>
                <p class="mt-1 text-stone-700">A placeholder estimate keeps the preview usable.</p>
              </div>
            {/if}
            {#if enabledSections.calendar}
              <div class="rounded-md bg-amber-50 p-3">
                <CalendarDays size={20} aria-hidden="true" />
                <p class="mt-2 font-medium text-stone-900">Demo Calendar</p>
                <p class="mt-1 text-stone-700">Sample events show how a connected calendar will appear.</p>
              </div>
            {/if}
            {#if enabledSections.todo}
              <div class="rounded-md bg-emerald-50 p-3">
                <ListTodo size={20} aria-hidden="true" />
                <p class="mt-2 font-medium text-stone-900">Todo Focus</p>
                <p class="mt-1 text-stone-700">Top local tasks will appear here after setup.</p>
              </div>
            {/if}
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
