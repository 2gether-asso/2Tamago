<script lang="ts">
  import {
    DECOR_IDS,
    ITEMS,
    ROOM_LIMITS,
    type DecorId,
    type DecorSlot,
    type Room,
  } from '@2tamago/core';
  import PetSprite from '#lib/components/PetSprite.svelte';
  import RoomScene from '#lib/components/RoomScene.svelte';
  import { DECOR_ICON } from '#lib/decor.ts';
  import { game } from '#lib/game.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import { itemLabel } from '#lib/texts.ts';
  import { toasts } from '#lib/toasts.svelte.ts';

  let draft = $state<Room>({ ...game.room, props: [...game.room.props] });
  let busy = $state(false);

  /** What the player owns, for one place. */
  const owned = (slot: DecorSlot): DecorId[] =>
    DECOR_IDS.filter((id) => ITEMS[id].slot === slot && (game.inventory[id] ?? 0) > 0);
  let walls = $derived(owned('wall'));
  let floors = $derived(owned('floor'));
  let props = $derived(owned('prop'));
  let nothing = $derived(walls.length + floors.length + props.length === 0);

  let changed = $derived(
    draft.wall !== game.room.wall ||
      draft.floor !== game.room.floor ||
      draft.props.join() !== game.room.props.join(),
  );

  function toggleProp(id: DecorId) {
    draft.props = draft.props.includes(id)
      ? draft.props.filter((p) => p !== id)
      : [...draft.props, id].slice(0, ROOM_LIMITS.maxProps);
  }

  async function save() {
    if (busy) return;
    busy = true;
    try {
      await game.saveRoom($state.snapshot(draft));
      toasts.push(t('room.saved'));
    } catch (e) {
      toasts.push((e as Error).message, 'error');
    } finally {
      busy = false;
    }
  }

  function reset() {
    draft = { ...game.room, props: [...game.room.props] };
  }

  let pet = $derived(game.pet);
</script>

<h1>{t('room.title')}</h1>
<p class="muted">{t('room.hint')}</p>

<div class="preview">
  <RoomScene room={draft} night={false}>
    {#if pet && pet.stage !== 'egg' && !pet.outing}
      <PetSprite
        species={pet.species}
        stage={pet.stage}
        form={pet.form}
        color={pet.color}
        traits={pet.traits}
        mood={game.mood ?? 'ok'}
        equipped={pet.equipped}
      />
    {/if}
  </RoomScene>
</div>

{#if nothing}
  <section class="card">
    <p>{t('room.nothing_owned')}</p>
    <p><a href="/shop">{t('room.to_shop')}</a></p>
  </section>
{:else}
  <section class="card">
    {#if walls.length > 0}
      <h2>{t('room.wall')}</h2>
      <div class="choices">
        <button aria-pressed={draft.wall === null} onclick={() => (draft.wall = null)}>
          {t('room.none')}
        </button>
        {#each walls as id (id)}
          <button aria-pressed={draft.wall === id} onclick={() => (draft.wall = id)}>
            {DECOR_ICON[id]}
            {itemLabel(id)}
          </button>
        {/each}
      </div>
    {/if}

    {#if floors.length > 0}
      <h2>{t('room.floor')}</h2>
      <div class="choices">
        <button aria-pressed={draft.floor === null} onclick={() => (draft.floor = null)}>
          {t('room.none')}
        </button>
        {#each floors as id (id)}
          <button aria-pressed={draft.floor === id} onclick={() => (draft.floor = id)}>
            {DECOR_ICON[id]}
            {itemLabel(id)}
          </button>
        {/each}
      </div>
    {/if}

    {#if props.length > 0}
      <h2>{t('room.props', { count: draft.props.length, max: ROOM_LIMITS.maxProps })}</h2>
      <div class="choices">
        {#each props as id (id)}
          {@const placed = draft.props.includes(id)}
          <button
            aria-pressed={placed}
            disabled={!placed && draft.props.length >= ROOM_LIMITS.maxProps}
            onclick={() => toggleProp(id)}
          >
            {DECOR_ICON[id]}
            {itemLabel(id)}
          </button>
        {/each}
      </div>
    {/if}

    <div class="actions">
      <button class="primary" disabled={busy || !changed} onclick={save}>{t('room.save')}</button>
      <button disabled={busy || !changed} onclick={reset}>{t('room.reset')}</button>
    </div>
  </section>
{/if}

<style>
  .preview {
    max-width: 26rem;
    margin: 1rem auto;
  }
  h2 {
    margin: 1rem 0 0.4rem;
    font-size: 1.05rem;
  }
  .choices,
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .actions {
    margin-top: 1.2rem;
  }
  .choices button[aria-pressed='true'] {
    border-color: var(--accent);
    background: rgb(var(--accent-rgb) / 0.14);
  }
</style>
