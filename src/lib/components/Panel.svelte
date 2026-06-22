<script lang="ts">
  let {
    title,
    eyebrow,
    children
  }: {
    title: string;
    eyebrow?: string;
    children: import('svelte').Snippet;
  } = $props();
</script>

<section class="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
  {#if eyebrow}
    <p class="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">{eyebrow}</p>
  {/if}
  <h2 class="text-lg font-semibold text-stone-950">{title}</h2>
  <div class="mt-4 text-sm text-stone-700">
    {@render children()}
  </div>
</section>
