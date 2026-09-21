<script lang="ts">
  import DailyLogo from '$lib/components/DailyLogo.svelte';
  import { minimumUserAge } from '$lib/legalConfirmation';

  let { data }: { data: { error: string | null } } = $props();
</script>

<svelte:head>
  <title>Continue to Daily</title>
  <meta
    name="description"
    content="Confirm the Daily age requirement and accept the Daily Terms of Service before Google sign-in."
  />
</svelte:head>

<div class="legal-confirmation-page">
  <header class="legal-confirmation-header">
    <a href="/" aria-label="Daily home"><DailyLogo /></a>
    <nav aria-label="Policy links">
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
    </nav>
  </header>

  <main class="legal-confirmation-main">
    <p class="legal-confirmation-kicker">Before Google sign-in</p>
    <h1>Continue to Daily</h1>
    <p class="legal-confirmation-intro">
      Daily is a free service that prepares a personal Daily Summary from your setup and, if you
      choose, your Google Calendar.
    </p>

    {#if data.error}
      <p class="legal-confirmation-error" role="alert">{data.error}</p>
    {/if}

    <form method="POST" action="/auth/google/confirm" class="legal-confirmation-form">
      <label>
        <input name="ageConfirmed" type="checkbox" required />
        <span>I confirm that I am at least {minimumUserAge} years old.</span>
      </label>
      <label>
        <input name="termsAccepted" type="checkbox" required />
        <span>I accept the <a href="/terms">Daily Terms of Service</a>.</span>
      </label>
      <p>
        Read the <a href="/privacy">Daily Privacy Policy</a> to learn how Daily handles personal
        data. This link is information about processing. It is not blanket consent to all data
        processing.
      </p>
      <button type="submit">Continue with Google</button>
    </form>

    <p class="legal-confirmation-note">
      Daily records the two confirmations, the terms version, and the confirmation time. Daily
      does not ask for a date of birth or identity document. This self-declaration is not verified
      proof of age.
    </p>
  </main>

  <footer class="legal-confirmation-footer">
    <span>Daily</span>
    <a href="/privacy">Privacy</a>
    <a href="/terms">Terms</a>
    <a href="mailto:daily@dailykickoff.eu">daily@dailykickoff.eu</a>
  </footer>
</div>

<style>
  :global(body) {
    background: #f7f8f5;
  }

  .legal-confirmation-page {
    min-height: 100vh;
    display: grid;
    grid-template-rows: auto 1fr auto;
    color: #181a17;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }

  .legal-confirmation-header,
  .legal-confirmation-footer {
    width: min(100% - 32px, 980px);
    margin: 0 auto;
  }

  .legal-confirmation-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 26px 0;
  }

  .legal-confirmation-header a:first-child {
    text-decoration: none;
  }

  nav,
  .legal-confirmation-footer {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
  }

  a {
    color: #315b39;
    font-weight: 650;
  }

  a:hover {
    color: #173d25;
  }

  :is(a, button, input):focus-visible {
    outline: 2px solid #1769ed;
    outline-offset: 3px;
  }

  .legal-confirmation-main {
    width: min(100% - 32px, 560px);
    margin: 0 auto;
    padding: 56px 0 80px;
  }

  .legal-confirmation-kicker {
    margin: 0 0 10px;
    color: #526d3f;
    font-size: 12px;
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    color: #172d52;
    font-size: clamp(36px, 7vw, 56px);
    letter-spacing: -0.055em;
    line-height: 0.98;
  }

  .legal-confirmation-intro {
    margin: 22px 0 28px;
    color: #5d665d;
    font-size: 17px;
    line-height: 1.6;
  }

  .legal-confirmation-error {
    margin: 0 0 18px;
    border: 1px solid #dcacac;
    border-radius: 8px;
    background: #fff6f6;
    padding: 12px 14px;
    color: #8b2929;
  }

  .legal-confirmation-form {
    display: grid;
    gap: 18px;
    border: 1px solid #d9ded5;
    border-radius: 12px;
    background: #fff;
    padding: 24px;
    box-shadow: 0 14px 35px rgb(32 45 32 / 7%);
  }

  .legal-confirmation-form label {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    font-size: 16px;
    line-height: 1.5;
  }

  .legal-confirmation-form input {
    width: 20px;
    height: 20px;
    flex: 0 0 auto;
    margin: 2px 0 0;
    accent-color: #1769ed;
  }

  .legal-confirmation-form p,
  .legal-confirmation-note {
    margin: 0;
    color: #697269;
    font-size: 13px;
    line-height: 1.55;
  }

  .legal-confirmation-form button {
    min-height: 46px;
    border: 0;
    border-radius: 8px;
    background: #1769ed;
    color: #fff;
    cursor: pointer;
    font-weight: 750;
  }

  .legal-confirmation-form button:hover {
    background: #0f58cb;
  }

  .legal-confirmation-note {
    margin-top: 18px;
  }

  .legal-confirmation-footer {
    justify-content: center;
    padding: 22px 0 28px;
    color: #697269;
    font-size: 12px;
  }

  .legal-confirmation-footer span {
    color: #172d52;
    font-weight: 750;
  }

  @media (max-width: 560px) {
    .legal-confirmation-header {
      align-items: flex-start;
      flex-direction: column;
    }

    .legal-confirmation-main {
      padding-top: 28px;
    }

    .legal-confirmation-form {
      padding: 18px;
    }
  }
</style>
