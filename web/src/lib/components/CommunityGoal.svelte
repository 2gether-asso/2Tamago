<script lang="ts">
  import type { CommunityGoal } from '@2tamago/core/contracts';
  import { api } from '#lib/api.ts';
  import { game } from '#lib/game.svelte.ts';
  import { intlTag, t } from '#lib/i18n/index.svelte.ts';
  import { toasts } from '#lib/toasts.svelte.ts';

  let goal = $state.raw<CommunityGoal | null>(null);
  let claiming = $state(false);

  $effect(() => {
    api
      .communityGoal()
      .then((g) => (goal = g))
      .catch(() => (goal = null));
  });

  let percent = $derived(goal ? Math.min(100, (goal.progress / goal.target) * 100) : 0);
  let endsOn = $derived(
    goal
      ? new Intl.DateTimeFormat(intlTag(), {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }).format(goal.endsAt)
      : '',
  );

  async function claim() {
    if (!goal || claiming) return;
    claiming = true;
    try {
      const { reward, coins } = await api.claimCommunityGoal();
      if (game.player) game.player.coins = coins;
      goal = { ...goal, claimed: true, canClaim: false };
      toasts.push(t('goal.claimed_toast', { count: reward }));
    } catch (e) {
      toasts.push((e as Error).message, 'error');
    } finally {
      claiming = false;
    }
  }
</script>

{#if goal}
  <section class="card goal" aria-labelledby="goal-title">
    <h2 id="goal-title">{t('goal.title')}</h2>
    <p class="muted">{t('goal.intro', { target: goal.target })}</p>
    <div
      class="track"
      role="meter"
      aria-label={t('goal.title')}
      aria-valuemin={0}
      aria-valuemax={goal.target}
      aria-valuenow={Math.min(goal.progress, goal.target)}
    >
      <div class="fill" class:done={goal.reached} style:width="{percent}%"></div>
    </div>
    <p class="figures">
      <strong>{t('goal.progress', { progress: goal.progress, target: goal.target })}</strong>
      <span class="muted"
        >{goal.mine > 0 ? t('goal.mine', { count: goal.mine }) : t('goal.none')}</span
      >
    </p>
    {#if goal.reached}<p class="reached">{t('goal.reached')}</p>{/if}
    {#if goal.canClaim}
      <button type="button" class="claim" disabled={claiming} onclick={claim}>
        {t('goal.claim', { count: goal.reward })}
      </button>
    {:else if goal.claimed}
      <p class="muted">{t('goal.claimed')}</p>
    {/if}
    <small class="muted">{t('goal.ends', { date: endsOn })}</small>
  </section>
{/if}

<style>
  .goal {
    margin: 1rem 0;
  }
  h2 {
    margin: 0 0 0.3rem;
  }
  .track {
    height: 0.9rem;
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--accent-3));
    transition: width 0.4s;
  }
  .fill.done {
    background: linear-gradient(90deg, var(--accent-3), var(--accent));
  }
  .figures {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 1rem;
    margin: 0.5rem 0;
  }
  .reached {
    font-weight: 700;
    margin: 0.3rem 0;
  }
  .claim {
    margin: 0.3rem 0 0.6rem;
    padding: 0.5rem 1.1rem;
    border-radius: var(--radius-pill);
    border: 0;
    font-weight: 600;
    cursor: pointer;
    background: linear-gradient(135deg, var(--accent), var(--accent-3));
    color: var(--accent-text);
  }
  .claim:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
