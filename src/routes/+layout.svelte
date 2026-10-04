<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';

  let { children } = $props();
  const excludeFromSearch = $derived(
    page.url.pathname === '/admin' ||
    page.url.pathname.startsWith('/admin/') ||
    page.url.pathname.startsWith('/prototype/')
  );
</script>

<svelte:head>
  {#if excludeFromSearch}
    <meta name="robots" content="noindex, nofollow" />
  {/if}
</svelte:head>

{@render children()}
