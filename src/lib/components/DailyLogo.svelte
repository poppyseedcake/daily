<script lang="ts">
  let { compact = false }: { compact?: boolean } = $props();
</script>

<span class:daily-logo--compact={compact} class="daily-logo" aria-hidden="true">
  {#if !compact}<strong>Daily</strong>{/if}
  <span class="daily-logo__mark">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 12 4 4 8-8" />
    </svg>
  </span>
</span>

<style>
  .daily-logo {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #172d52;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 26px;
    font-weight: 760;
    letter-spacing: -0.065em;
    line-height: 1;
  }

  .daily-logo__mark {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    background: #1769ed;
    color: #fff;
  }

  .daily-logo__mark svg {
    width: 21px;
    height: 21px;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 2.5;
  }

  .daily-logo--compact .daily-logo__mark {
    width: 34px;
    height: 34px;
  }
</style>
