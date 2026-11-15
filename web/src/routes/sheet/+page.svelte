<script lang="ts">
  import { characterSheet } from '@2tamago/core';
  import SheetHistory from '#lib/components/SheetHistory.svelte';
  import SheetStats from '#lib/components/SheetStats.svelte';
  import StatBar from '#lib/components/StatBar.svelte';
  import { game } from '#lib/game.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import { moodLabel, stageLabel } from '#lib/texts.ts';

  let pet = $derived(game.pet);
  let hatched = $derived(pet !== null && pet.stage !== 'egg');
  let sheet = $derived(pet && hatched ? characterSheet(pet) : null);
</script>

{#if !pet}
  <h1>{t('nav.sheet')}</h1>
  <p class="card">{t('rpg.no_pet')}</p>
{:else}
  <h1>{t('rpg.title', { name: pet.name })}</h1>
  <p class="muted">{t('rpg.intro')}</p>

  {#if !sheet}
    <p class="card">{t('rpg.egg')}</p>
  {:else}
    <section class="card">
      <h2>{t('rpg.state')} · {stageLabel(pet.stage)}</h2>
      <p><strong>{moodLabel(game.mood ?? 'ok')}</strong></p>
      <div class="bars">
        <StatBar icon="😊" label={t('stat.happiness')} value={pet.stats.happiness} />
        <StatBar icon="🍙" label={t('stat.satiety')} value={pet.stats.satiety} />
        <StatBar icon="⚡" label={t('stat.energy')} value={pet.stats.energy} />
        <StatBar icon="🛁" label={t('stat.hygiene')} value={pet.stats.hygiene} />
        <StatBar icon="❤️" label={t('stat.health')} value={pet.stats.health} />
        <StatBar icon="🎓" label={t('stat.discipline')} value={pet.stats.discipline} />
        <StatBar icon="💞" label={t('stat.bond')} value={pet.bond} />
      </div>
    </section>

    <section class="card">
      <h2>{t('rpg.stats')} · {t('rpg.level', { level: sheet.level })}</h2>
      <SheetStats {sheet} />
    </section>

    <section class="card">
      <h2>{t('rpg.quests')}</h2>
      {#each sheet.quests as quest (quest.id)}
        <div class="quest">
          <strong>{t(`rpg.quest.${quest.id}`)}</strong>
          {#if quest.done}
            <span>✅ {t('rpg.quest_done')}</span>
          {:else if quest.step === 0}
            <span class="muted">{t('rpg.quest_unknown')}</span>
          {:else}
            <span class="muted">{t(`rpg.quest.${quest.id}.hint`)}</span>
            <span>{t('rpg.quest_progress', { step: quest.step, steps: quest.steps })}</span>
          {/if}
        </div>
      {/each}
    </section>

    <section class="card">
      <h2>{t('rpg.history')}</h2>
      <SheetHistory {sheet} name={pet.name} />
    </section>
  {/if}
{/if}

<style>
  section.card {
    margin-block: 1rem;
  }
  .bars {
    display: grid;
    gap: 0.5rem;
  }
  .quest {
    display: grid;
    gap: 0.2rem;
    margin-bottom: 0.75rem;
  }
</style>
