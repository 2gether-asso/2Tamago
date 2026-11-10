<script lang="ts">
  /**
   * Mini-games, in the spirit of the classic virtual pets. One is drawn at random each time:
   * guess where it looks, guess if the next number is higher or lower, beat it at
   * rock-paper-scissors (three rounds each), or catch the treats it drops in a basket. The score
   * (0-3) goes to the API.
   */
  import { t, type MessageKey } from '#lib/i18n/index.svelte.ts';
  import CatchGame from './CatchGame.svelte';

  interface Props {
    name: string;
    onfinish: (score: number) => void;
    oncancel: () => void;
  }
  let { name, onfinish, oncancel }: Props = $props();

  type Kind = 'look' | 'number' | 'hand' | 'catch';
  const TITLES: Record<Kind, MessageKey> = {
    look: 'minigame.title_look',
    number: 'minigame.title_number',
    hand: 'minigame.title_hand',
    catch: 'minigame.title_catch',
  };
  const KINDS: Kind[] = ['look', 'number', 'hand', 'catch'];
  const CHOICES: Record<Kind, { id: string; label: MessageKey }[]> = {
    look: [
      { id: 'left', label: 'minigame.left' },
      { id: 'right', label: 'minigame.right' },
    ],
    number: [
      { id: 'higher', label: 'minigame.higher' },
      { id: 'lower', label: 'minigame.lower' },
    ],
    hand: [
      { id: 'rock', label: 'minigame.rock' },
      { id: 'paper', label: 'minigame.paper' },
      { id: 'scissors', label: 'minigame.scissors' },
    ],
    // Played in `CatchGame`: no round-by-round choices.
    catch: [],
  };
  const BEATS: Record<string, string> = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
  const SHOWN: Record<string, string> = {
    left: '⬅️',
    right: '➡️',
    rock: '✊',
    paper: '✋',
    scissors: '✌️',
  };

  const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)] as T;
  const kind = pick(KINDS);
  const ROUNDS = 3;
  let round = $state(0);
  let score = $state(0);
  // The number to compare with, for the "number" game.
  let current = $state(2 + Math.floor(Math.random() * 7));
  let last = $state<{ won: boolean; shown: string } | null>(null);

  function guess(choice: string) {
    let won: boolean;
    let shown: string;
    if (kind === 'number') {
      // Never equal to the current number: a clear answer each time.
      let next = 1 + Math.floor(Math.random() * 9);
      while (next === current) next = 1 + Math.floor(Math.random() * 9);
      won = (choice === 'higher') === next > current;
      shown = `${current} → ${next}`;
      current = next;
    } else if (kind === 'hand') {
      const theirs = pick(['rock', 'paper', 'scissors']);
      // A draw counts as a miss.
      won = BEATS[choice] === theirs;
      shown = SHOWN[theirs] ?? '';
    } else {
      const actual = Math.random() < 0.5 ? 'left' : 'right';
      won = actual === choice;
      shown = SHOWN[actual] ?? '';
    }
    last = { won, shown };
    if (won) score++;
    round++;
  }
</script>

<div class="backdrop">
  <div class="card dialog">
    <h2>{t(TITLES[kind], { name })}</h2>
    {#if kind === 'catch'}
      <CatchGame {onfinish} {oncancel} />
    {:else if round < ROUNDS}
      <p>{t('minigame.round', { round: round + 1, total: ROUNDS, score })}</p>
      {#if kind === 'number'}
        <p class="number">{current}</p>
      {/if}
      {#if last}
        <p class="result">
          {last.won ? t('minigame.won') : t('minigame.lost')}
          ({last.shown})
        </p>
      {/if}
      <div class="row">
        {#each CHOICES[kind] as choice (choice.id)}
          <button class="big" onclick={() => guess(choice.id)}>{t(choice.label)}</button>
        {/each}
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
  .number {
    font-size: 2.5rem;
    font-weight: bold;
    margin: 0.5rem 0;
  }
  .result {
    font-weight: bold;
  }
</style>
