<script lang="ts">
  import { Activity, Database, MapPinned, ScrollText, ShieldCheck } from '@lucide/svelte';
  import Panel from '$lib/components/Panel.svelte';

  let { data, form } = $props();

  const suspensionLabels = {
    'environment-kill-switch': 'Deployment environment kill switch',
    'admin-kill-switch': 'Admin Panel kill switch',
    'global-daily-cap': 'Daily usage cap reached',
    'global-monthly-cap': 'Monthly usage cap reached'
  } as const;

  const capAlertStatusLabels = {
    pending: 'Delivery pending',
    delivered: 'Delivered',
    failed: 'Failed'
  } as const;

  const currentCapAlerts = $derived([
    {
      capType: 'Daily',
      periodStart: data.googleMaps.daily.periodStart,
      alert: data.googleMaps.capAlerts.daily
    },
    {
      capType: 'Monthly',
      periodStart: data.googleMaps.monthly.periodStart,
      alert: data.googleMaps.capAlerts.monthly
    }
  ]);

  const workerStatusLabels = {
    healthy: 'Healthy',
    overdue: 'Overdue',
    missing: 'No successful run'
  } as const;

  const workerOutcomeLabels = {
    succeeded: 'Succeeded',
    'completed-with-isolated-errors': 'Completed with isolated errors',
    failed: 'Failed'
  } as const;

  const technicalLogSubsystemLabels = {
    'scheduled-delivery': 'Scheduled delivery',
    'admin-controls': 'Admin controls',
    'database-backup': 'Database backup'
  } as const;

  const technicalLogNextPageHref = () => {
    const parameters = new URLSearchParams();
    for (const [key, value] of Object.entries(data.technicalLogFilters)) {
      if (value) parameters.set(key, value);
    }
    const nextCursor = data.technicalLogs.nextCursor;
    if (!nextCursor) return '/admin';
    parameters.set('cursor', nextCursor);
    return `/admin?${parameters.toString()}`;
  };

  const metadataLabel = (key: string) =>
    key.replaceAll(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
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
              <dt class="text-zinc-600">Places API monthly usage · {data.googleMaps.placesMonthly.periodStart}</dt>
              <dd class="mt-1 text-xl font-semibold">
                {data.googleMaps.placesMonthly.total} / {data.googleMaps.placesMonthly.cap}
              </dd>
              <p class="mt-1 text-xs text-zinc-600">
                Autocomplete {data.googleMaps.placesMonthly.autocomplete} · Address details
                {data.googleMaps.placesMonthly.details}
              </p>
            </div>
            <div class="rounded-md border border-zinc-200 p-3">
              <dt class="text-zinc-600">Routes API daily usage · {data.googleMaps.daily.periodStart}</dt>
              <dd class="mt-1 text-xl font-semibold">
                {data.googleMaps.daily.total} / {data.googleMaps.daily.cap}
              </dd>
              <p class="mt-1 text-xs text-zinc-600">
                Point selection {data.googleMaps.daily.byCategory['map-point-selection']} · Commute
                estimates {data.googleMaps.daily.byCategory['commute-estimate']}
              </p>
            </div>
            <div class="rounded-md border border-zinc-200 p-3">
              <dt class="text-zinc-600">Routes API monthly usage · {data.googleMaps.monthly.periodStart}</dt>
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

          <section
            class="space-y-3 border-t border-zinc-200 pt-4 text-sm"
            aria-label="Operator cap alerts"
          >
            <div>
              <p class="font-medium">Operator cap alerts</p>
              <p class="mt-1 text-xs text-zinc-600">
                Delivery outcomes for the current UTC daily and monthly periods.
              </p>
            </div>
            {#each currentCapAlerts as capAlert}
              <div class="rounded-md border border-zinc-200 p-3">
                <div class="flex items-center justify-between gap-3">
                  <span>{capAlert.capType} · {capAlert.periodStart}</span>
                  <strong>
                    {capAlert.alert
                      ? capAlertStatusLabels[capAlert.alert.status]
                      : 'Not claimed'}
                  </strong>
                </div>
                {#if capAlert.alert?.completedAt}
                  <p class="mt-1 text-xs text-zinc-600">
                    Completed <time datetime={capAlert.alert.completedAt}>{capAlert.alert.completedAt}</time>
                  </p>
                {/if}
                {#if capAlert.alert?.failureCode}
                  <p class="mt-1 text-xs text-red-700">
                    Failure classification: <code>{capAlert.alert.failureCode}</code>
                  </p>
                {/if}
              </div>
            {/each}
          </section>

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

      <div class="md:col-span-3">
        <Panel title="Delivery Health" eyebrow="Scheduled delivery">
          <div class="space-y-6">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div class="flex items-start gap-3">
                <Database class="mt-0.5 text-cyan-700" size={20} aria-hidden="true" />
                <div>
                  <p class="font-medium">Scheduled Worker</p>
                  <p class="mt-1 text-xs text-zinc-600">
                    Overdue after {data.deliveryHealth.worker.overdueThresholdMinutes} minutes. Times and
                    windows use {data.deliveryHealth.timeBasis}.
                  </p>
                </div>
              </div>
              <span
                class={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  data.deliveryHealth.worker.status === 'healthy'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-900'
                }`}
              >
                {workerStatusLabels[data.deliveryHealth.worker.status]}
              </span>
            </div>

            {#if data.deliveryHealth.worker.latestRun}
              <div class="rounded-md border border-zinc-200 p-4">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="font-medium">
                    Latest run: {workerOutcomeLabels[data.deliveryHealth.worker.latestRun.outcome]}
                  </p>
                  <time
                    class="text-xs text-zinc-600"
                    datetime={data.deliveryHealth.worker.latestRun.completedAt}
                  >
                    Completed {data.deliveryHealth.worker.latestRun.completedAt}
                  </time>
                </div>
                <p class="mt-2 text-xs text-zinc-600">
                  Duration {data.deliveryHealth.worker.latestRun.durationMilliseconds} ms
                  {#if data.deliveryHealth.worker.latestRun.failureClassification}
                    · Classification {data.deliveryHealth.worker.latestRun.failureClassification}
                  {/if}
                </p>
                <dl class="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-3 lg:grid-cols-6">
                  {#each Object.entries(data.deliveryHealth.worker.latestRun.counts) as [label, count]}
                    <div class="rounded-md bg-zinc-100 p-2">
                      <dt class="text-xs capitalize text-zinc-600">{label}</dt>
                      <dd class="mt-1 text-lg font-semibold">{count}</dd>
                    </div>
                  {/each}
                </dl>
              </div>
            {:else}
              <p class="rounded-md bg-amber-50 p-3 text-amber-950">
                No successful Scheduled Worker Run has been recorded.
              </p>
            {/if}

            <div class="grid gap-4 lg:grid-cols-2">
              {#each data.deliveryHealth.windows as window}
                <section class="rounded-md border border-zinc-200 p-4" aria-label={window.label}>
                  <h3 class="font-semibold">{window.label}</h3>
                  <dl class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <div class="rounded-md bg-emerald-50 p-2">
                      <dt class="text-xs text-emerald-800">Sent</dt>
                      <dd class="mt-1 text-lg font-semibold">{window.totals.sent}</dd>
                    </div>
                    <div class="rounded-md bg-cyan-50 p-2">
                      <dt class="text-xs text-cyan-800">Retrying</dt>
                      <dd class="mt-1 text-lg font-semibold">{window.totals.retrying}</dd>
                    </div>
                    <div class="rounded-md bg-red-50 p-2">
                      <dt class="text-xs text-red-800">Failed</dt>
                      <dd class="mt-1 text-lg font-semibold">{window.totals.failed}</dd>
                    </div>
                    <div class="rounded-md bg-zinc-100 p-2">
                      <dt class="text-xs text-zinc-600">Processing</dt>
                      <dd class="mt-1 text-lg font-semibold">{window.totals.activeProcessing}</dd>
                    </div>
                    <div class="rounded-md bg-amber-100 p-2">
                      <dt class="text-xs text-amber-900">Expired claims</dt>
                      <dd class="mt-1 text-lg font-semibold">{window.totals.expiredProcessing}</dd>
                    </div>
                  </dl>

                  <div class="mt-4 border-t border-zinc-200 pt-3">
                    <p class="text-xs font-semibold uppercase tracking-wide text-zinc-600">
                      Failures by classification
                    </p>
                    {#if window.failureClassifications.length > 0}
                      <ul class="mt-2 space-y-1">
                        {#each window.failureClassifications as failure}
                          <li class="flex justify-between gap-3">
                            <code>{failure.classification}</code>
                            <strong>{failure.count}</strong>
                          </li>
                        {/each}
                      </ul>
                    {:else}
                      <p class="mt-2 text-zinc-600">No retrying or failed deliveries.</p>
                    {/if}
                  </div>
                </section>
              {/each}
            </div>
          </div>
        </Panel>
      </div>

      <div class="md:col-span-3">
        <Panel title="Technical Logs" eyebrow="Privacy-safe operations">
          <div class="space-y-5">
            <div class="flex items-start gap-3">
              <ScrollText class="mt-0.5 text-cyan-700" size={20} aria-hidden="true" />
              <div>
                <p class="font-medium">Technical Log Records</p>
                <p class="mt-1 text-xs text-zinc-600">
                  Newest first · 25 records per page · timestamps and range filters use UTC.
                  Arbitrary text search and raw journal access are intentionally unavailable.
                </p>
              </div>
            </div>

            <form class="grid gap-3 rounded-md border border-zinc-200 p-4 md:grid-cols-2 lg:grid-cols-3" method="GET" action="/admin">
              <label class="space-y-1 text-sm">
                <span class="font-medium">From UTC</span>
                <input
                  class="h-10 w-full rounded-md border border-zinc-300 px-3"
                  name="from"
                  placeholder="2026-07-15T08:00:00.000Z"
                  value={data.technicalLogFilters.from ?? ''}
                />
              </label>
              <label class="space-y-1 text-sm">
                <span class="font-medium">To UTC</span>
                <input
                  class="h-10 w-full rounded-md border border-zinc-300 px-3"
                  name="to"
                  placeholder="2026-07-15T12:00:00.000Z"
                  value={data.technicalLogFilters.to ?? ''}
                />
              </label>
              <label class="space-y-1 text-sm">
                <span class="font-medium">Severity</span>
                <select class="h-10 w-full rounded-md border border-zinc-300 px-3" name="severity">
                  <option value="">All severities</option>
                  {#each data.technicalLogFilterOptions.severities as severity}
                    <option value={severity} selected={data.technicalLogFilters.severity === severity}>{metadataLabel(severity)}</option>
                  {/each}
                </select>
              </label>
              <label class="space-y-1 text-sm">
                <span class="font-medium">Subsystem</span>
                <select class="h-10 w-full rounded-md border border-zinc-300 px-3" name="subsystem">
                  <option value="">All subsystems</option>
                  {#each data.technicalLogFilterOptions.subsystems as subsystem}
                    <option value={subsystem} selected={data.technicalLogFilters.subsystem === subsystem}>{technicalLogSubsystemLabels[subsystem]}</option>
                  {/each}
                </select>
              </label>
              <label class="space-y-1 text-sm lg:col-span-2">
                <span class="font-medium">Event code</span>
                <select class="h-10 w-full rounded-md border border-zinc-300 px-3" name="eventCode">
                  <option value="">All event codes</option>
                  {#each data.technicalLogFilterOptions.eventCodes as eventCode}
                    <option value={eventCode} selected={data.technicalLogFilters.eventCode === eventCode}>{eventCode}</option>
                  {/each}
                </select>
              </label>
              <div class="flex items-end gap-2 md:col-span-2 lg:col-span-3">
                <button class="inline-flex h-10 items-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-700" type="submit">Apply filters</button>
                <a class="inline-flex h-10 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium hover:bg-zinc-50" href="/admin">Clear filters</a>
              </div>
            </form>

            {#if data.technicalLogs.records.length > 0}
              <div class="space-y-3">
                {#each data.technicalLogs.records as record}
                  <article class="rounded-md border border-zinc-200 p-4">
                    <div class="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <code class="text-sm font-semibold">{record.eventCode}</code>
                        <p class="mt-1 text-xs text-zinc-600">{record.subsystem} · {record.outcome}</p>
                      </div>
                      <div class="text-right">
                        <span class="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold uppercase">{record.severity}</span>
                        <time class="mt-2 block text-xs text-zinc-600" datetime={record.occurredAt}>{record.occurredAt}</time>
                      </div>
                    </div>
                    {#if 'failureClassification' in record && record.failureClassification}
                      <p class="mt-3 text-sm">Failure classification: <code>{record.failureClassification}</code></p>
                    {/if}
                    {#if 'durationMilliseconds' in record}
                      <p class="mt-2 text-sm">Duration: {record.durationMilliseconds} ms</p>
                    {/if}
                    <div class="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                      {#each Object.entries(record.metadata) as [key, value]}
                        <p class="rounded-md bg-zinc-100 p-2">
                          {metadataLabel(key)}: <strong>{String(value)}</strong>
                        </p>
                      {/each}
                    </div>
                  </article>
                {/each}
              </div>
            {:else}
              <p class="rounded-md bg-zinc-100 p-4 text-zinc-700">No Technical Log Records match these filters.</p>
            {/if}

            {#if data.technicalLogs.nextCursor}
              <a class="inline-flex h-10 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium hover:bg-zinc-50" href={technicalLogNextPageHref()}>Next page</a>
            {/if}
          </div>
        </Panel>
      </div>
    </div>
  </div>
</main>
