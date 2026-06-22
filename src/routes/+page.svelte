<script lang="ts">
  import { CalendarDays, Mail, Settings, ShieldCheck } from '@lucide/svelte';
  import Panel from '$lib/components/Panel.svelte';
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
              <span class="font-medium text-stone-800">Summary Time</span>
              <input class="h-10 rounded-md border border-stone-300 px-3" type="time" value="07:00" />
            </label>
            <label class="grid gap-1">
              <span class="font-medium text-stone-800">User Time Zone</span>
              <select class="h-10 rounded-md border border-stone-300 px-3">
                <option>Europe/Warsaw</option>
                <option>America/New_York</option>
                <option>UTC</option>
              </select>
            </label>
          </div>
        </Panel>

        <Panel title="Summary Sections" eyebrow="Daily Summary">
          <div class="grid gap-3">
            {#each ['Weather', 'Commute', 'Calendar', 'Todo'] as section}
              <label class="flex items-center justify-between gap-3 rounded-md border border-stone-200 px-3 py-2">
                <span>{section}</span>
                <input type="checkbox" checked />
              </label>
            {/each}
          </div>
        </Panel>
      </div>

      <Panel title="Daily Summary Preview" eyebrow="Preview">
        <div class="space-y-4">
          <div class="grid gap-3 md:grid-cols-3">
            <div class="rounded-md bg-amber-50 p-3">
              <CalendarDays size={20} aria-hidden="true" />
              <p class="mt-2 font-medium text-stone-900">Demo Calendar</p>
              <p class="mt-1 text-stone-700">Sample events show how a connected calendar will appear.</p>
            </div>
            <div class="rounded-md bg-sky-50 p-3">
              <Settings size={20} aria-hidden="true" />
              <p class="mt-2 font-medium text-stone-900">Mock Commute</p>
              <p class="mt-1 text-stone-700">A placeholder estimate keeps the preview usable.</p>
            </div>
            <div class="rounded-md bg-emerald-50 p-3">
              <Mail size={20} aria-hidden="true" />
              <p class="mt-2 font-medium text-stone-900">Email Preview</p>
              <p class="mt-1 text-stone-700">Sending stays disabled until a later Google sign-in milestone.</p>
            </div>
          </div>
          <button
            class="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"
            type="button"
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
