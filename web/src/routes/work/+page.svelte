<script lang="ts">
  import { WORK } from '@2tamago/core';
  import type { WorkStatus } from '@2tamago/core/contracts';
  import { api } from '#lib/api.ts';
  import { game } from '#lib/game.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import { toasts } from '#lib/toasts.svelte.ts';

  let status = $state.raw<WorkStatus | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let now = $state(Date.now());

  function load() {
    api
      .work()
      .then((s) => (status = s))
      .catch((e: Error) => (error = e.message));
  }
  $effect(load);
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });

  /** Time left before `at`, as "12 min 05 s"; null once it has passed. */
  function wait(at: number | undefined): string | null {
    const left = Math.ceil(((at ?? 0) - (now + game.clockOffset)) / 1000);
    if (left <= 0) return null;
    const minutes = Math.floor(left / 60);
    const seconds = String(left % 60).padStart(2, '0');
    return `${minutes} min ${seconds} s`;
  }
  let playerWait = $derived(wait(status?.playerAvailableAt));
  let petWait = $derived(wait(status?.petAvailableAt));

  // The skill game: a few sums, three answers each.
  interface Question {
    text: string;
    choices: number[];
    answer: number;
  }
  function question(): Question {
    const a = 2 + Math.floor(Math.random() * 18);
    const b = 2 + Math.floor(Math.random() * 18);
    const answer = a + b;
    const choices = new Set<number>([answer]);
    while (choices.size < 3) {
      const wrong = answer + (Math.floor(Math.random() * 7) - 3 || 4);
      if (wrong > 0) choices.add(wrong);
    }
    return { text: `${a} + ${b}`, choices: [...choices].sort(() => Math.random() - 0.5), answer };
  }
  let playing = $state(false);
  let round = $state(0);
  let score = $state(0);
  let current = $state<Question>(question());

  function start() {
    playing = true;
    round = 0;
    score = 0;
    current = question();
  }
  function choose(value: number) {
    if (value === current.answer) score++;
    round++;
    current = question();
  }

  async function run(task: () => Promise<void>) {
    if (busy) return;
    busy = true;
    try {
      await task();
    } catch (e) {
      toasts.push((e as Error).message, 'error');
    } finally {
      busy = false;
      load();
    }
  }

  const cashIn = () =>
    run(async () => {
      const result = await api.workPlayer(score);
      playing = false;
      if (game.player) game.player.coins = result.coins;
      toasts.push(t('work.player.done', { count: result.earned }));
    });

  const sendPet = () =>
    run(async () => {
      const result = await api.workPet();
      if (game.player) game.player.coins = result.coins;
      game.snapshot = result.pet;
      toasts.push(t('work.pet.done', { name: result.pet.state.name, count: result.earned }));
    });
</script>

<h1>{t('work.title')}</h1>
<p class="muted">{t('work.intro')}</p>
{#if error}<p class="error">{error}</p>{/if}

<section class="card">
  <h2>{t('work.player.title')}</h2>
  <p>
    {t('work.player.text', { rounds: WORK.rounds, coins: WORK.coinsPerPoint })}
  </p>
  {#if !playing}
    <button class="primary" disabled={busy || !status || playerWait !== null} onclick={start}>
      {t('work.player.start')}
    </button>
    <small class="muted">
      {playerWait ? t('work.wait', { time: playerWait }) : t('work.ready')}
    </small>
  {:else if round < WORK.rounds}
    <p>{t('work.question', { round: round + 1, total: WORK.rounds, score })}</p>
    <p class="sum">{current.text}</p>
    <div class="row">
      {#each current.choices as choice (choice)}
        <button class="big" onclick={() => choose(choice)}>{choice}</button>
      {/each}
    </div>
    <button class="link" onclick={() => (playing = false)}>{t('work.cancel')}</button>
  {:else}
    <p class="sum">{t('work.final', { score, total: WORK.rounds })}</p>
    <button class="primary" disabled={busy} onclick={cashIn}>{t('work.submit')}</button>
  {/if}
</section>

<section class="card">
  {#if game.snapshot}
    <h2>{t('work.pet.title', { name: game.snapshot.state.name })}</h2>
    {#if status}
      <p>{t('work.pet.text', { min: status.petWageRange.min, max: status.petWageRange.max })}</p>
    {/if}
    <button class="primary" disabled={busy || !status || petWait !== null} onclick={sendPet}>
      {t('work.pet.start')}
    </button>
    <small class="muted">{petWait ? t('work.wait', { time: petWait }) : t('work.ready')}</small>
  {:else}
    <p class="muted">{t('work.pet.no_pet')}</p>
  {/if}
</section>

<style>
  section {
    margin: 1rem 0;
  }
  h2 {
    margin: 0 0 0.4rem;
  }
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
  .sum {
    font-size: 1.6rem;
    font-weight: bold;
    text-align: center;
  }
</style>
