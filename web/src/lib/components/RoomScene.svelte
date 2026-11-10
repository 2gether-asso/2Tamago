<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Room } from '@2tamago/core';
  import { DECOR_ICON } from '#lib/decor.ts';

  interface Props {
    room: Room;
    /** Night (or a sleeping companion): the room darkens. */
    night?: boolean;
    children: Snippet;
  }
  let { room, night = false, children }: Props = $props();
  let furnished = $derived(room.wall !== null || room.floor !== null);
</script>

<div class="room" class:night class:furnished>
  <div class="wall" data-decor={room.wall ?? 'default'}></div>
  <div class="floor" data-decor={room.floor ?? 'default'}></div>
  {#each room.props as prop, i (prop)}
    <span class="prop" data-slot={i} data-prop={prop} aria-hidden="true">{DECOR_ICON[prop]}</span>
  {/each}
  <div class="content">{@render children()}</div>
</div>

<style>
  .room {
    position: relative;
    min-height: 240px;
    display: grid;
    place-items: center;
    overflow: hidden;
    isolation: isolate;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    transition: filter 0.6s;
  }
  /* Without decoration, the room keeps the plain sky of the first version. */
  .room:not(.furnished) {
    background: linear-gradient(var(--scene-top), var(--scene-bottom));
  }
  .room.night:not(.furnished) {
    background: linear-gradient(#141638, #3a2f78);
  }
  .room.furnished.night {
    filter: brightness(0.55) saturate(0.9);
  }
  /* Behind whatever the room holds (the companion, its mess…), above the room's own sky. */
  .wall,
  .floor {
    position: absolute;
    z-index: -1;
    left: 0;
    right: 0;
  }
  .wall {
    top: 0;
    bottom: 26%;
  }
  .floor {
    bottom: 0;
    height: 26%;
    border-top: 2px solid rgb(0 0 0 / 0.12);
  }
  /* The default wall and floor stay see-through: the room's own sky shows. */
  .wall[data-decor='default'],
  .floor[data-decor='default'] {
    background: none;
    border: none;
  }
  .room.furnished .wall[data-decor='default'] {
    background: linear-gradient(var(--scene-top), var(--scene-bottom));
  }
  .room.furnished .floor[data-decor='default'] {
    background: rgb(0 0 0 / 0.12);
  }

  .wall[data-decor='wall_stars'] {
    background:
      radial-gradient(circle at 20% 30%, #fff 0 1.5px, transparent 2px),
      radial-gradient(circle at 70% 20%, #ffe9a8 0 2px, transparent 2.5px),
      radial-gradient(circle at 45% 65%, #fff 0 1px, transparent 1.5px),
      radial-gradient(circle at 85% 70%, #fff 0 1.5px, transparent 2px),
      linear-gradient(#1c1b4d, #3b2d7a);
  }
  .wall[data-decor='wall_meadow'] {
    background:
      radial-gradient(ellipse at 50% 120%, #7ed29a 0 45%, transparent 46%),
      linear-gradient(#bfe9ff, #e6f7d9);
  }
  .wall[data-decor='wall_sea'] {
    background:
      repeating-linear-gradient(180deg, transparent 0 14px, rgb(255 255 255 / 0.22) 14px 16px),
      linear-gradient(#6ec6ff, #2f7fd1);
  }
  .floor[data-decor='floor_wood'] {
    background: repeating-linear-gradient(90deg, #c08a52 0 38px, #a87442 38px 40px);
  }
  .floor[data-decor='floor_tatami'] {
    background:
      repeating-linear-gradient(90deg, transparent 0 58px, rgb(70 90 40 / 0.35) 58px 60px), #c9d99a;
  }
  .floor[data-decor='floor_clouds'] {
    background:
      radial-gradient(ellipse at 25% 40%, #fff 0 30%, transparent 31%),
      radial-gradient(ellipse at 70% 60%, #fff 0 28%, transparent 29%), #b9d8ff;
  }

  .prop {
    position: absolute;
    z-index: -1;
    line-height: 1;
    filter: drop-shadow(0 3px 2px rgb(0 0 0 / 0.25));
  }
  .prop[data-slot='0'] {
    left: 8%;
    bottom: 10%;
    font-size: 2.6rem;
  }
  .prop[data-slot='1'] {
    right: 8%;
    bottom: 10%;
    font-size: 2.6rem;
  }
  .prop[data-slot='2'] {
    left: 14%;
    top: 14%;
    font-size: 1.9rem;
  }
  .content {
    display: contents;
  }
</style>
