<script lang="ts">
  import { untrack } from 'svelte';

  let { value, direction = 1 }: { value: number; direction?: number } = $props();
  const digits = $derived(String(value).padStart(2, '0').split('').map(Number));
  const startingDigits = untrack(() => String(value).padStart(2, '0').split('').map(Number));
  const reel = Array.from({ length: 40 }, (_, index) => index % 10);

  function roll(node: HTMLElement, initial: { digit: number; direction: number }) {
    let digit = initial.digit;
    let position = 10 + digit;
    let animation: Animation | undefined;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const snap = () => {
      animation?.cancel();
      position = 10 + digit;
      node.style.transform = `translateY(-${position}em)`;
    };
    snap();
    preference.addEventListener('change', snap);
    return {
      update(next: typeof initial) {
        if (next.digit === digit) return;
        digit = next.digit;
        if (preference.matches) { snap(); return; }
        // Retarget from the currently visible position, including interrupted rolls.
        const fontSize = parseFloat(getComputedStyle(node).fontSize);
        const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
        const visible = -matrix.m42 / fontSize;
        const from = 10 + ((visible % 10) + 10) % 10;
        position = next.direction > 0
          ? digit + 10 * Math.ceil((from - digit) / 10)
          : digit + 10 * Math.floor((from - digit) / 10);
        animation?.cancel();
        node.style.transform = `translateY(-${position}em)`;
        animation = node.animate([
          { transform: `translateY(-${from}em)` },
          { transform: `translateY(-${position}em)` }
        ], { duration: 300, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
        animation.finished.then(snap).catch(() => {});
      },
      destroy() { animation?.cancel(); preference.removeEventListener('change', snap); }
    };
  }
</script>

<span class="rolling-number" aria-hidden="true">
  {#each digits as digit, index (index)}
    <span class="digit-window">
      <span class="digit-reel" style:transform={`translateY(-${10 + startingDigits[index]}em)`} use:roll={{ digit, direction }}>
        {#each reel as number}<span>{number}</span>{/each}
      </span>
    </span>
  {/each}
</span>

<style>
  .rolling-number { display: inline-flex; height: 1.15em; align-items: center; font-variant-numeric: tabular-nums; letter-spacing: 0; vertical-align: middle; }
  .digit-window { display: block; width: .62em; height: 1em; overflow: hidden; overflow: clip; }
  .digit-reel { display: block; }
  .digit-reel > span { display: grid; height: 1em; place-items: center; line-height: 1; }
</style>
