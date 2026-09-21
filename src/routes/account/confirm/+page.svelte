<script lang="ts">
  import DailyLogo from '$lib/components/DailyLogo.svelte';

  let {
    data,
    form
  }: {
    data: { minimumUserAge: number; termsVersion: string; returnTo: string };
    form?: { error?: string };
  } = $props();
</script>

<svelte:head>
  <title>Confirm your Daily account</title>
  <meta
    name="description"
    content="Complete the Daily age and Terms confirmation for your existing account."
  />
</svelte:head>

<div class="account-confirmation-page">
  <header class="account-confirmation-header">
    <a href="/" aria-label="Daily home"><DailyLogo /></a>
    <nav aria-label="Policy links">
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
    </nav>
  </header>

  <main class="account-confirmation-main">
    <p class="account-confirmation-kicker">One account step</p>
    <h1>Confirm your Daily account</h1>
    <p class="account-confirmation-intro">
      Your existing Daily setup stays in place. Complete this confirmation to continue using it.
    </p>

    {#if form?.error}
      <p class="account-confirmation-error" role="alert">{form.error}</p>
    {/if}

    <form method="POST" class="account-confirmation-form">
      <input type="hidden" name="returnTo" value={data.returnTo} />
      <label>
        <input name="ageConfirmed" type="checkbox" required />
        <span>I confirm that I am at least {data.minimumUserAge} years old.</span>
      </label>
      <label>
        <input name="termsAccepted" type="checkbox" required />
        <span>I accept the <a href="/terms">Daily Terms of Service</a>.</span>
      </label>
      <p>
        Read the <a href="/privacy">Daily Privacy Policy</a> for information about personal data.
        A privacy policy link is not blanket consent to data processing.
      </p>
      <button type="submit">Continue to Daily</button>
    </form>

    <p class="account-confirmation-note">
      Daily stores the age confirmation, Terms version {data.termsVersion}, and confirmation time.
      This is a self-declaration, not verified proof of age. Daily does not ask for a date of birth
      or identity document.
    </p>
  </main>

  <footer class="account-confirmation-footer">
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

  .account-confirmation-page {
    min-height: 100vh;
    display: grid;
    grid-template-rows: auto 1fr auto;
    color: #181a17;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }

  .account-confirmation-header,
  .account-confirmation-footer {
    width: min(100% - 32px, 980px);
    margin: 0 auto;
  }

  .account-confirmation-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 26px 0;
  }

  .account-confirmation-header > a:first-child {
    text-decoration: none;
  }

  nav,
  .account-confirmation-footer {
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

  .account-confirmation-main {
    width: min(100% - 32px, 560px);
    margin: 0 auto;
    padding: 56px 0 80px;
  }

  .account-confirmation-kicker {
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

  .account-confirmation-intro {
    margin: 22px 0 28px;
    color: #5d665d;
    font-size: 17px;
    line-height: 1.6;
  }

  .account-confirmation-error {
    margin: 0 0 18px;
    border: 1px solid #dcacac;
    border-radius: 8px;
    background: #fff6f6;
    padding: 12px 14px;
    color: #8b2929;
  }

  .account-confirmation-form {
    display: grid;
    gap: 18px;
    border: 1px solid #d9ded5;
    border-radius: 12px;
    background: #fff;
    padding: 24px;
    box-shadow: 0 14px 35px rgb(32 45 32 / 7%);
  }

  .account-confirmation-form label {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    font-size: 16px;
    line-height: 1.5;
  }

  .account-confirmation-form input[type='checkbox'] {
    width: 20px;
    height: 20px;
    flex: 0 0 auto;
    margin: 2px 0 0;
    accent-color: #1769ed;
  }

  .account-confirmation-form p,
  .account-confirmation-note {
    margin: 0;
    color: #697269;
    font-size: 13px;
    line-height: 1.55;
  }

  .account-confirmation-form button {
    min-height: 46px;
    border: 0;
    border-radius: 8px;
    background: #1769ed;
    color: #fff;
    cursor: pointer;
    font-weight: 750;
  }

  .account-confirmation-form button:hover {
    background: #0f58cb;
  }

  .account-confirmation-note {
    margin-top: 18px;
  }

  .account-confirmation-footer {
    justify-content: center;
    padding: 22px 0 28px;
    color: #697269;
    font-size: 12px;
  }

  .account-confirmation-footer span {
    color: #172d52;
    font-weight: 750;
  }

  @media (max-width: 560px) {
    .account-confirmation-header {
      align-items: flex-start;
      flex-direction: column;
    }

    .account-confirmation-main {
      padding-top: 28px;
    }

    .account-confirmation-form {
      padding: 18px;
    }
  }
</style>
