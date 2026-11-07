<script lang="ts">
  import PetSprite from '#lib/components/PetSprite.svelte';
  import { api } from '#lib/api.ts';
  import { MOOD_LABELS, STAGE_LABELS } from '#lib/texts.ts';

  const village = api.village();
</script>

<h1>Le village</h1>
<p class="muted">
  Les compagnons des autres membres. Passe leur dire bonjour : une caresse par jour fait plaisir (et
  rapporte quelques pièces).
</p>

{#await village}
  <p class="muted">Chargement…</p>
{:then pets}
  {#if pets.length === 0}
    <p class="card">
      Personne au village pour l’instant. Invite d’autres membres à adopter un compagnon !
    </p>
  {:else}
    <div class="grid">
      {#each pets as pet (pet.petId)}
        <a class="card neighbour" href="/village/{pet.petId}">
          <PetSprite
            species={pet.species}
            stage={pet.stage}
            form={pet.form}
            color={pet.color}
            mood={pet.mood}
            equipped={pet.equipped}
            size={110}
          />
          <strong>{pet.name}</strong>
          <small class="muted">{pet.ownerName} · {STAGE_LABELS[pet.stage]}</small>
          <small>{MOOD_LABELS[pet.mood]}{pet.caressedToday ? ' · 💞' : ''}</small>
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
