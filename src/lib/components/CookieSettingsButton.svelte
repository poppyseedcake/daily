<script lang="ts">
  import { onMount } from 'svelte';
  import { cookieSettingsOpen } from '$lib/cookieConsent';
  let ready = $state(false);
  onMount(() => { ready = true; });
</script>

<button type="button" disabled={!ready} onclick={() => cookieSettingsOpen.set(true)}>Cookie settings</button>

<style>
  button {
    border: 0;
    background: transparent;
    padding: 6px 0;
    color: inherit;
    font: inherit;
    font-weight: 650;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  button:hover { color: #173d25; }
  button:disabled { opacity: 0.6; cursor: wait; }
  button:focus-visible { outline: 2px solid #1769ed; outline-offset: 3px; }
</style>
