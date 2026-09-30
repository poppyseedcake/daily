<script lang="ts">
  let { compact = false }: { compact?: boolean } = $props();
</script>

<span class="daily-logo" aria-hidden="true">
  <img class="daily-logo__mark" src="/daily-mark.svg" alt="" width="34" height="34" />
  {#if !compact}<strong>Daily</strong>{/if}
</span>

<style>
  .daily-logo {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: #172d52;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 26px;
    font-weight: 760;
    letter-spacing: -0.04em;
    line-height: 1;
  }

  .daily-logo__mark {
    width: 34px;
    height: 34px;
    display: block;
    flex-shrink: 0;
  }
</style>
