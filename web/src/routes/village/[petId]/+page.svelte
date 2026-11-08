<script lang="ts">
  import { ITEMS, isSnack, type ItemId } from '@2tamago/core';
  import type { VisitResponse } from '@2tamago/core/contracts';
  import PetSprite from '#lib/components/PetSprite.svelte';
  import StatBar from '#lib/components/StatBar.svelte';
  import { api } from '#lib/api.ts';
  import { game } from '#lib/game.svelte.ts';
  import { toasts } from '#lib/toasts.svelte.ts';
  import { MOOD_LABELS, STAGE_LABELS } from '#lib/texts.ts';
  import type { PageProps } from './$types';

  let { params }: PageProps = $props();
  let visit = $state<VisitResponse | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);

  $effect(() => {
    api
      .visit(params.petId)
      .then((v) => (visit = v))
      .catch((e: Error) => (error = e.message));
  });

  let snacks = $derived(
    (Object.entries(game.inventory) as [ItemId, number][]).filter(
      ([id, n]) => n > 0 && isSnack(id),
    ),
  );
  let isMine = $derived(visit?.pet.ownerId === game.player?.id);

  async function interact(
    task: () => Promise<import('@2tamago/core/contracts').ActionResponse>,
    after?: () => void,
  ) {
    if (!visit) return;
    busy = true;
    try {
      const response = await task();
      visit = { pet: response.pet, caressedToday: visit.caressedToday };
      game.applyResponse(response);
      after?.();
    } catch (e) {
      toasts.push((e as Error).message, 'error');
    } finally {
      busy = false;
    }
  }
</script>

<a href="/village">← Retour au village</a>

{#if error}
  <p class="card">{error}</p>
{:else if visit}
  {@const pet = visit.pet.state}
  <section class="card visit">
    <h1>{pet.name}</h1>
    <p class="muted">Compagnon de {visit.pet.ownerName} · {STAGE_LABELS[pet.stage]}</p>
    <PetSprite
      species={pet.species}
      stage={pet.stage}
      form={pet.form}
      color={pet.color}
      traits={pet.traits}
      mood={visit.pet.mood}
      equipped={pet.equipped}
    />
    <p><strong>{MOOD_LABELS[visit.pet.mood]}</strong></p>

    {#if !isMine && pet.stage !== 'egg'}
      <div class="actions">
        <button
          class="primary"
          disabled={busy || visit.caressedToday || !!pet.outing}
          onclick={() =>
            interact(
              () => api.caress(visit!.pet.id),
              () => (visit!.caressedToday = true),
            )}
        >
          {visit.caressedToday ? 'Déjà caressé aujourd’hui 💞' : 'Caresser 🤚'}
        </button>
        {#each snacks as [id, count] (id)}
          <button
            disabled={busy || pet.asleep || !!pet.outing}
            onclick={() =>
              interact(
                () => api.gift(visit!.pet.id, id),
                () => game.useItem(id),
              )}
          >
            Offrir : {ITEMS[id].label} ×{count}
          </button>
        {/each}
      </div>
    {/if}
  </section>

  {#if pet.stage !== 'egg'}
    <section class="card">
      <StatBar icon="😊" label="Bonheur" value={pet.stats.happiness} />
      <StatBar icon="🍙" label="Satiété" value={pet.stats.satiety} />
    </section>
  {/if}
{:else}
  <p class="muted">Chargement…</p>
{/if}

<style>
  .visit {
    text-align: center;
    margin: 1rem 0;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: center;
  }
</style>
