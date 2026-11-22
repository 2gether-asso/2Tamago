<script lang="ts">
  import { MISSION_REWARD } from '@2tamago/core';
  import type { DailyMissionsDto } from '@2tamago/core/contracts';
  import { api } from '#lib/api.ts';
  import { game } from '#lib/game.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import { itemLabel, missionLabel } from '#lib/texts.ts';
  import { toasts } from '#lib/toasts.svelte.ts';

  let missions = $state<DailyMissionsDto | null>(null);
  let opening = $state(false);
  let opened = $state<string | null>(null);

  async function load() {
    try {
      missions = await api.missions();
    } catch {
      // The card stays hidden: missions are a bonus, never in the way.
    }
  }

  // Reloaded after anything that may count: each owner action brings a new snapshot or coins.
  $effect(() => {
    void game.snapshot;
    void game.player?.coins;
    void load();
  });

  async function open() {
    opening = true;
    try {
      const result = await api.claimMissions();
      missions = result.missions;
      if (game.player) game.player.coins = result.coins;
      game.inventory = { ...game.inventory, [result.item]: (game.inventory[result.item] ?? 0) + 1 };
      opened = t('mission.opened', { item: itemLabel(result.item), coins: result.bonusCoins });
    } catch (error) {
      toasts.push(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      opening = false;
    }
  }
</script>

{#if missions && missions.missions.length > 0}
  <section class="card missions">
    <h3>{t('mission.title')}</h3>
    {#if !missions.claimed}
      <p class="muted">{t('mission.intro', { coins: MISSION_REWARD.coins })}</p>
    {/if}
    <ul>
      {#each missions.missions as mission (mission.id)}
        {@const done = mission.progress >= mission.target}
        <li class:done>
          <span class="check" aria-hidden="true">{done ? '✅' : '⬜'}</span>
          <span class="label">{missionLabel(mission.id)}</span>
          <span class="count">{mission.progress}/{mission.target}</span>
        </li>
      {/each}
    </ul>
    {#if opened}
      <p class="opened">{opened}</p>
    {:else if missions.allDone && !missions.claimed}
      <p>{t('mission.done_all')}</p>
      <button class="primary" disabled={opening} onclick={open}>{t('mission.open')}</button>
    {/if}
  </section>
{/if}

<style>
  .missions {
    margin-bottom: 1rem;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0;
    display: grid;
    gap: 0.35rem;
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .label {
    flex: 1;
  }
  li.done .label {
    text-decoration: line-through;
    opacity: 0.7;
  }
  .count {
    font-variant-numeric: tabular-nums;
    font-size: 0.85rem;
  }
  .opened {
    font-weight: 600;
  }
</style>
