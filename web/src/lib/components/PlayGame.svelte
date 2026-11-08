<script lang="ts">
  /**
   * Mini-game, in the spirit of the classic virtual pets: the pet will look
   * left or right, guess where. Three rounds, the score (0-3) goes to the API.
   */
  import { t } from '#lib/i18n/index.svelte.ts';

  interface Props {
    name: string;
    onfinish: (score: number) => void;
    oncancel: () => void;
  }
  let { name, onfinish, oncancel }: Props = $props();

  const ROUNDS = 3;
  let round = $state(0);
  let score = $state(0);
  let last = $state<{ guess: 'left' | 'right'; side: 'left' | 'right' } | null>(null);

  function guess(side: 'left' | 'right') {
    const actual = Math.random() < 0.5 ? 'left' : 'right';
    last = { guess: side, side: actual };
    if (actual === side) score++;
    round++;
  }
</script>

<div class="backdrop">
  <div class="card dialog">
    <h2>{t('minigame.title', { name })}</h2>
    {#if round < ROUNDS}
      <p>{t('minigame.round', { round: round + 1, total: ROUNDS, score })}</p>
      {#if last}
        <p class="result">
          {last.guess === last.side ? t('minigame.won') : t('minigame.lost')}
          ({last.side === 'left' ? '⬅️' : '➡️'})
        </p>
      {/if}
      <div class="row">
        <button class="big" onclick={() => guess('left')}>{t('minigame.left')}</button>
        <button class="big" onclick={() => guess('right')}>{t('minigame.right')}</button>
      </div>
      <button class="link" onclick={oncancel}>{t('minigame.stop')}</button>
    {:else}
      <p class="result">{t('minigame.final', { score, total: ROUNDS })}</p>
      <button class="primary" onclick={() => onfinish(score)}>{t('minigame.finish')}</button>
    {/if}
  </div>
</div>

<style>
  .row {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin: 1rem 0;
  }
  .big {
    font-size: 1.2rem;
    padding: 0.8rem 1.4rem;
  }
  .result {
    font-weight: bold;
  }
</style>
