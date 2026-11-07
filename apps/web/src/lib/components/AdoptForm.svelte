<script lang="ts">
  import { SPECIES, SPECIES_LABELS, type Species } from '@2tamago/core';
  import { game } from '../game.svelte.ts';
  import PetSprite from './PetSprite.svelte';

  let name = $state('');
  let species = $state<Species>('mochi');
  let color = $state(Math.floor(Math.random() * 360));

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    await game.adopt(name.trim(), species, color);
  }
</script>

<form class="card adopt" onsubmit={submit}>
  <h2>Adopter un compagnon</h2>
  <div class="species">
    {#each SPECIES as option (option)}
      <button
        type="button"
        class:selected={species === option}
        onclick={() => (species = option)}
        aria-pressed={species === option}
      >
        <PetSprite species={option} stage="child" form={null} {color} mood="happy" size={110} />
        {SPECIES_LABELS[option]}
      </button>
    {/each}
  </div>
  <label>
    Couleur
    <input
      type="range"
      min="0"
      max="359"
      bind:value={color}
      style:accent-color="hsl({color} 70% 60%)"
    />
  </label>
  <label>
    Nom
    <input bind:value={name} maxlength="20" required placeholder="Pompon" />
  </label>
  <button class="primary" disabled={game.busy || !name.trim()}>Recevoir mon œuf 🥚</button>
</form>

<style>
  .adopt {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: center;
  }
  .species {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
    justify-content: center;
  }
  .species button {
    display: flex;
    flex-direction: column;
    align-items: center;
    border-radius: var(--radius);
    padding: 0.4rem 0.8rem 0.8rem;
  }
  .species button.selected {
    border: 2px solid var(--accent);
    background: var(--surface-2);
  }
  label {
    display: flex;
    gap: 0.8rem;
    align-items: center;
  }
</style>
