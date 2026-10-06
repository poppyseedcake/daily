import { slide, fly, fade, type TransitionConfig } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';
import { prefersReducedMotion } from 'svelte/motion';

const reducedMotion = () => typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const motionDuration = (milliseconds: number) => {
  // Track Svelte's reactive preference in templates; callbacks read the live media query.
  const preference = prefersReducedMotion.current;
  return (typeof window === 'undefined' ? preference : reducedMotion()) ? 0 : milliseconds;
};

const easeOut = 'cubic-bezier(0.16, 1, 0.3, 1)';

/** Small, reversible reveals; also collapse the minimum height of task rows. */
export function reveal(node: HTMLElement, options: { duration?: number; enabled?: boolean } = {}): TransitionConfig {
  const transition = slide(node, {
    duration: options.enabled === false ? 0 : motionDuration(options.duration ?? 180),
    easing: cubicOut
  });
  const css = transition.css;
  const opacity = Number(getComputedStyle(node).opacity);
  return { ...transition, css: (t, u) => `${css?.(t, u) ?? ''}; min-height: 0; overflow: clip; opacity: ${t * opacity};` };
}

export function favoriteReveal(node: HTMLElement) {
  node.inert = false;
  node.querySelector<SVGElement>('button[aria-pressed] svg')?.style.removeProperty('fill-opacity');
  return fade(node, { duration: motionDuration(120) });
}

export function favoriteExit(node: HTMLElement, { savedList = false }: { savedList?: boolean } = {}) {
  // Search results disappear immediately so an obsolete option cannot be selected.
  if (!savedList) return { duration: 0 };
  if (node.contains(document.activeElement)) {
    const list = node.closest('[role="listbox"]');
    const input = node.closest('dialog')?.querySelector<HTMLElement>(`[aria-controls="${list?.id}"]`);
    input?.focus({ preventScroll: true });
  }
  node.inert = true;
  const star = node.querySelector<SVGElement>('button[aria-pressed] svg');
  if (star) star.style.fillOpacity = '0';
  return reveal(node, { duration: 150 });
}

export function collapseTask(node: HTMLElement, { enabled = true }: { enabled?: boolean } = {}): TransitionConfig {
  if (!enabled || node.classList.contains('daily-task--drop-placeholder')) return { duration: 0 };
  const completing = Boolean(node.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked);
  if (completing) node.dataset.completing = 'true';
  // A disappearing control must not strand keyboard focus on the document body.
  if (node.contains(document.activeElement)) {
    const list = node.parentElement;
    const rows = list ? [...list.children] : [];
    const index = rows.indexOf(node);
    const neighbor = rows[index + 1] ?? rows[index - 1];
    const next = neighbor?.querySelector<HTMLElement>('input, button')
      ?? document.querySelector<HTMLElement>('[aria-label="New Todo Task"]');
    next?.focus({ preventScroll: true });
  }
  node.inert = true;
  return { ...reveal(node, { duration: completing ? 210 : 160 }), delay: completing ? motionDuration(80) : 0 };
}

export function routeView(node: HTMLElement, { direction = 1 }: { direction?: number } = {}) {
  return fly(node, { x: reducedMotion() ? 0 : direction * 10, duration: motionDuration(180), easing: cubicOut });
}

/** The editor swaps controls immediately; only its containing row changes size. */
export function resizeOnChange(node: HTMLElement, initial: boolean) {
  let state = initial;
  let height = node.getBoundingClientRect().height;
  let animation: Animation | undefined;
  let frame = 0;
  const observer = new ResizeObserver(() => {
    if (!frame && animation?.playState !== 'running') height = node.getBoundingClientRect().height;
  });
  observer.observe(node);
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const stop = () => animation?.cancel();
  preference.addEventListener('change', stop);
  return {
    update(next: boolean) {
      if (state === next) return;
      state = next;
      const from = animation?.playState === 'running' ? node.getBoundingClientRect().height : height;
      stop();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        height = node.getBoundingClientRect().height;
        if (preference.matches || from === height) return;
        animation = node.animate([
          { height: `${from}px`, minHeight: 0, overflow: 'clip' },
          { height: `${height}px`, minHeight: 0, overflow: 'clip' }
        ], { duration: 180, easing: easeOut });
      });
    },
    destroy() { stop(); cancelAnimationFrame(frame); observer.disconnect(); preference.removeEventListener('change', stop); }
  };
}

