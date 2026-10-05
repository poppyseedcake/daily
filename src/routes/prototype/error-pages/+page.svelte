<script lang="ts">
  import { page } from '$app/state';
  import ErrorPage from '$lib/components/ErrorPage.svelte';
  const status = $derived(Number(page.url.searchParams.get('status')));
  const singlePage = $derived(Number.isInteger(status) && status >= 400 && status < 600);
</script>

<svelte:head>
  <title>Error pages · Daily</title>
</svelte:head>

{#if singlePage}
  <ErrorPage {status} />
{:else}
  <ErrorPage status={404} preview />
  <ErrorPage status={500} preview />
{/if}
