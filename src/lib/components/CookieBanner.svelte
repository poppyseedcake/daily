<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { chooseCookieConsent, cookieConsent, cookieSettingsOpen } from '$lib/cookieConsent';

  let ready = $state(false);
  let banner = $state<HTMLElement>();
  let bannerHeight = $state(0);
  let settingsTrigger: HTMLElement | null = null;
  onMount(() => { ready = true; });

  $effect(() => {
    if (ready && $cookieSettingsOpen) {
      settingsTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      tick().then(() => banner?.focus());
    }
  });

  function choose(choice: 'accepted' | 'rejected') {
    chooseCookieConsent(choice);
    settingsTrigger?.focus();
  }
</script>

{#if ready && ($cookieConsent === 'pending' || $cookieSettingsOpen)}
  <div style:height={`${bannerHeight}px`} aria-hidden="true"></div>
  <section class="cookie-banner" aria-labelledby="cookie-heading" tabindex="-1" bind:this={banner} bind:offsetHeight={bannerHeight}>
    <div class="cookie-banner__copy">
      <h2 id="cookie-heading">Your privacy, your choice</h2>
      <p>
        Daily uses essential cookies and browser storage to work. With your permission, PostHog
        uses analytics cookies to help us understand how Daily is used. You can use Daily without
        analytics and change your choice in Cookie settings.
        <a href="/privacy#cookies">Privacy Policy</a>
      </p>
      {#if $cookieSettingsOpen && $cookieConsent !== 'pending'}
        <p class="cookie-banner__status">Analytics is currently {$cookieConsent === 'accepted' ? 'on' : 'off'}.</p>
      {/if}
    </div>
    <div class="cookie-banner__actions">
      <button type="button" onclick={() => choose('rejected')}>Reject analytics</button>
      <button type="button" onclick={() => choose('accepted')}>Accept analytics</button>
      {#if $cookieSettingsOpen && $cookieConsent !== 'pending'}
        <button class="cookie-banner__close" type="button" onclick={() => {
          cookieSettingsOpen.set(false);
          settingsTrigger?.focus();
        }}>Keep current choice</button>
      {/if}
    </div>
  </section>
{/if}

<style>
  .cookie-banner {
    position: fixed;
    inset: auto 0 0;
    z-index: 100;
    display: flex;
    align-items: center;
    gap: 28px;
    border-top: 1px solid #c5d1c2;
    background: #f7f8f5;
    padding: 22px max(24px, calc((100vw - 1120px) / 2)) max(22px, env(safe-area-inset-bottom));
    color: #18201c;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    max-height: 70dvh;
    overflow-y: auto;
  }

  .cookie-banner__copy { flex: 1; min-width: 0; }
  h2 { margin: 0 0 8px; color: #172d52; font-size: 20px; line-height: 1.25; letter-spacing: -0.02em; }
  p { max-width: 72ch; margin: 0; color: #4f594f; font-size: 14px; line-height: 1.6; }
  a { color: #315b39; font-weight: 650; text-underline-offset: 3px; }
  a:hover { color: #173d25; }
  .cookie-banner__status { margin-top: 8px; font-weight: 650; }
  .cookie-banner__actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; flex-shrink: 0; }
  button {
    min-height: 44px;
    border: 1px solid #9eaf98;
    border-radius: 7px;
    background: #fff;
    padding: 10px 14px;
    color: #23452b;
    font-size: 14px;
    font-weight: 650;
    cursor: pointer;
  }
  button:hover { background: #e9eee6; border-color: #315b39; }
  a:focus-visible, button:focus-visible, section:focus-visible { outline: 2px solid #1769ed; outline-offset: 3px; }
  .cookie-banner__close { grid-column: 1 / -1; border-color: transparent; background: transparent; text-decoration: underline; text-underline-offset: 3px; }

  @media (max-width: 760px) {
    .cookie-banner { flex-direction: column; align-items: stretch; gap: 16px; padding: 20px 20px max(20px, env(safe-area-inset-bottom)); }
    .cookie-banner__actions { flex-shrink: 1; }
  }
</style>