/** Animate state changes only, never initially selected controls or restored data. */
export function selectionFeedback(node: HTMLElement, options: { selected: boolean; kind?: 'favorite' | 'day' | 'section' }) {
  let current = options;
  let animation: Animation | undefined;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const stop = () => animation?.cancel();
  preference.addEventListener('change', stop);
  return {
    update(next: typeof options) {
      const changed = current.selected !== next.selected;
      current = next;
      if (!changed || preference.matches) return;
      stop();
      const target = next.kind === 'day' ? node : node.querySelector('svg');
      if (!target) return;
      const scales = next.kind === 'favorite' && next.selected
        ? [1, 1.2, 0.97, 1]
        : next.kind === 'section' ? [1, 0.85, 1] : [1, 0.92, next.selected ? 1.04 : 1, 1];
      animation = target.animate(scales.map(scale => ({ transform: `scale(${scale})` })), {
        duration: next.kind === 'favorite' ? 240 : 180, easing: easeOut
      });
    },
    destroy() { stop(); preference.removeEventListener('change', stop); }
  };
}

type DialogMotion = { close: (finish: () => void) => Promise<void> };
const dialogs = new WeakMap<HTMLDialogElement, DialogMotion>();

/** Keep native modality and focus restoration until the exit has actually finished. */
export function animatedDialog(node: HTMLDialogElement) {
  let animation: Animation | undefined;
  let closing: Promise<void> | undefined;
  let wasOpen = false;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const stop = () => animation?.finish();
  preference.addEventListener('change', stop);
  node.dataset.motionDialog = '';
  const enter = () => {
    if (!node.open || wasOpen) return;
    wasOpen = true;
    node.inert = false;
    delete node.dataset.motionClosing;
    if (preference.matches) return;
    animation = node.animate([
      { opacity: 0, transform: 'translateY(8px) scale(0.985)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' }
    ], { duration: 200, easing: easeOut });
  };
  const observer = new MutationObserver(() => {
    if (node.open) enter();
    else wasOpen = false;
  });
  observer.observe(node, { attributes: true, attributeFilter: ['open'] });
  enter();
  dialogs.set(node, {
    close(finish) {
      if (closing) return closing;
      if (!node.open || preference.matches) {
        node.close(); finish();
        return Promise.resolve();
      }
      const opacity = getComputedStyle(node).opacity;
      const transform = getComputedStyle(node).transform;
      animation?.cancel();
      node.inert = true;
      node.dataset.motionClosing = '';
      animation = node.animate([
        { opacity, transform },
        { opacity: 0, transform: 'translateY(6px) scale(0.985)' }
      ], { duration: 150, easing: 'ease-in', fill: 'forwards' });
      closing = animation.finished.catch(() => {}).then(() => {
        animation?.cancel();
        node.close();
        node.inert = false;
        delete node.dataset.motionClosing;
        wasOpen = false;
        closing = undefined;
        finish();
      });
      return closing;
    }
  });
  return {
    destroy() {
      observer.disconnect();
      animation?.cancel();
      dialogs.delete(node);
      preference.removeEventListener('change', stop);
    }
  };
}

export function closeAnimatedDialog(node: HTMLDialogElement | undefined, finish: () => void) {
  const motion = node && dialogs.get(node);
  if (motion) return motion.close(finish);
  node?.close();
  finish();
  return Promise.resolve();
}

/** Native details remains usable without JS; closing gets the same motion as opening. */
export function animatedDetails(node: HTMLDetailsElement) {
  const summary = node.querySelector('summary');
  const panel = node.querySelector<HTMLElement>('.daily-account-menu__panel');
  let animation: Animation | undefined;
  let closing = false;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const stop = () => {
    animation?.cancel();
    if (closing) node.open = false;
    closing = false;
  };
  preference.addEventListener('change', stop);
  const toggle = (event: Event) => {
    if (!panel || preference.matches) return;
    event.preventDefault();
    if (closing) { animation?.cancel(); closing = false; return; }
    if (!node.open) {
      node.open = true;
      animation = panel.animate([{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 180, easing: easeOut });
    } else {
      animation?.cancel();
      closing = true;
      animation = panel.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(5px)' }], { duration: 120, easing: 'ease-in' });
      animation.finished.then(() => { node.open = false; closing = false; }).catch(() => {});
    }
  };
  summary?.addEventListener('click', toggle);
  return { destroy() { stop(); summary?.removeEventListener('click', toggle); preference.removeEventListener('change', stop); } };
}
