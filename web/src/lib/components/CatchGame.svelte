<script lang="ts">
  /**
   * The catch game: treats fall, the player moves a basket (pointer, finger or arrow keys) under
   * them. The rules are in `catch.ts`; this draws the field and reads the input. The score (0-3)
   * goes to the API like the other games'.
   */
  import { CATCH, catchScore, isOver, newCatch, stepCatch, type Faller } from '#lib/catch.ts';
  import { t } from '#lib/i18n/index.svelte.ts';

  interface Props {
    onfinish: (score: number) => void;
    oncancel: () => void;
  }
  let { onfinish, oncancel }: Props = $props();

  const GOOD = ['🍪', '🍓', '🍰'];
  const BAD = ['💩', '🌶️', '🧦'];
  /** How far an arrow key moves the basket, per key press (the key repeats while held). */
  const KEY_STEP = 6;

  let game = $state.raw(newCatch());
  /** Where the player wants the basket, in field units. */
  let target = 50;
  let field: HTMLDivElement | undefined = $state();
  let over = $derived(isOver(game));
  let score = $derived(catchScore(game.caught));
  let secondsLeft = $derived(Math.ceil((CATCH.durationMs - game.elapsedMs) / 1000));

  const icon = (f: Faller) => (f.bad ? BAD : GOOD)[f.look];

  $effect(() => {
    let frame = 0;
    let last = performance.now();
    function tick(now: number) {
      // A long pause (the tab went to the background) must not make the items jump.
      const dt = Math.min(50, now - last);
      last = now;
      game = stepCatch(game, dt, target);
      if (!isOver(game)) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  });

  function onPointerMove(event: PointerEvent) {
    if (!field) return;
    const box = field.getBoundingClientRect();
    target = ((event.clientX - box.left) / box.width) * 100;
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft') target = game.basket - KEY_STEP;
    else if (event.key === 'ArrowRight') target = game.basket + KEY_STEP;
    else return;
    event.preventDefault();
  }
</script>

<p class="hint">{t('minigame.catch_hint')}</p>
<p class="status" aria-live="off">
  {t('minigame.catch_status', { seconds: Math.max(0, secondsLeft), caught: game.caught })}
</p>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="field"
  bind:this={field}
  role="application"
  aria-label={t('minigame.catch_field')}
  tabindex="0"
  onpointermove={onPointerMove}
  onpointerdown={onPointerMove}
  onkeydown={onKeyDown}
>
  {#each game.fallers as faller (faller.id)}
    <span class="faller" style:left="{faller.x}%" style:top="{faller.y}%">{icon(faller)}</span>
  {/each}
  <span
    class="basket"
    style:left="{game.basket}%"
    style:top="{CATCH.basketTop}%"
    style:width="{CATCH.basketHalf * 2}%">🧺</span
  >
</div>

{#if over}
  <p class="result" aria-live="polite">{t('minigame.final', { score, total: 3 })}</p>
  <button class="primary" onclick={() => onfinish(score)}>{t('minigame.finish')}</button>
{:else}
  <button class="link" onclick={oncancel}>{t('minigame.stop')}</button>
{/if}

<style>
  .hint {
    margin: 0.2rem 0;
    color: var(--muted);
    font-size: 0.9rem;
  }
  .status {
    margin: 0.2rem 0 0.5rem;
    font-weight: 600;
  }
  .field {
    position: relative;
    height: 16rem;
    margin: 0 auto 0.8rem;
    max-width: 22rem;
    overflow: hidden;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: linear-gradient(var(--scene-top), var(--scene-bottom));
    touch-action: none;
    user-select: none;
    cursor: ew-resize;
  }
  .field:focus-visible {
    outline: 2px solid var(--accent);
  }
  .faller,
  .basket {
    position: absolute;
    transform: translateX(-50%);
    line-height: 1;
    pointer-events: none;
  }
  .faller {
    font-size: 1.6rem;
  }
  .basket {
    font-size: 2.2rem;
    text-align: center;
  }
  .result {
    font-weight: bold;
  }
</style>
