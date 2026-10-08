<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { page } from '$app/state';
  import { replaceState } from '$app/navigation';
  import { asset, resolve } from '$app/paths';
  import { LogIn, UserPlus, X } from '@lucide/svelte';
  import DailyLogo from './DailyLogo.svelte';
  import { animatedDialog, closeAnimatedDialog } from '$lib/motion';

  type Intent = 'signin' | 'signup';
  const initialRequest = () => {
    const requested = page.url.searchParams.get('auth');
    const error = page.url.searchParams.get('error');
    return {
      open: requested === 'signin' || requested === 'signup',
      intent: (error === 'signup_disabled' || requested === 'signup' ? 'signup' : 'signin') as Intent,
      error
    };
  };
  const initial = initialRequest();
  let intent = $state<Intent>(initial.intent);
  let accepted = $state(false);
  let submitting = $state(false);
  let errorCode = $state(initial.error);
  let hydrated = $state(false);
  let dialog: HTMLDialogElement;
  let trigger: HTMLElement | undefined;
  let previousOverflow = '';
  let isOpen = $state(false);

  const title = $derived(intent === 'signup' ? 'Create your Daily account' : 'Welcome back');
  const errorMessage = $derived(errorCode === 'terms_required'
    ? 'Accept the Terms of Service to create your account.'
    : errorCode === 'signup_disabled'
      ? 'No Daily account was found. Create an account to continue.'
      : errorCode === 'access_denied'
        ? 'Google sign-in was cancelled. You can try again.'
        : errorCode ? 'Google sign-in could not be completed. Try again.' : null);

  function choose(next: Intent) {
    if (submitting) return;
    intent = next;
    accepted = false;
    errorCode = null;
  }

  export function open(next: Intent = 'signin', returnFocusTo: HTMLElement | undefined = undefined) {
    choose(next);
    trigger = returnFocusTo;
    if (isOpen) return;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    isOpen = true;
  }

  function finishClosing() {
    if (!isOpen) return;
    isOpen = false;
    submitting = false;
    accepted = false;
    document.body.style.overflow = previousOverflow;
    if (trigger?.isConnected && !trigger.closest('dialog:not([open])')) trigger.focus();
  }

  function close() {
    void closeAnimatedDialog(dialog, finishClosing);
  }

  function backdropClick(event: MouseEvent) {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  }

  onMount(() => {
    hydrated = true;
    void tick().then(() => {
      if (!initial.open) return;
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      dialog.showModal();
      isOpen = true;
      const url = new URL(page.url);
      url.searchParams.delete('auth');
      url.searchParams.delete('error');
      url.searchParams.delete('error_description');
      replaceState(url, page.state);
    });
    const restoreAfterNavigation = () => { submitting = false; };
    window.addEventListener('pageshow', restoreAfterNavigation);
    return () => {
      window.removeEventListener('pageshow', restoreAfterNavigation);
      if (isOpen) document.body.style.overflow = previousOverflow;
    };
  });
</script>

<dialog
  use:animatedDialog
  bind:this={dialog}
  open={isOpen || (!hydrated && initial.open)}
  aria-labelledby="auth-title"
  aria-describedby="auth-intro"
  oncancel={(event) => { event.preventDefault(); close(); }}
  onclose={finishClosing}
  onclick={backdropClick}
