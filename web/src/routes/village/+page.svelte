<script lang="ts">
  import DaycareCaretaker from '#lib/components/DaycareCaretaker.svelte';
  import CommunityGoal from '#lib/components/CommunityGoal.svelte';
  import PetSprite from '#lib/components/PetSprite.svelte';
  import { api } from '#lib/api.ts';
  import { moodLabel, stageLabel } from '#lib/texts.ts';
  import { t } from '#lib/i18n/index.svelte.ts';

  const village = api.village();
</script>

<h1>{t('village.title')}</h1>
<p class="muted">{t('village.intro')}</p>

<DaycareCaretaker />

<CommunityGoal />

{#await village}
  <p class="muted">{t('common.loading')}</p>
{:then pets}
  {#if pets.length === 0}
    <p class="card">{t('village.empty')}</p>
  {:else}
    <div class="grid">
      {#each pets as pet (pet.petId)}
        <a class="card neighbour" href="/village/{pet.petId}">
          <PetSprite
            species={pet.species}
            stage={pet.stage}
            form={pet.form}
            color={pet.color}
            traits={pet.traits}
            mood={pet.mood}
            equipped={pet.equipped}
            size={110}
          />
          <strong
            >{pet.name}{#if pet.favorite}<span title={t('village.favorite')}> ★</span>{/if}</strong
          >
          <small class="muted">{pet.ownerName} · {stageLabel(pet.stage)}</small>
          <small>{moodLabel(pet.mood)}{pet.caressedToday ? ' · 💞' : ''}</small>
        </a>
      {/each}
    </div>
  {/if}
{:catch error}
  <p class="card">{error.message}</p>
{/await}

<style>
  .neighbour {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    color: var(--text);
    text-decoration: none;
  }
</style>
