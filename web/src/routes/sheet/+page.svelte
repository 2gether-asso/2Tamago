<script lang="ts">
  import { characterSheet, MAX_STAT, RPG_STATS, XP_PER_POINT, type RpgStat } from '@2tamago/core';
  import { game } from '#lib/game.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import { walkEventText } from '#lib/texts.ts';

  const ICONS: Record<RpgStat, string> = {
    vigor: '💪',
    agility: '🤸',
    wit: '🧠',
    charm: '💖',
    luck: '🍀',
  };

  let pet = $derived(game.pet);
  let hatched = $derived(pet !== null && pet.stage !== 'egg');
  let sheet = $derived(pet && hatched ? characterSheet(pet) : null);
  /** Latest first. */
  let history = $derived(sheet ? [...sheet.history].reverse() : []);
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
      <ul class="stats">
        {#each RPG_STATS as stat (stat)}
          <li title={t(`rpg.stat.${stat}.hint`)}>
            <span class="icon" aria-hidden="true">{ICONS[stat]}</span>
            <span class="name">{t(`rpg.stat.${stat}`)}</span>
            <strong class="value">{sheet.stats[stat]}</strong>
            <div
              class="track"
              role="meter"
              aria-label={t(`rpg.stat.${stat}`)}
              aria-valuemin={1}
              aria-valuemax={MAX_STAT}
              aria-valuenow={sheet.stats[stat]}
            >
              <div class="fill" style:width="{(sheet.stats[stat] / MAX_STAT) * 100}%"></div>
            </div>
            <small class="muted hint">
              {sheet.stats[stat] >= MAX_STAT
                ? t('rpg.maxed')
                : t('rpg.progress', { xp: sheet.progress[stat], max: XP_PER_POINT })}
            </small>
          </li>
        {/each}
      </ul>
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
      {#if history.length === 0}
        <p class="muted">{t('rpg.history_empty')}</p>
      {:else}
        <ul class="history">
          {#each history as entry (entry.at)}
            <li>{walkEventText(entry.event, pet.name)}</li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
{/if}

<style>
  .stats,
  .history {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.75rem;
  }
  .stats li {
    display: grid;
    grid-template-columns: 1.5rem 6rem 2rem 1fr;
    align-items: center;
    gap: 0.25rem 0.5rem;
  }
  .hint {
    grid-column: 2 / -1;
  }
  .value {
    text-align: right;
  }
  .track {
    height: 0.6rem;
    border-radius: 0.3rem;
    background: color-mix(in srgb, currentColor 15%, transparent);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--primary, #7c5cff);
  }
  .quest {
    display: grid;
    gap: 0.2rem;
    margin-bottom: 0.75rem;
  }
</style>
