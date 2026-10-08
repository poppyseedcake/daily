<script lang="ts">
  import { page } from '$app/state';
  import { ArrowRight, RotateCw } from '@lucide/svelte';
  import DailyLogo from './DailyLogo.svelte';
  import './errorPage.css';

  let { status, preview = false }: { status: number; preview?: boolean } = $props();
  const notFound = $derived(status === 404);
  const serverError = $derived(status >= 500);
  const retryHref = $derived(page.url.pathname + page.url.search + page.url.hash);
  const heading = $derived(
    notFound ? 'A page\nout of place.' : serverError ? 'Daily,\non pause.' : 'We couldn’t open this page.'
  );
  const description = $derived(
    notFound
      ? 'We couldn’t find this page.\nCheck the address or return to Daily.'
      : serverError
        ? 'Daily couldn’t load this page.\nTry again in a moment.'
        : 'Error ' + status + '. Please return to Daily and try again.'
  );

  function retryPage(event: MouseEvent) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.location.reload();
  }
</script>

<section
  class="error-page"
  class:error-page--preview={preview}
  class:error-page--not-found={notFound}
  class:error-page--server={serverError}
  class:error-page--other={!notFound && !serverError}
  aria-label={'Error ' + status}
>
  <header class="error-page__header error-page__container">
    <a class="error-page__brand" href="/" aria-label="Daily home"><DailyLogo /></a>
  </header>

  <main class="error-page__main error-page__container">
    <div class="error-page__message">
      <h1>{#each heading.split('\n') as line}<span>{line.endsWith('.') || line.endsWith(',') ? line.slice(0, -1) : line}{#if line.endsWith('.')}<i class="error-page__period">.</i>{:else if line.endsWith(',')}<i class="error-page__comma">,</i>{/if}</span>{' '}{/each}</h1>
      <p class="error-page__description">{#each description.split('\n') as line}<span>{line}</span>{' '}{/each}</p>
      <div class="error-page__actions">
        <a
          class="error-page__primary"
          href={serverError ? retryHref : '/'}
          data-sveltekit-reload={serverError || undefined}
          onclick={serverError ? retryPage : undefined}
        >
          <span>{serverError ? 'Try again' : 'Go to Daily'}</span>
          {#if serverError}
            <RotateCw size={20} strokeWidth={1.75} stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" />
          {:else}
            <ArrowRight size={20} strokeWidth={1.75} stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" />
          {/if}
        </a>
        {#if serverError}
          <a class="error-page__secondary" href="/">Back to Daily</a>
        {/if}
      </div>
    </div>
    <div class="error-page__visual">
      <svg viewBox="0 0 336 336" fill="none" aria-hidden="true">
        <circle cx="80" cy="80" r="80" fill="var(--error-sage)" />
        <rect x="176" y="176" width="160" height="160" rx="52" fill="var(--error-olive)" />
        {#if serverError}
          <path d="M0 212a36 36 0 0 1 72 0v124H0Zm88 0a36 36 0 0 1 72 0v124H88Z" fill="var(--error-ink)" />
        {:else}
          <path d="M0 256a80 80 0 0 1 160 0v80H0Z" fill="var(--error-ink)" />
        {/if}
        {#if notFound}
          <path d="M256 1.25H334.75V80a78.75 78.75 0 1 1-78.75-78.75Z" stroke="#75866c" stroke-width="2.5" stroke-dasharray="17.5 17.5" />
          <text x="256" y="83" text-anchor="middle" dominant-baseline="middle" class="error-page__code error-page__code--missing">{status}</text>
          <path d="M256 0H336V80a80 80 0 1 1-80-80Z" fill="var(--error-pale-blue)" stroke="var(--error-ink)" stroke-width="8" stroke-linejoin="round" transform="translate(100 -130) rotate(12 256 80)" />
        {:else}
          <path d="M256 0H336V80a80 80 0 1 1-80-80Z" fill={serverError ? 'var(--error-pale-blue)' : 'var(--error-ink)'} stroke={serverError ? 'var(--error-ink)' : undefined} stroke-width={serverError ? 8 : undefined} stroke-linejoin={serverError ? 'round' : undefined} />
          <text x="256" y="83" text-anchor="middle" dominant-baseline="middle" class="error-page__code">{status}</text>
        {/if}
      </svg>
    </div>
  </main>

  <footer class="error-page__footer error-page__container">
    <nav aria-label="Legal">
      <a href="/privacy">Privacy</a><a href="/terms">Terms</a>
    </nav>
  </footer>
</section>
