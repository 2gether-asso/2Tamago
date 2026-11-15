<script lang="ts">
  import { characterSheet } from '@2tamago/core';
  import SheetHistory from '#lib/components/SheetHistory.svelte';
  import SheetStats from '#lib/components/SheetStats.svelte';
  import { game } from '#lib/game.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';

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
  .quest {
    display: grid;
    gap: 0.2rem;
    margin-bottom: 0.75rem;
  }
</style>
