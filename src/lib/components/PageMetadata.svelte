<script lang="ts">
  import { page } from '$app/state';
  import { dailySite } from '$lib/siteMetadata';

  let {
    title = dailySite.title,
    description = dailySite.description
  }: {
    title?: string;
    description?: string;
  } = $props();

  const canonicalUrl = $derived(new URL(page.url.pathname, dailySite.url).href);
  const imageUrl = new URL(dailySite.image.path, dailySite.url).href;
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonicalUrl} />

  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Daily" />
  <meta property="og:locale" content="en_US" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={canonicalUrl} />
  <meta property="og:image" content={imageUrl} />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content={String(dailySite.image.width)} />
  <meta property="og:image:height" content={String(dailySite.image.height)} />
  <meta property="og:image:alt" content={dailySite.image.alt} />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={imageUrl} />
  <meta name="twitter:image:alt" content={dailySite.image.alt} />
</svelte:head>
