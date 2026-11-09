<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import type { Form, Mood, PetTraits, Species, Stage } from '@2tamago/core';

  interface Props {
    species: Species;
    stage: Stage;
    form: Form | null;
    color: number;
    /** Coat and eyes; revealed at hatching, so ignored while an egg. */
    traits?: PetTraits | null;
    mood: Mood;
    equipped?: string | null;
    size?: number;
    /** Called when the player strokes the pet long enough (pointer moves on it). */
    oncaress?: () => void;
  }

  let {
    species,
    stage,
    form,
    color,
    traits = null,
    mood,
    equipped = null,
    size = 220,
    oncaress,
  }: Props = $props();

  /**
   * The look of each age: overall size, body proportions (`wide` / `tall` stretch the body) and
   * how big the face is drawn (babies have a big face on a small, round body).
   */
  const LOOK: Record<Stage, { size: number; wide: number; tall: number; face: number }> = {
    egg: { size: 0.8, wide: 1, tall: 1, face: 1 },
    baby: { size: 0.55, wide: 1.12, tall: 0.92, face: 1.3 },
    child: { size: 0.7, wide: 1.05, tall: 0.97, face: 1.15 },
    teen: { size: 0.85, wide: 0.95, tall: 1.06, face: 1.05 },
    adult: { size: 1, wide: 1, tall: 1, face: 1 },
    elder: { size: 0.95, wide: 1.06, tall: 0.94, face: 0.95 },
  };

  const uid = $props.id();
  /** Drawn in this order: the parts behind the body first, so the body outline stays on top. */
  const PARTS = ['back', 'front'] as const;
  let look = $derived(LOOK[stage]);
  let scale = $derived(look.size);
  let pattern = $derived(traits?.pattern ?? 'plain');
  let eyes = $derived(traits?.eyes ?? 'round');
  let sat = $derived(stage === 'elder' ? 35 : mood === 'sick' ? 25 : 70);
  let body = $derived(`hsl(${color} ${sat}% 78%)`);
  let shade = $derived(`hsl(${color} ${sat}% 66%)`);
  let line = $derived(`hsl(${color} 35% 30%)`);
  /** The darker end of the belly gradient, which has to read against the plain body. */
  let deep = $derived(`hsl(${color} ${sat}% 52%)`);
  let closedEyes = $derived(mood === 'sleeping');
  let happyEyes = $derived(mood === 'happy');

  // Stroking: accumulate pointer travel over the pet, then send a caress.
  let travel = 0;
  let lastPoint: { x: number; y: number } | null = null;
  let hearts = $state<{ id: number; x: number }[]>([]);
  let heartId = 0;

  function onPointerMove(event: PointerEvent) {
    if (!oncaress || (event.pointerType !== 'mouse' && event.pressure === 0)) return;
    const point = { x: event.clientX, y: event.clientY };
    if (lastPoint) travel += Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y);
    lastPoint = point;
    if (travel > 400) {
      travel = 0;
      const id = heartId++;
      hearts.push({ id, x: 60 + Math.random() * 80 });
      setTimeout(() => (hearts = hearts.filter((h) => h.id !== id)), 1200);
      oncaress();
    }
  }
</script>

<!--
  The outline of the species, in two parts: what sits `back` (ears, tail, spikes) and the `front`
  body that overlaps it. The coat pattern is applied to each part separately, so a stripe never
  crosses the outline of the body into the parts behind it.
