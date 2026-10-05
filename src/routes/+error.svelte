<script lang="ts">
  import { page } from '$app/state';
  import ErrorPage from '$lib/components/ErrorPage.svelte';
</script>

<svelte:head>
  <title>{page.status === 404 ? 'Page not found' : 'Something went wrong'} · Daily</title>
</svelte:head>

<ErrorPage status={page.status} />
