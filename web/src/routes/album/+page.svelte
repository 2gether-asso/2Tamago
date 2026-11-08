<script lang="ts">
  import PetSprite from '#lib/components/PetSprite.svelte';
  import { api } from '#lib/api.ts';
  import { FORM_LABELS, STAGE_LABELS } from '#lib/texts.ts';

  const album = api.album();
  const format = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });
</script>

<h1>Album</h1>
<p class="muted">Les compagnons qui ont partagé ta vie.</p>

{#await album then pets}
  {#if pets.length === 0}
    <p class="card">Ton album est vide pour l’instant.</p>
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
            {STAGE_LABELS[pet.stage]}{pet.form ? ` · ${FORM_LABELS[pet.form]}` : ''}
          </small>
          <small class="muted">
            {format.format(pet.bornAt)} → {pet.endedAt ? format.format(pet.endedAt) : '?'}
          </small>
          <small>{pet.status === 'retired' ? '🌅 Retraité' : '🍃 Parti'}</small>
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
