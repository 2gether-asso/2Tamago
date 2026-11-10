<script lang="ts">
  import { isSnack, type ItemId } from '@2tamago/core';
  import type { CareActionBody, VisitResponse } from '@2tamago/core/contracts';
  import PetSprite from '#lib/components/PetSprite.svelte';
  import RoomScene from '#lib/components/RoomScene.svelte';
  import StatBar from '#lib/components/StatBar.svelte';
  import { api } from '#lib/api.ts';
  import { game } from '#lib/game.svelte.ts';
  import { toasts } from '#lib/toasts.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import { itemLabel, moodLabel, stageLabel } from '#lib/texts.ts';
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

  /** Care given as the caretaker of this companion (a daycare stay). */
  async function care(action: CareActionBody) {
    const id = visit?.daycareId;
    if (!id) return;
    await interact(() => api.daycareCare(id, action));
  }

  async function interact(
    task: () => Promise<import('@2tamago/core/contracts').ActionResponse>,
    after?: () => void,
  ) {
    if (!visit) return;
    busy = true;
    try {
      const response = await task();
      visit = { ...visit, pet: response.pet };
      game.applyResponse(response);
      after?.();
    } catch (e) {
      toasts.push((e as Error).message, 'error');
    } finally {
      busy = false;
    }
  }
</script>

<a href="/village">{t('visit.back')}</a>

{#if error}
  <p class="card">{error}</p>
{:else if visit}
  {@const pet = visit.pet.state}
  <section class="card visit">
    <h1>{pet.name}</h1>
    <p class="muted">
      {t('visit.owner', { owner: visit.pet.ownerName, stage: stageLabel(pet.stage) })}
    </p>
    <p>
      <a href="/players/{visit.pet.ownerId}">{t('profile.view', { name: visit.pet.ownerName })}</a>
    </p>
    <div class="scene">
      <RoomScene room={visit.room} night={pet.asleep}>
        <PetSprite
          species={pet.species}
          stage={pet.stage}
          form={pet.form}
          color={pet.color}
          traits={pet.traits}
          mood={visit.pet.mood}
          equipped={pet.equipped}
        />
      </RoomScene>
    </div>
    <p><strong>{moodLabel(visit.pet.mood)}</strong></p>

    {#if visit.daycareId}
      <div class="care">
        <h2>{t('daycare.care_title', { name: pet.name })}</h2>
        <p class="muted">{t('daycare.care_intro')}</p>
        <div class="actions">
          <button disabled={busy} onclick={() => care({ type: 'feed' })}>{t('action.feed')}</button>
          <button disabled={busy} onclick={() => care({ type: 'clean' })}
            >{t('action.clean')}</button
          >
          {#if pet.sickSince !== null}
            <button disabled={busy} onclick={() => care({ type: 'medicine' })}
              >{t('action.medicine')}</button
            >
          {/if}
          {#if pet.asleep}
            <button disabled={busy} onclick={() => care({ type: 'wake' })}
              >{t('action.wake')}</button
            >
          {:else}
            <button disabled={busy} onclick={() => care({ type: 'sleep' })}
              >{t('action.sleep')}</button
            >
          {/if}
          {#if pet.lightsOff}
            <button disabled={busy} onclick={() => care({ type: 'lights', on: true })}
              >{t('action.lights_on')}</button
            >
          {:else}
            <button disabled={busy} onclick={() => care({ type: 'lights', on: false })}
              >{t('action.lights_off')}</button
            >
          {/if}
          <button disabled={busy} onclick={() => care({ type: 'praise' })}
            >{t('action.praise')}</button
          >
          <button disabled={busy} onclick={() => care({ type: 'scold' })}
            >{t('action.scold')}</button
          >
          <button disabled={busy} onclick={() => care({ type: 'caress' })}
            >{t('daycare.care_caress')}</button
          >
        </div>
      </div>
    {/if}

    {#if !isMine && pet.vacationSince != null}
      <p class="muted">{t('visit.on_vacation', { name: pet.name })}</p>
    {:else if !isMine && pet.stage !== 'egg'}
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
          {visit.caressedToday ? t('visit.caressed') : t('visit.caress')}
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
            {t('visit.gift', { item: itemLabel(id), count })}
          </button>
        {/each}
      </div>
    {/if}
  </section>

  {#if pet.stage !== 'egg'}
    <section class="card">
      <StatBar icon="😊" label={t('stat.happiness')} value={pet.stats.happiness} />
      <StatBar icon="🍙" label={t('stat.satiety')} value={pet.stats.satiety} />
      {#if visit.daycareId}
        <StatBar icon="⚡" label={t('stat.energy')} value={pet.stats.energy} />
        <StatBar icon="🛁" label={t('stat.hygiene')} value={pet.stats.hygiene} />
        <StatBar icon="❤️" label={t('stat.health')} value={pet.stats.health} />
        <StatBar icon="🎓" label={t('stat.discipline')} value={pet.stats.discipline} />
      {/if}
    </section>
  {/if}
{:else}
  <p class="muted">{t('common.loading')}</p>
{/if}

<style>
  .visit {
    text-align: center;
    margin: 1rem 0;
  }
  .scene {
    margin: 0.8rem auto;
    max-width: 26rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: center;
  }
</style>
