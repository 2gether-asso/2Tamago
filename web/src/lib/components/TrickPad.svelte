<script lang="ts">
  import type { TrickId } from '@2tamago/core';
  import { GESTURES, recognizeGesture, type Point } from '#lib/gestures.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import { trickLabel } from '#lib/texts.ts';

  interface Props {
    /** The companion cannot be trained now (asleep, busy…): the pad stays quiet. */
    disabled?: boolean;
    /** The player drew the command of this trick. */
    ontrick: (trick: TrickId) => void;
  }
  let { disabled = false, ontrick }: Props = $props();

  let stroke = $state.raw<Point[]>([]);
  let drawing = false;
  let message = $state<string | null>(null);
  let fade: ReturnType<typeof setTimeout> | undefined;

  const tricks = Object.keys(GESTURES) as TrickId[];

  /** Where the pointer is in the pad, which is also where it is drawn. */
  function local(event: PointerEvent): Point {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  function start(event: PointerEvent) {
    if (disabled) return;
    clearTimeout(fade);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drawing = true;
    message = null;
    stroke = [local(event)];
  }

  function move(event: PointerEvent) {
    if (drawing) stroke = [...stroke, local(event)];
  }

  function end() {
    if (!drawing) return;
    drawing = false;
    const trick = recognizeGesture(stroke);
    message = trick
      ? t('home.pad_recognized', { trick: trickLabel(trick) })
      : t('home.pad_unknown');
    if (trick) ontrick(trick);
    // The drawing stays a moment, then the pad is clear again.
    fade = setTimeout(() => {
      stroke = [];
      message = null;
    }, 900);
  }

  function cancel() {
    drawing = false;
    stroke = [];
  }
</script>

<div class="pad-wrap">
  <div
    class="pad"
    class:disabled
    role="group"
    aria-label={t('home.pad_label')}
    onpointerdown={start}
    onpointermove={move}
    onpointerup={end}
    onpointercancel={cancel}
  >
    <svg aria-hidden="true">
      <polyline points={stroke.map((p) => `${p.x},${p.y}`).join(' ')} />
    </svg>
    <p aria-live="polite">{message ?? t('home.pad_hint')}</p>
  </div>
  <ul class="legend" aria-label={t('home.pad_gestures')}>
    {#each tricks as id (id)}
      <li><span aria-hidden="true">{GESTURES[id]}</span> {trickLabel(id)}</li>
    {/each}
  </ul>
</div>

<style>
  .pad-wrap {
    margin-top: 0.8rem;
  }
  .pad {
    position: relative;
    min-height: 7rem;
    display: grid;
    place-items: center;
    border: 2px dashed var(--border);
    border-radius: var(--radius-md);
    background: rgb(var(--accent-rgb) / 0.05);
    touch-action: none;
    user-select: none;
    cursor: crosshair;
  }
  .pad.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  polyline {
    fill: none;
    stroke: var(--accent);
    stroke-width: 4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  p {
    margin: 0;
    padding: 0 1rem;
    text-align: center;
    color: var(--muted);
    pointer-events: none;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1rem;
    margin: 0.5rem 0 0;
    padding: 0;
    list-style: none;
    font-size: 0.9rem;
  }
  .legend span {
    display: inline-block;
    min-width: 1.2em;
    text-align: center;
    font-weight: 700;
    color: var(--accent);
  }
</style>
