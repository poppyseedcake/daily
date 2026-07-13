<script lang="ts">
  import { Activity, Database, MapPinned, ShieldCheck } from '@lucide/svelte';
  import Panel from '$lib/components/Panel.svelte';

  let { data, form } = $props();

  const suspensionLabels = {
    'environment-kill-switch': 'Deployment environment kill switch',
    'admin-kill-switch': 'Admin Panel kill switch',
    'global-daily-cap': 'Daily usage cap reached',
    'global-monthly-cap': 'Monthly usage cap reached'
  } as const;
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
        <div class="space-y-5">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3">
              <MapPinned class="text-cyan-700" size={20} aria-hidden="true" />
              <p class="font-medium">Google Maps is {data.googleMaps.effectiveState}.</p>
            </div>
            <span
              class={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                data.googleMaps.effectiveState === 'active'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-900'
              }`}
            >
              {data.googleMaps.effectiveState === 'active' ? 'Active' : 'Suspended'}
            </span>
          </div>

          {#if data.googleMaps.suspensionReason}
            <p class="rounded-md bg-amber-50 p-3 text-sm text-amber-950">
              Reason: {suspensionLabels[data.googleMaps.suspensionReason]}
            </p>
          {/if}

          <dl class="grid gap-3 text-sm sm:grid-cols-2 md:grid-cols-1">
            <div class="rounded-md border border-zinc-200 p-3">
              <dt class="text-zinc-600">Daily usage · {data.googleMaps.daily.periodStart}</dt>
              <dd class="mt-1 text-xl font-semibold">
                {data.googleMaps.daily.total} / {data.googleMaps.daily.cap}
              </dd>
              <p class="mt-1 text-xs text-zinc-600">
                Point selection {data.googleMaps.daily.byCategory['map-point-selection']} · Commute
                estimates {data.googleMaps.daily.byCategory['commute-estimate']}
              </p>
            </div>
            <div class="rounded-md border border-zinc-200 p-3">
              <dt class="text-zinc-600">Monthly usage · {data.googleMaps.monthly.periodStart}</dt>
              <dd class="mt-1 text-xl font-semibold">
                {data.googleMaps.monthly.total} / {data.googleMaps.monthly.cap}
              </dd>
              <p class="mt-1 text-xs text-zinc-600">
                Point selection {data.googleMaps.monthly.byCategory['map-point-selection']} · Commute
                estimates {data.googleMaps.monthly.byCategory['commute-estimate']}
              </p>
            </div>
          </dl>
          <p class="text-xs text-zinc-500">Accounting and rollover use {data.googleMaps.timeBasis}.</p>

          <div class="space-y-3 border-t border-zinc-200 pt-4 text-sm">
            <div class="flex items-center justify-between gap-3">
              <span>Deployment environment control</span>
              <strong>{data.googleMaps.environmentKillSwitchEnabled ? 'Enabled' : 'Disabled'}</strong>
            </div>
            {#if data.googleMaps.environmentKillSwitchEnabled}
              <p class="rounded-md bg-zinc-100 p-3 text-zinc-700">
                Owned by deployment configuration. It has precedence and cannot be cleared here.
              </p>
            {/if}
            <div class="flex items-center justify-between gap-3">
              <span>Admin Panel SQLite control</span>
              <strong>{data.googleMaps.adminKillSwitchEnabled ? 'Enabled' : 'Disabled'}</strong>
            </div>
            <form method="POST" action="?/setGoogleMapsKillSwitch">
              <input
                type="hidden"
                name="enabled"
                value={data.googleMaps.adminKillSwitchEnabled ? 'false' : 'true'}
              />
              <button
                class="inline-flex h-10 items-center rounded-md bg-zinc-900 px-3 font-medium text-white hover:bg-zinc-700"
                type="submit"
              >
                {data.googleMaps.adminKillSwitchEnabled ? 'Disable' : 'Enable'} Admin Panel kill switch
              </button>
            </form>
            {#if form?.message}
              <p class="text-red-700">{form.message}</p>
            {/if}
          </div>
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
