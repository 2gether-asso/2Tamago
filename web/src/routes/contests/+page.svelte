<script lang="ts">
  import { CONTEST_KINDS, type ContestKind } from '@2tamago/core';
  import type { ContestEntryDto, ContestsOverview } from '@2tamago/core/contracts';
  import PetSprite from '#lib/components/PetSprite.svelte';
  import { api } from '#lib/api.ts';
  import { game } from '#lib/game.svelte.ts';
  import { intlTag, t, type MessageKey } from '#lib/i18n/index.svelte.ts';
  import { toasts } from '#lib/toasts.svelte.ts';

  let overview = $state.raw<ContestsOverview | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);

  function load() {
    api
      .contests()
      .then((o) => (overview = o))
      .catch((e: Error) => (error = e.message));
  }
  $effect(load);

  let day = $derived(new Intl.DateTimeFormat(intlTag(), { dateStyle: 'full' }));
  const MEDALS = ['🥇', '🥈', '🥉'];
  const medal = (rank: number) => MEDALS[rank - 1] ?? `#${rank}`;
  const score = (kind: ContestKind, entry: ContestEntryDto) =>
    t(kind === 'tricks' ? 'contest.points' : 'contest.votes', { count: entry.score });

  async function act(task: () => Promise<unknown>, done?: string) {
    if (busy) return;
    busy = true;
    try {
      await task();
      if (done) toasts.push(done);
      load();
    } catch (e) {
      toasts.push((e as Error).message, 'error');
    } finally {
      busy = false;
    }
  }

  const claim = (kind: ContestKind) =>
    act(async () => {
      const { prize, coins } = await api.contestClaim(kind);
      if (game.player) game.player.coins = coins;
      toasts.push(t('contest.claimed_toast', { count: prize }));
    });
</script>

{#snippet entryRow(kind: ContestKind, entry: ContestEntryDto, canVote: boolean)}
  <li class="entry" class:mine={entry.isMine}>
    <span class="rank">{medal(entry.rank)}</span>
    <a
      class="sprite"
      href={entry.isMine ? '/' : `/village/${entry.petId}`}
      aria-label={entry.petName}
    >
      <PetSprite
        species={entry.species}
        stage={entry.stage}
        form={entry.form}
        color={entry.color}
        traits={entry.traits}
        mood={entry.mood}
        equipped={entry.equipped}
        size={64}
      />
    </a>
    <div class="who">
      <strong>{entry.petName}</strong>
      <small class="muted">
        <a href="/players/{entry.playerId}">{entry.playerName}</a>
        {#if entry.isMine}<span class="chip">{t('contest.you')}</span>{/if}
      </small>
    </div>
    <span class="score">{score(kind, entry)}</span>
    {#if canVote && kind === 'beauty' && !entry.isMine}
      <button
        disabled={busy}
        class:primary={!entry.votedByMe}
        onclick={() => act(() => api.contestVote(entry.playerId))}
      >
        {entry.votedByMe ? t('contest.voted') : t('contest.vote')}
      </button>
    {/if}
  </li>
{/snippet}

<h1>{t('contest.title')}</h1>
<p class="muted">{t('contest.intro')}</p>

{#if error}
  <p class="card">{error}</p>
{:else if overview}
  <p class="muted">{t('contest.ends', { date: day.format(overview.endsAt) })}</p>

  {#each CONTEST_KINDS as kind (kind)}
    {@const board = overview[kind]}
    <section class="card" aria-labelledby="contest-{kind}">
      <h2 id="contest-{kind}">{t(`contest.${kind}.title` as MessageKey)}</h2>
      <p class="muted">{t(`contest.${kind}.hint` as MessageKey)}</p>

      {#if board.problem}
        <p class="muted">{t(`error.${board.problem}` as MessageKey)}</p>
      {:else if kind === 'tricks'}
        <button
          class="primary"
          disabled={busy}
          onclick={() => act(() => api.contestEnter(kind), t('contest.entered_toast'))}
        >
          {board.mine
            ? t('contest.update_tricks')
            : t('contest.enter_tricks', { name: game.pet?.name ?? '' })}
        </button>
      {:else if board.mine}
        <p><strong>{t('contest.entered')}</strong></p>
      {:else}
        <button
          class="primary"
          disabled={busy}
          onclick={() => act(() => api.contestEnter(kind), t('contest.entered_toast'))}
        >
          {t('contest.enter_beauty', { name: game.pet?.name ?? '' })}
        </button>
      {/if}

      {#if board.entries.length === 0}
        <p class="muted">{t('contest.empty')}</p>
      {:else}
        <ol class="board">
          {#each board.entries as entry (entry.playerId)}
            {@render entryRow(kind, entry, true)}
          {/each}
        </ol>
        {#if board.mine && !board.entries.some((entry) => entry.isMine)}
          <ol class="board">{@render entryRow(kind, board.mine, true)}</ol>
        {/if}
      {/if}
    </section>
  {/each}

  {#if overview.last}
    <section class="card" aria-labelledby="contest-last">
      <h2 id="contest-last">{t('contest.last')}</h2>
      {#each overview.last.results as result (result.kind)}
        <h3>{t(`contest.${result.kind}.title` as MessageKey)}</h3>
        <ol class="board">
          {#each result.podium as entry (entry.playerId)}
            {@render entryRow(result.kind, entry, false)}
          {/each}
        </ol>
        {#if result.mine}
          <p class="muted">{t('contest.your_rank', { rank: result.mine.rank })}</p>
        {/if}
        {#if result.prize > 0 && !result.claimed}
          <button class="primary" disabled={busy} onclick={() => claim(result.kind)}>
            {t('contest.claim', { count: result.prize })}
          </button>
        {:else if result.claimed}
          <p class="muted">{t('contest.claimed')}</p>
        {:else if result.mine}
          <p class="muted">{t('contest.no_podium')}</p>
        {/if}
      {/each}
    </section>
  {/if}
{:else}
  <p class="muted">{t('common.loading')}</p>
{/if}

<style>
  section {
    margin: 1rem 0;
  }
  h2,
  h3 {
    margin: 0 0 0.4rem;
  }
  h3 {
    margin-top: 1rem;
    font-size: 1rem;
  }
  .board {
    list-style: none;
    padding: 0;
    margin: 0.8rem 0 0;
    display: grid;
    gap: 0.4rem;
  }
  .entry {
    display: grid;
    grid-template-columns: 2.4rem 4rem 1fr auto auto;
    align-items: center;
    gap: 0.6rem;
    padding: 0.3rem 0.6rem;
    border-radius: var(--radius-md);
    background: var(--surface-2);
  }
  .entry.mine {
    outline: 2px solid var(--accent);
  }
  .rank {
    font-size: 1.4rem;
    text-align: center;
  }
  .who {
    display: grid;
    min-width: 0;
  }
  .score {
    font-weight: 700;
    white-space: nowrap;
  }
  .chip {
    font-size: 0.75rem;
    padding: 0.05rem 0.5rem;
    border-radius: var(--radius-pill);
    background: rgb(var(--accent-rgb) / 0.14);
    color: var(--accent);
    font-weight: 600;
  }
  @media (max-width: 34rem) {
    .entry {
      grid-template-columns: 2rem 4rem 1fr;
    }
    .score,
    .entry button {
      grid-column: 3;
    }
  }
</style>
