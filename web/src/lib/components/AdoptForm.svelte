<script lang="ts">
  import { SPECIES, SPECIES_LABELS, type Species } from '@2tamago/core';
  import { game } from '../game.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import PetSprite from './PetSprite.svelte';

  let name = $state('');
  let species = $state<Species>('mochi');
  let color = $state(Math.floor(Math.random() * 360));

  const NAMES = [
    'Pompon',
    'Mochi',
    'Biscuit',
    'Nougat',
    'Truffe',
    'Praline',
    'Cacahuète',
    'Chouchou',
    'Pixel',
    'Bubulle',
    'Cookie',
    'Wasabi',
    'Miette',
    'Tofu',
    'Pistache',
    'Caramel',
    'Noisette',
    'Gaufre',
    'Sushi',
    'Boba',
    'Kiwi',
    'Mochi-Chan',
    'Flocon',
    'Perle',
  ];

  const pick = <T,>(items: readonly T[], except?: T): T => {
    const pool = items.length > 1 ? items.filter((item) => item !== except) : items;
    return pool[Math.floor(Math.random() * pool.length)]!;
  };
  const randomizeName = () => (name = pick(NAMES, name.trim()));
  const randomizeSpecies = () => (species = pick(SPECIES, species));
  const randomizeColor = () => (color = Math.floor(Math.random() * 360));
  /** Shuffles every field; nothing is submitted, so the player can still tweak the result. */
  function randomizeAll() {
    randomizeName();
    randomizeSpecies();
    randomizeColor();
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    await game.adopt(name.trim(), species, color);
  }
</script>

<form class="card adopt" onsubmit={submit}>
  <h2>{t('adopt.title')}</h2>
  <button type="button" class="shuffle-all" onclick={randomizeAll}>
    🎲 {t('adopt.randomize_all')}
  </button>
  <p class="hint">{t('adopt.randomize_hint')}</p>
  <div class="row">
    <span>{t('adopt.species')}</span>
    <button
      type="button"
      class="dice"
      onclick={randomizeSpecies}
      title={t('adopt.randomize_species')}
      aria-label={t('adopt.randomize_species')}>🎲</button
    >
  </div>
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
  <div class="row">
    <label>
      {t('adopt.color')}
      <input
        type="range"
        min="0"
        max="359"
        bind:value={color}
        style:accent-color="hsl({color} 70% 60%)"
      />
    </label>
    <button
      type="button"
      class="dice"
      onclick={randomizeColor}
      title={t('adopt.randomize_color')}
      aria-label={t('adopt.randomize_color')}>🎲</button
    >
  </div>
  <div class="row">
    <label>
      {t('adopt.name')}
      <input
        bind:value={name}
        maxlength="20"
        required
        placeholder="Pompon"
        title={t('adopt.name_hint')}
      />
    </label>
    <button
      type="button"
      class="dice"
      onclick={randomizeName}
      title={t('adopt.randomize_name')}
      aria-label={t('adopt.randomize_name')}>🎲</button
    >
  </div>
  <button class="primary" disabled={game.busy || !name.trim()}>{t('adopt.submit')}</button>
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
  .row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .hint {
    margin: 0;
    font-size: 0.85rem;
    opacity: 0.7;
    text-align: center;
  }
  .dice {
    padding: 0.2rem 0.5rem;
  }
  label {
    display: flex;
    gap: 0.8rem;
    align-items: center;
  }
</style>