>
  <div class="auth-surface">
    <button class="close" type="button" onclick={close} aria-label="Close sign-in"><X size={19} /></button>
    <nav class="intent-panel" aria-label="Account action">
      <DailyLogo />
      <p class="aside-message">Your day,<br />all together.</p>
      <button class:active={intent === 'signin'} type="button" disabled={submitting} onclick={() => choose('signin')} aria-pressed={intent === 'signin'}><LogIn size={18} /><strong>Sign in</strong></button>
      <button class:active={intent === 'signup'} type="button" disabled={submitting} onclick={() => choose('signup')} aria-pressed={intent === 'signup'}><UserPlus size={18} /><strong>Create account</strong></button>
      <noscript><a href={resolve('/?auth=signin')}>Sign in</a><a href={resolve('/?auth=signup')}>Create account</a></noscript>
    </nav>
    <div class="provider-panel">
      <h2 id="auth-title">{title}</h2>
      <p id="auth-intro" class="intro">{intent === 'signup' ? 'Save your setup and receive your Daily Summary by email.' : 'Sign in with the Google account you used for Daily.'}</p>
      {#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}
      <form method="POST" action={resolve('/auth/google')} onsubmit={() => { submitting = true; errorCode = null; }}>
        <input type="hidden" name="intent" value={intent} />
        {#if intent === 'signup'}
          <label class="consent">
            <input name="termsAccepted" type="checkbox" required bind:checked={accepted} />
            <span>I accept the <a href={resolve('/terms')} target="_blank" rel="noreferrer">Terms of Service</a>.</span>
          </label>
          <p class="privacy">See how we handle your data in our <a href={resolve('/privacy')} target="_blank" rel="noreferrer">Privacy Policy</a>.</p>
        {/if}
        <button class="google-button" type="submit" disabled={submitting || (hydrated && intent === 'signup' && !accepted)} aria-busy={submitting}>
          <img src={asset('/brand/google-g.svg')} width="20" height="20" alt="" />
          <span>{submitting ? 'Opening Google…' : intent === 'signup' ? 'Sign up with Google' : 'Sign in with Google'}</span>
        </button>
      </form>
    </div>
  </div>
</dialog>

<style>
  dialog { margin: auto; padding: 0; border: 0; border-radius: 14px; width: min(720px, calc(100vw - 32px)); max-width: none; max-height: calc(100dvh - 32px); color: #263024; background: #fff; box-shadow: 0 24px 90px rgb(24 32 28 / 22%); font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
  dialog::backdrop { background: rgb(24 32 28 / 25%); }
  .auth-surface { position: relative; display: grid; grid-template-columns: 260px minmax(0, 1fr); max-height: calc(100dvh - 32px); overflow: auto; border-radius: inherit; scrollbar-color: #b7c6ac #f0f4ec; scrollbar-width: thin; }
  .close { position: absolute; top: 14px; right: 14px; width: 36px; height: 36px; display: grid; place-items: center; z-index: 1; border: 0; border-radius: 8px; background: transparent; color: #586150; cursor: pointer; transition: background var(--duration-quick, 150ms) var(--ease-smooth-out, cubic-bezier(0.22, 1, 0.36, 1)); }
  .close:hover { background: #edf1e8; }
  .intent-panel { background: #eef3e7; padding: 32px 22px; display: flex; flex-direction: column; }
  .aside-message { color: #294424; font-size: 30px; line-height: 1.2; letter-spacing: -0.025em; margin: 30px 0; }
  .intent-panel button { display: flex; text-align: left; align-items: center; gap: 12px; padding: 14px 12px; border: 0; border-radius: 8px; background: transparent; color: #4b6240; cursor: pointer; }
  .intent-panel button:hover { background: #e1ead7; }
  .intent-panel button.active { background: #fff; color: #2f4b24; }
  .intent-panel strong { font-size: 14px; font-weight: 700; }
  .provider-panel { padding: 68px 32px 36px; }
  h2 { margin: 0 0 10px; font-size: 27px; font-weight: 650; line-height: 1.15; letter-spacing: -0.025em; text-wrap: balance; color: #172d52; }
  .intro { color: #5c6657; font-size: 14px; line-height: 1.65; margin: 0 0 26px; }
  .google-button { width: 100%; min-height: 44px; display: flex; align-items: center; justify-content: center; gap: 10px; padding: 10px 12px; border: 1px solid #747775; border-radius: 4px; background: #fff; color: #1f1f1f; font-family: Arial, sans-serif; font-size: 14px; font-weight: 500; cursor: pointer; transition: background var(--duration-quick, 150ms) var(--ease-smooth-out, cubic-bezier(0.22, 1, 0.36, 1)); }
  .google-button img { flex-shrink: 0; }
  .google-button:hover { background: #f2f2f2; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .consent { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; line-height: 1.6; cursor: pointer; }
  .consent input { width: 18px; height: 18px; flex: 0 0 auto; margin: 1px 0 0; accent-color: #587542; }
  a { color: #42612f; text-underline-offset: 3px; }
  .privacy { margin: 10px 0 22px; font-size: 12px; line-height: 1.6; color: #5c6657; }
  .error { margin: 0 0 20px; padding: 12px; border-radius: 8px; background: #fff1ed; color: #963b26; font-size: 13px; line-height: 1.5; }
  :is(button, input, a):focus-visible { outline: 2px solid #587542; outline-offset: 4px; }
  ::selection { background: #d9e6cb; color: #172d52; }
  @media (max-width: 600px) {
    .auth-surface { grid-template-columns: 1fr; }
    .intent-panel { padding: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .intent-panel :global(.daily-logo) { grid-column: 1 / -1; }
    .aside-message { display: none; }
    .intent-panel button { padding: 12px 8px; gap: 8px; }
    .intent-panel strong { font-size: 12px; }
    .provider-panel { padding: 28px 24px; }
    h2 { font-size: 25px; }
  }
</style>
