<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import CookieBanner from '$lib/components/CookieBanner.svelte';
  import { afterNavigate } from '$app/navigation';
  import { analytics } from '$lib/analytics';

  afterNavigate((navigation) => {
    if (navigation.from) analytics.capture('$pageview');
  });

  let { children } = $props();
  const excludeFromSearch = $derived(
    page.status >= 400 ||
    page.url.pathname === '/admin' ||
    page.url.pathname.startsWith('/admin/')
  );
</script>

<svelte:head>
  {#if excludeFromSearch}
    <meta name="robots" content="noindex, nofollow" />
  {/if}
</svelte:head>

{@render children()}
<CookieBanner />
