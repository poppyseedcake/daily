<script lang="ts">
  import { Activity, Database, MapPinned, ShieldCheck } from '@lucide/svelte';
  import Panel from '$lib/components/Panel.svelte';
</script>

<svelte:head>
  <title>Admin Panel | Daily</title>
</svelte:head>

<main class="min-h-screen bg-zinc-100 text-zinc-950">
  <div class="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 lg:px-8">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div>
        <p class="text-sm font-semibold text-cyan-700">Operational shell</p>
        <h1 class="mt-2 text-3xl font-semibold">Admin Panel</h1>
        <p class="mt-3 max-w-2xl text-sm text-zinc-700">
          No Visitor Local Setup or User summary content is shown here.
        </p>
      </div>
      <a
        class="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
        href="/"
      >
        <ShieldCheck size={18} aria-hidden="true" />
        Daily
      </a>
    </div>

    <div class="grid gap-4 md:grid-cols-3">
      <Panel title="Application Health" eyebrow="Status">
        <div class="flex items-start gap-3">
          <Activity class="mt-0.5 text-cyan-700" size={20} aria-hidden="true" />
          <p>Placeholder for uptime and process checks.</p>
        </div>
      </Panel>

      <Panel title="Google Maps Usage" eyebrow="Guardrail">
        <div class="flex items-start gap-3">
          <MapPinned class="mt-0.5 text-cyan-700" size={20} aria-hidden="true" />
          <p>Placeholder for usage totals and kill switch state.</p>
        </div>
      </Panel>

      <Panel title="Delivery Health" eyebrow="Records">
        <div class="flex items-start gap-3">
          <Database class="mt-0.5 text-cyan-700" size={20} aria-hidden="true" />
          <p>Placeholder for technical delivery records without email content.</p>
        </div>
      </Panel>
    </div>
  </div>
</main>
