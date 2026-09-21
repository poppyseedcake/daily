<script lang="ts">
  import type { Snippet } from 'svelte';
  import DailyLogo from './DailyLogo.svelte';

  let {
    eyebrow,
    title,
    intro,
    children
  }: {
    eyebrow: string;
    title: string;
    intro: string;
    children: Snippet;
  } = $props();
</script>

<svelte:head>
  <title>{title} · Daily</title>
  <meta name="description" content={intro} />
</svelte:head>

<div class="public-page">
  <header class="public-page-header">
    <a class="public-page-brand" href="/" aria-label="Daily home"><DailyLogo /></a>
    <nav aria-label="Public pages">
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a class="public-page-home-link" href="/">Back to Daily</a>
    </nav>
  </header>

  <main class="public-page-main">
    <p class="public-page-kicker">{eyebrow}</p>
    <h1>{title}</h1>
    <p class="public-page-intro">{intro}</p>
    <article class="public-document">{@render children()}</article>
  </main>

  <footer class="public-page-footer">
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

  .public-page {
    min-height: 100vh;
    color: #181a17;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }

  .public-page-header,
  .public-page-main,
  .public-page-footer {
    width: min(100% - 32px, 980px);
    margin: 0 auto;
  }

  .public-page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 26px 0;
  }

  .public-page-brand {
    text-decoration: none;
  }

  nav,
  .public-page-footer {
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

  :global(.public-page) a:focus-visible {
    outline: 2px solid #1769ed;
    outline-offset: 3px;
  }

  .public-page-home-link {
    border: 1px solid #c5d1c2;
    border-radius: 7px;
    padding: 8px 11px;
    text-decoration: none;
  }

  .public-page-main {
    padding: 58px 0 82px;
  }

  .public-page-kicker {
    margin: 0 0 10px;
    color: #526d3f;
    font-size: 12px;
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1 {
    max-width: 800px;
    margin: 0;
    color: #172d52;
    font-size: clamp(38px, 8vw, 64px);
    letter-spacing: -0.06em;
    line-height: 0.98;
  }

  .public-page-intro {
    max-width: 730px;
    margin: 22px 0 34px;
    color: #5d665d;
    font-size: 18px;
    line-height: 1.6;
  }

  .public-document {
    max-width: 780px;
    border-top: 1px solid #d9ded5;
    padding-top: 30px;
  }

  .public-document :global(h2) {
    margin: 36px 0 12px;
    color: #172d52;
    font-size: 24px;
    letter-spacing: -0.025em;
    line-height: 1.2;
  }

  .public-document :global(h2:first-child) {
    margin-top: 0;
  }

  .public-document :global(h3) {
    margin: 24px 0 8px;
    color: #33462a;
    font-size: 17px;
    line-height: 1.3;
  }

  .public-document :global(p),
  .public-document :global(li) {
    color: #4f594f;
    font-size: 15px;
    line-height: 1.7;
  }

  .public-document :global(p) {
    margin: 0 0 14px;
  }

  .public-document :global(ul) {
    margin: 8px 0 18px;
    padding-left: 22px;
  }

  .public-document :global(li + li) {
    margin-top: 7px;
  }

  .public-document :global(code) {
    overflow-wrap: anywhere;
    border-radius: 4px;
    background: #e9eee6;
    padding: 2px 4px;
    color: #33462a;
    font-size: 0.9em;
  }

  .public-document :global(.public-callout) {
    margin: 0 0 24px;
    border: 1px solid #cbd9c5;
    border-radius: 8px;
    background: #f0f5eb;
    padding: 13px 16px;
  }

  .public-document :global(.public-callout p:last-child) {
    margin-bottom: 0;
  }

  .public-page-footer {
    justify-content: center;
    padding: 22px 0 28px;
    color: #697269;
    font-size: 12px;
  }

  .public-page-footer span {
    color: #172d52;
    font-weight: 750;
  }

  @media (max-width: 640px) {
    .public-page-header {
      align-items: flex-start;
      flex-direction: column;
    }

    .public-page-main {
      padding-top: 28px;
    }

    .public-page-intro {
      font-size: 16px;
    }
  }
</style>
