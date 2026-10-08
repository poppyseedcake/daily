<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';

  let { children } = $props();
  const excludeFromSearch = $derived(
    page.status >= 400 ||
    page.url.pathname === '/admin' ||
    page.url.pathname.startsWith('/admin/') ||
    page.url.pathname.startsWith('/prototype/')
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
