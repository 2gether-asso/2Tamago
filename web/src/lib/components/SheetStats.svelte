<script lang="ts">
  import {
    MAX_STAT,
    RPG_STATS,
    XP_PER_POINT,
    type CharacterSheet,
    type RpgStat,
  } from '@2tamago/core';
  import { t } from '#lib/i18n/index.svelte.ts';

  interface Props {
    sheet: CharacterSheet;
    /** Show the progress towards the next point (own companion only). */
    showProgress?: boolean;
  }
  let { sheet, showProgress = true }: Props = $props();

  const ICONS: Record<RpgStat, string> = {
    vigor: '💪',
    agility: '🤸',
    wit: '🧠',
    charm: '💖',
    luck: '🍀',
  };
</script>

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
      {#if showProgress}
        <small class="muted hint">
          {sheet.stats[stat] >= MAX_STAT
            ? t('rpg.maxed')
            : t('rpg.progress', { xp: sheet.progress[stat], max: XP_PER_POINT })}
        </small>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .stats {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.75rem;
    text-align: left;
  }
  li {
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
</style>
