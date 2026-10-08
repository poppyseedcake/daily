<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import { afterNavigate } from '$app/navigation';
  import { analytics } from '$lib/analytics';
  import CookieBanner from '$lib/components/CookieBanner.svelte';

  afterNavigate((navigation) => {
    if (navigation.from) analytics.capture('$pageview');
  });

  let { children } = $props();
  const excludeFromSearch = $derived(
    page.status >= 400 ||
    page.url.pathname === '/admin' ||
    page.url.pathname.startsWith('/admin/')
  );
  const maskReplayPage = $derived(
    page.status >= 400 || !['/', '/privacy', '/terms'].includes(page.url.pathname)
  );
</script>

<svelte:head>
  {#if excludeFromSearch}
    <meta name="robots" content="noindex, nofollow" />
  {/if}
</svelte:head>

<!-- Only the audited workspace and static legal pages expose their application copy.
     Other routes (including Admin and error pages) retain text masking by default. -->
<div data-private={maskReplayPage ? '' : undefined} style="display: contents">
  {@render children()}
</div>

<CookieBanner />
