<script lang="ts">
  /**
   * Mini-game, in the spirit of the classic virtual pets: the pet will look
   * left or right, guess where. Three rounds, the score (0-3) goes to the API.
   */
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
    <h2>Jeu : où va regarder {name} ?</h2>
    {#if round < ROUNDS}
      <p>Manche {round + 1} / {ROUNDS} — score : {score}</p>
      {#if last}
        <p class="result">
          {last.guess === last.side ? 'Gagné !' : 'Raté…'}
          ({last.side === 'left' ? '⬅️' : '➡️'})
        </p>
      {/if}
      <div class="row">
        <button class="big" onclick={() => guess('left')}>⬅️ Gauche</button>
        <button class="big" onclick={() => guess('right')}>Droite ➡️</button>
      </div>
      <button class="link" onclick={oncancel}>Arrêter</button>
    {:else}
      <p class="result">Score final : {score} / {ROUNDS}</p>
      <button class="primary" onclick={() => onfinish(score)}>Terminer</button>
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
