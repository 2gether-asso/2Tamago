<script lang="ts">
  import PetSprite from '#lib/components/PetSprite.svelte';
  import { api } from '#lib/api.ts';
  import { formLabel, stageLabel } from '#lib/texts.ts';
  import { intlTag, t } from '#lib/i18n/index.svelte.ts';

  const album = api.album();
  let format = $derived(new Intl.DateTimeFormat(intlTag(), { dateStyle: 'medium' }));
</script>

<h1>{t('album.title')}</h1>
<p class="muted">{t('album.intro')}</p>

{#await album then pets}
  {#if pets.length === 0}
    <p class="card">{t('album.empty')}</p>
  {:else}
    <div class="grid">
      {#each pets as pet (pet.petId)}
        <div class="card entry">
          <PetSprite
            species={pet.species}
            stage={pet.stage}
            form={pet.form}
            color={pet.color}
            traits={pet.traits}
            mood={pet.status === 'retired' ? 'happy' : 'gone'}
            size={100}
          />
          <strong>{pet.name}</strong>
          <small class="muted">
            {stageLabel(pet.stage)}{pet.form ? ` · ${formLabel(pet.form)}` : ''}
          </small>
          <small class="muted">
            {format.format(pet.bornAt)} → {pet.endedAt ? format.format(pet.endedAt) : '?'}
          </small>
          <small>{pet.status === 'retired' ? t('album.retired') : t('album.left')}</small>
        </div>
      {/each}
    </div>
  {/if}
{/await}

<style>
  .entry {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
</style>