-->
{#snippet silhouette(part: 'back' | 'front')}
  {#if species === 'pyon'}
    {#if part === 'back'}
      <ellipse
        cx="72"
        cy="52"
        rx="14"
        ry="40"
        fill={body}
        stroke={line}
        stroke-width="4"
        transform="rotate(-12 72 52)"
      />
      <ellipse
        cx="128"
        cy="52"
        rx="14"
        ry="40"
        fill={body}
        stroke={line}
        stroke-width="4"
        transform="rotate(12 128 52)"
      />
      <ellipse cx="72" cy="56" rx="6" ry="26" fill={shade} transform="rotate(-12 72 56)" />
      <ellipse cx="128" cy="56" rx="6" ry="26" fill={shade} transform="rotate(12 128 56)" />
    {/if}
    {#if part === 'front'}
      <ellipse cx="100" cy="125" rx="62" ry="58" fill={body} stroke={line} stroke-width="4" />
    {/if}
  {:else if species === 'kumo'}
    {#if part === 'front'}
      <g fill={body} stroke={line} stroke-width="4">
        <circle cx="62" cy="128" r="38" />
        <circle cx="138" cy="128" r="38" />
        <circle cx="100" cy="100" r="50" />
        <rect x="62" y="120" width="76" height="58" rx="10" />
      </g>
      <g fill={body}>
        <circle cx="62" cy="128" r="34" />
        <circle cx="138" cy="128" r="34" />
        <circle cx="100" cy="100" r="46" />
        <rect x="64" y="118" width="72" height="56" />
      </g>
    {/if}
  {:else if species === 'koro'}
    <!-- Dog-like: floppy ears and a wagging tail nub -->
    {#if part === 'back'}
      <ellipse
        cx="40"
        cy="112"
        rx="16"
        ry="34"
        fill={shade}
        stroke={line}
        stroke-width="4"
        transform="rotate(14 40 112)"
      />
      <ellipse
        cx="160"
        cy="112"
        rx="16"
        ry="34"
        fill={shade}
        stroke={line}
        stroke-width="4"
        transform="rotate(-14 160 112)"
      />
      <ellipse
        class="tail"
        cx="166"
        cy="150"
        rx="12"
        ry="8"
        fill={body}
        stroke={line}
        stroke-width="4"
        transform="rotate(-35 166 150)"
      />
    {/if}
    {#if part === 'front'}
      <ellipse cx="100" cy="125" rx="60" ry="56" fill={body} stroke={line} stroke-width="4" />
    {/if}
  {:else if species === 'nyao'}
    <!-- Cat-like: pointy ears and a curled tail -->
    {#if part === 'back'}
      <path
        class="tail"
        d="M 150 160 C 192 158, 190 108, 170 104 C 180 118, 176 140, 146 144 Z"
        fill={shade}
        stroke={line}
        stroke-width="4"
      />
      <path
        d="M 42 110 L 52 30 L 98 78 Z"
        fill={body}
        stroke={line}
        stroke-width="4"
        stroke-linejoin="round"
      />
      <path
        d="M 158 110 L 148 30 L 102 78 Z"
        fill={body}
        stroke={line}
        stroke-width="4"
        stroke-linejoin="round"
      />
      <path d="M 54 92 L 57 46 L 84 72 Z" fill="hsl(350 80% 80%)" />
      <path d="M 146 92 L 143 46 L 116 72 Z" fill="hsl(350 80% 80%)" />
    {/if}
    {#if part === 'front'}
      <ellipse cx="100" cy="128" rx="64" ry="54" fill={body} stroke={line} stroke-width="4" />
    {/if}
  {:else if species === 'toge'}
    <!-- Hedgehog-like: a crest of spikes behind a round body -->
    {#if part === 'back'}
      <path
        d="M 36 142 L 24 112 L 44 114 L 38 82 L 58 94 L 62 60 L 80 78 L 100 48 L 120 78 L 138 60 L 142 94 L 162 82 L 156 114 L 176 112 L 164 142 Z"
        fill={shade}
        stroke={line}
        stroke-width="4"
        stroke-linejoin="round"
      />
    {/if}
    {#if part === 'front'}
      <ellipse cx="100" cy="130" rx="58" ry="50" fill={body} stroke={line} stroke-width="4" />
    {/if}
  {:else if species === 'kame'}
    <!-- Turtle-like: a domed shell behind a low body, and a small tail -->
    {#if part === 'back'}
      <path
        d="M 28 158 C 24 78, 62 44, 100 44 C 138 44, 176 78, 172 158 Z"
        fill={shade}
        stroke={line}
        stroke-width="4"
        stroke-linejoin="round"
      />
      <ellipse
        class="tail"
        cx="172"
        cy="166"
        rx="12"
        ry="7"
        fill={body}
        stroke={line}
        stroke-width="4"
        transform="rotate(20 172 166)"
      />
    {/if}
    {#if part === 'front'}
      <ellipse cx="100" cy="132" rx="52" ry="46" fill={body} stroke={line} stroke-width="4" />
    {/if}
  {:else if part === 'front'}
    <path
      d="M 36 150 C 30 80, 70 58, 100 58 C 130 58, 170 80, 164 150 C 162 176, 38 176, 36 150 Z"
      fill={body}
      stroke={line}
      stroke-width="4"
    />
    <ellipse cx="100" cy="66" rx="10" ry="8" fill={body} stroke={line} stroke-width="4" />
  {/if}
{/snippet}

{#snippet coat()}
  {#if pattern === 'spots'}
    <g fill={shade}>
      <circle cx="66" cy="142" r="11" />
      <circle cx="132" cy="96" r="9" />
      <circle cx="142" cy="150" r="13" />
      <circle cx="104" cy="84" r="7" />
      <circle cx="96" cy="164" r="8" />
    </g>
  {:else if pattern === 'stripes'}
    <g stroke={shade} stroke-width="11" stroke-linecap="round" fill="none">
      <path d="M 24 96 L 60 80" />
      <path d="M 22 126 L 70 106" />
      <path d="M 176 96 L 140 80" />
      <path d="M 178 126 L 130 106" />
      <path d="M 30 156 L 72 140" />
      <path d="M 170 156 L 128 140" />
    </g>
  {:else}
    <rect x="0" y="96" width="200" height="100" fill="url(#fade-{uid})" />
  {/if}
{/snippet}

<div
  class="sprite"
  class:asleep={mood === 'sleeping'}
  class:gone={mood === 'gone' || mood === 'retired'}
  class:egg={stage === 'egg'}
  class:calling={mood === 'calling'}
  class:pettable={!!oncaress}
  style:width="{size}px"
  style:height="{size}px"
  onpointermove={onPointerMove}
  onpointerleave={() => (lastPoint = null)}
  role="img"
  aria-label={t('pet.label')}
>
  <svg viewBox="0 0 200 200" width={size} height={size}>
    <defs>
      <!--
        The coat pattern is masked by the silhouette, shrunk by the outline half-width so it
        stops at the inner edge of the outline instead of painting over it. A mask (unlike a
        clipPath) accepts any structure, such as the groups of the kumo silhouette.
      -->
      <filter id="inset-{uid}" x="0" y="0" width="100%" height="100%">
        <feMorphology operator="erode" radius="1.5" />
      </filter>
      {#each PARTS as part (part)}
        <mask
          id="coat-{part}-{uid}"
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="200"
          height="200"
        >
          <g class="coat-shape" filter="url(#inset-{uid})">{@render silhouette(part)}</g>
        </mask>
      {/each}
      <linearGradient id="fade-{uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color={deep} stop-opacity="0" />
        <stop offset="1" stop-color={deep} stop-opacity="0.85" />
      </linearGradient>
    </defs>
    <ellipse cx="100" cy="182" rx={60 * scale} ry="8" fill="rgb(0 0 0 / 0.12)" />

    {#if stage === 'egg'}
      <g class="wobble">
        <ellipse cx="100" cy="115" rx="52" ry="66" fill={body} stroke={line} stroke-width="4" />
        <circle cx="80" cy="95" r="9" fill={shade} />
        <circle cx="118" cy="128" r="12" fill={shade} />
        <circle cx="96" cy="150" r="6" fill={shade} />
      </g>
    {:else}
      <g
        class="body"
        style:transform="translate(100px, 180px) scale({scale * look.wide}, {scale * look.tall})
        translate(-100px, -180px)"
      >
        {#each PARTS as part (part)}
          {@render silhouette(part)}
          {#if pattern !== 'plain'}
            <g mask="url(#coat-{part}-{uid})">{@render coat()}</g>
          {/if}
        {/each}

        {#if species === 'kame'}
          <!-- Scutes of the shell, above the face -->
          <g stroke={line} stroke-width="3" stroke-linecap="round" fill="none" opacity="0.55">
            <path d="M 100 48 v 24 M 72 62 l 14 10 M 128 62 l -14 -10" />
            <path d="M 52 96 l 20 -10 M 148 96 l -20 -10 M 86 72 h 28" />
          </g>
        {/if}

        <!-- Feet -->
        <ellipse cx="74" cy="178" rx="14" ry="7" fill={shade} stroke={line} stroke-width="3" />
        <ellipse cx="126" cy="178" rx="14" ry="7" fill={shade} stroke={line} stroke-width="3" />

        <!-- Face -->
        <g
          style:transform="translate(100px, 125px) scale({look.face}) translate(-100px, -125px)"
          stroke={line}
          stroke-width="4"
          stroke-linecap="round"
          fill="none"
        >
          {#if closedEyes}
            <path d="M 70 118 q 8 6 16 0" />
            <path d="M 114 118 q 8 6 16 0" />
          {:else if happyEyes}
            <path d="M 70 120 q 8 -10 16 0" />
            <path d="M 114 120 q 8 -10 16 0" />
          {:else if mood === 'sick'}
            <path d="M 72 112 l 12 12 M 84 112 l -12 12" />
            <path d="M 116 112 l 12 12 M 128 112 l -12 12" />
          {:else if eyes === 'sleepy'}
            <path d="M 70 117 h 16 M 114 117 h 16" />
            <path d="M 72 117 a 6 6 0 0 0 12 0 z M 116 117 a 6 6 0 0 0 12 0 z" fill={line} />
          {:else if eyes === 'sparkle'}
            <circle cx="78" cy="117" r="9" fill={line} stroke="none" />
            <circle cx="122" cy="117" r="9" fill={line} stroke="none" />
            <circle cx="81" cy="113" r="3.2" fill="white" stroke="none" />
            <circle cx="125" cy="113" r="3.2" fill="white" stroke="none" />
            <circle cx="75" cy="121" r="1.6" fill="white" stroke="none" />
            <circle cx="119" cy="121" r="1.6" fill="white" stroke="none" />
          {:else if eyes === 'sly'}
            <path d="M 70 114 q 8 -4 16 4 M 130 114 q -8 -4 -16 4" />
            <ellipse cx="79" cy="118" rx="4" ry="3" fill={line} stroke="none" />
            <ellipse cx="121" cy="118" rx="4" ry="3" fill={line} stroke="none" />
          {:else}
            <circle cx="78" cy="117" r="5" fill={line} stroke="none" />
            <circle cx="122" cy="117" r="5" fill={line} stroke="none" />
          {/if}

          {#if mood === 'sad' || mood === 'sick'}
            <path d="M 66 102 l 18 -5 M 134 102 l -18 -5" />
            <path d="M 88 146 q 12 -9 24 0" />
          {:else if mood === 'calling'}
            <ellipse cx="100" cy="144" rx="8" ry="10" fill={line} stroke="none" />
          {:else if !closedEyes}
            <path d="M 88 138 q 12 12 24 0" />
          {/if}

          {#if form === 'rascal'}
            <path d="M 66 98 l 18 6 M 134 98 l -18 6" />
            <path d="M 104 141 l 0 6" stroke-width="3" />
          {/if}
          {#if stage === 'elder'}
            <path d="M 84 132 q 16 8 32 0" stroke-width="5" />
          {/if}
        </g>
        {#if species === 'nyao'}
          <g stroke={line} stroke-width="3" stroke-linecap="round" fill="none">
            <path d="M 54 130 l -26 -4 M 54 138 l -26 6" />
            <path d="M 146 130 l 26 -4 M 146 138 l 26 6" />
          </g>
          <path d="M 96 130 l 8 0 l -4 5 z" fill="hsl(350 70% 65%)" />
        {:else if species === 'koro'}
          <ellipse cx="100" cy="131" rx="7" ry="5" fill={line} />
        {:else if species === 'toge'}
          <ellipse cx="100" cy="131" rx="5" ry="4" fill={line} />
        {:else if species === 'kame'}
          <path d="M 94 130 h 12" stroke={line} stroke-width="3" stroke-linecap="round" />
        {/if}
        {#if form !== 'rascal'}
          <ellipse
            cx="62"
            cy="134"
            rx="9"
            ry="6"
            fill="hsl(350 80% 80%)"
            opacity={form === 'radiant' ? 0.9 : 0.6}
          />
          <ellipse
            cx="138"
            cy="134"
            rx="9"
            ry="6"
            fill="hsl(350 80% 80%)"
            opacity={form === 'radiant' ? 0.9 : 0.6}
          />
        {/if}
        {#if form === 'radiant'}
          <path
            class="sparkle"
            d="M 150 64 l 4 10 l 10 4 l -10 4 l -4 10 l -4 -10 l -10 -4 l 10 -4 z"
            fill="hsl(48 95% 60%)"
          />
        {/if}

        <!-- Accessories -->
        {#if equipped === 'ribbon'}
          <g fill="hsl(340 75% 60%)" stroke={line} stroke-width="3">
            <path d="M 100 70 l -26 -14 l 0 28 z" />
            <path d="M 100 70 l 26 -14 l 0 28 z" />
            <circle cx="100" cy="70" r="7" />
          </g>
        {:else if equipped === 'hat'}
          <g fill="hsl(25 45% 35%)" stroke={line} stroke-width="3">
            <ellipse cx="100" cy="66" rx="48" ry="9" />
            <rect x="74" y="26" width="52" height="40" rx="6" />
          </g>
          <rect x="74" y="52" width="52" height="8" fill="hsl(0 70% 55%)" />
        {:else if equipped === 'glasses'}
          <g fill="rgb(255 255 255 / 0.35)" stroke="hsl(220 30% 20%)" stroke-width="4">
            <circle cx="78" cy="117" r="15" />
            <circle cx="122" cy="117" r="15" />
            <path d="M 93 117 h 14" />
          </g>
        {:else if equipped === 'flower_crown'}
          <path
            d="M 62 74 Q 100 50 138 74"
            fill="none"
            stroke="hsl(125 40% 38%)"
            stroke-width="5"
            stroke-linecap="round"
          />
          <g stroke={line} stroke-width="2">
            <circle cx="70" cy="68" r="8" fill="hsl(340 80% 72%)" />
            <circle cx="100" cy="56" r="9" fill="hsl(48 95% 62%)" />
            <circle cx="130" cy="68" r="8" fill="hsl(270 70% 72%)" />
            <circle cx="85" cy="59" r="6" fill="hsl(200 80% 72%)" />
            <circle cx="115" cy="59" r="6" fill="hsl(340 80% 72%)" />
          </g>
        {:else if equipped === 'starfish'}
          <path
            d="M 100 30 L 107 50 L 128 50 L 111 62 L 118 82 L 100 70 L 82 82 L 89 62 L 72 50 L 93 50 Z"
            fill="hsl(22 90% 62%)"
            stroke={line}
            stroke-width="3"
            stroke-linejoin="round"
          />
        {:else if equipped === 'crown'}
          <path
            d="M 70 70 l 6 -34 l 14 18 l 10 -24 l 10 24 l 14 -18 l 6 34 z"
            fill="hsl(48 95% 58%)"
            stroke={line}
            stroke-width="3"
          />
        {/if}
      </g>
    {/if}

    {#if mood === 'sleeping'}
      <text class="zzz" x="150" y="60" font-size="26" fill={line}>z</text>
      <text class="zzz late" x="165" y="40" font-size="20" fill={line}>z</text>
    {/if}
    {#if mood === 'vacation'}
      <text x="140" y="62" font-size="34">🏖️</text>
    {/if}
    {#if mood === 'calling'}
      <text x="150" y="70" font-size="40" font-weight="bold" fill="hsl(0 75% 55%)">!</text>
    {/if}
  </svg>

  {#each hearts as heart (heart.id)}
    <span class="heart" style:left="{heart.x}%">♥</span>
  {/each}
</div>

<style>
  .sprite {
    position: relative;
    display: inline-block;
    touch-action: none;
    user-select: none;
  }
  .pettable {
    cursor: grab;
  }
  .body {
    animation: bounce 2.4s ease-in-out infinite;
    transform-box: view-box;
  }
  .asleep .body {
    animation: breathe 4s ease-in-out infinite;
  }
  .calling .body {
    animation: shake 0.5s ease-in-out infinite;
  }
  .gone svg {
    opacity: 0.35;
    filter: grayscale(0.8);
  }
  .egg .wobble {
    transform-origin: 100px 180px;
    animation: wobble 3s ease-in-out infinite;
  }
  /* Whatever the colors of the silhouette, in the mask it is a plain white shape. */
  .coat-shape :global(*) {
    fill: #fff;
    stroke: none;
  }
  .tail {
    transform-box: fill-box;
    transform-origin: left center;
    animation: wag 1.4s ease-in-out infinite;
  }
  .zzz {
    animation: float 2.5s ease-in-out infinite;
  }
  .zzz.late {
    animation-delay: 1.2s;
  }
  .sparkle {
    animation: twinkle 1.6s ease-in-out infinite;
    transform-box: fill-box;
    transform-origin: center;
  }
  .heart {
    position: absolute;
    top: 20%;
    color: hsl(345 80% 62%);
    font-size: 1.6rem;
    pointer-events: none;
    animation: rise 1.2s ease-out forwards;
  }
  @keyframes bounce {
    0%,
    100% {
      translate: 0 0;
    }
    50% {
      translate: 0 -6px;
    }
  }
  @keyframes wag {
    0%,
    100% {
      rotate: -8deg;
    }
    50% {
      rotate: 10deg;
    }
  }
  @keyframes breathe {
    0%,
    100% {
      scale: 1 1;
    }
    50% {
      scale: 1.02 0.97;
    }
  }
  @keyframes shake {
    0%,
    100% {
      rotate: 0deg;
    }
    25% {
      rotate: -3deg;
    }
    75% {
      rotate: 3deg;
    }
  }
  @keyframes wobble {
    0%,
    80%,
    100% {
      rotate: 0deg;
    }
    85% {
      rotate: -6deg;
    }
    90% {
      rotate: 6deg;
    }
    95% {
      rotate: -3deg;
    }
  }
  @keyframes float {
    0% {
      opacity: 0;
      translate: 0 8px;
    }
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      translate: 6px -12px;
    }
  }
  @keyframes twinkle {
    0%,
    100% {
      scale: 1;
      opacity: 1;
    }
    50% {
      scale: 0.6;
      opacity: 0.6;
    }
  }
  @keyframes rise {
    from {
      opacity: 1;
      translate: 0 0;
    }
    to {
      opacity: 0;
      translate: 0 -60px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .body,
    .wobble,
    .tail,
    .zzz,
    .sparkle {
      animation: none;
    }
  }
</style>
