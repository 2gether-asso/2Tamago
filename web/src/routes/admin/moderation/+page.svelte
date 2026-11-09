<script lang="ts">
  import type {
    ModerationAction,
    ModerationLogEntry,
    ModerationPerson,
  } from '@2tamago/core/contracts';
  import { api } from '#lib/api.ts';
  import { game } from '#lib/game.svelte.ts';
  import { intlTag, t, type MessageKey } from '#lib/i18n/index.svelte.ts';
  import { toasts } from '#lib/toasts.svelte.ts';

  let words = $state('');
  let wordsLoaded = $state(false);
  let query = $state('');
  let people = $state.raw<ModerationPerson[] | null>(null);
  let log = $state.raw<ModerationLogEntry[]>([]);
  /** The name being typed, for a member or a companion. */
  let editing = $state<{ kind: 'player' | 'pet'; id: string; name: string } | null>(null);
  let busy = $state(false);

  let when = $derived(
    new Intl.DateTimeFormat(intlTag(), { dateStyle: 'short', timeStyle: 'short' }),
  );

  function loadLog() {
    api
      .adminModerationLog()
      .then((entries) => (log = entries))
      .catch(() => {});
  }
  $effect(() => {
    if (!game.player?.isAdmin) return;
    api
      .adminBlockedWords()
      .then((list) => {
        words = list.words.join('\n');
        wordsLoaded = true;
      })
      .catch((e: Error) => toasts.push(e.message, 'error'));
    loadLog();
  });

  async function guarded(task: () => Promise<unknown>, done?: string) {
    if (busy) return;
    busy = true;
    try {
      await task();
      if (done) toasts.push(done);
      loadLog();
    } catch (e) {
      toasts.push((e as Error).message, 'error');
    } finally {
      busy = false;
    }
  }

  const saveWords = (event: SubmitEvent) => {
    event.preventDefault();
    return guarded(async () => {
      const saved = await api.adminSaveBlockedWords(
        words
          .split('\n')
          .map((word) => word.trim())
          .filter(Boolean),
      );
      words = saved.words.join('\n');
    }, t('admin.moderation.words_saved'));
  };

  async function find(event: SubmitEvent) {
    event.preventDefault();
    try {
      people = await api.adminModerationSearch(query);
    } catch (e) {
      toasts.push((e as Error).message, 'error');
    }
  }

  const rename = (event: SubmitEvent) => {
    event.preventDefault();
    const target = editing;
    if (!target) return;
    return guarded(async () => {
      if (target.kind === 'pet') await api.adminRenamePet(target.id, target.name);
      else await api.adminRenamePlayer(target.id, target.name);
      editing = null;
      people = await api.adminModerationSearch(query);
    }, t('admin.moderation.renamed'));
  };

  const unlock = (person: ModerationPerson) =>
    guarded(async () => {
      await api.adminUnlockPlayer(person.playerId);
      people = await api.adminModerationSearch(query);
    }, t('admin.moderation.unlocked'));

  const ACTION_LABEL: Record<ModerationAction, MessageKey> = {
    rename_pet: 'admin.moderation.action_rename_pet',
    rename_player: 'admin.moderation.action_rename_player',
    unlock_player_name: 'admin.moderation.action_unlock',
    blocked_words: 'admin.moderation.action_words',
  };
</script>

{#if !game.player?.isAdmin}
  <p class="card">{t('admin.forbidden')}</p>
{:else}
  <section class="card">
    <h2>{t('admin.moderation.words')}</h2>
    <p class="muted">{t('admin.moderation.words_hint')}</p>
    {#if wordsLoaded}
      <form onsubmit={saveWords}>
        <textarea
          bind:value={words}
          rows="5"
          spellcheck="false"
          aria-label={t('admin.moderation.words')}></textarea>
        <button class="primary" disabled={busy}>{t('admin.save')}</button>
      </form>
    {/if}
  </section>

  <section class="card">
    <h2>{t('admin.moderation.search')}</h2>
    <form class="row" onsubmit={find}>
      <input
        bind:value={query}
        minlength="2"
        maxlength="40"
        placeholder={t('admin.moderation.search_hint')}
        aria-label={t('admin.moderation.search')}
      />
      <button disabled={query.trim().length < 2}>{t('admin.moderation.find')}</button>
    </form>
    {#if people}
      {#if people.length === 0}
        <p class="muted">{t('admin.moderation.nobody')}</p>
      {/if}
      {#each people as person (person.playerId)}
        <div class="person">
          <div>
            <strong>{person.playerName}</strong>
            {#if person.nameLocked}<span class="chip">{t('admin.moderation.locked')}</span>{/if}
            {#if person.petName}<span class="muted"> · {person.petName}</span>{/if}
          </div>
          <div class="row">
            <button
              onclick={() =>
                (editing = { kind: 'player', id: person.playerId, name: person.playerName })}
              >{t('admin.moderation.rename_player')}</button
            >
            {#if person.petId}
              {@const petId = person.petId}
              <button
                onclick={() => (editing = { kind: 'pet', id: petId, name: person.petName ?? '' })}
                >{t('admin.moderation.rename_pet')}</button
              >
            {/if}
            {#if person.nameLocked}
              <button disabled={busy} onclick={() => unlock(person)}
                >{t('admin.moderation.unlock')}</button
              >
            {/if}
          </div>
          {#if editing && editing.id === (editing.kind === 'pet' ? person.petId : person.playerId)}
            <form class="row" onsubmit={rename}>
              <input bind:value={editing.name} minlength="2" maxlength="32" required />
              <button class="primary" disabled={busy}>{t('admin.moderation.apply')}</button>
              <button type="button" onclick={() => (editing = null)}
                >{t('admin.moderation.cancel')}</button
              >
            </form>
          {/if}
        </div>
      {/each}
    {/if}
  </section>

  <section class="card">
    <h2>{t('admin.moderation.log')}</h2>
    {#if log.length === 0}
      <p class="muted">{t('admin.moderation.log_empty')}</p>
    {:else}
      <table>
        <tbody>
          {#each log as entry (entry.id)}
            <tr>
              <td>{when.format(entry.createdAt)}</td>
              <td>{entry.adminName}</td>
              <td>{t(ACTION_LABEL[entry.action])}</td>
              <td>{entry.targetName ?? ''}</td>
              <td>{entry.before ?? '∅'} → {entry.after ?? '∅'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
{/if}

<style>
  section {
    margin: 1rem 0;
  }
  h2 {
    margin: 0 0 0.5rem;
  }
  form {
    display: grid;
    gap: 0.6rem;
  }
  .row {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
    align-items: center;
  }
  form.row {
    display: flex;
  }
  .person {
    display: grid;
    gap: 0.4rem;
    padding: 0.6rem 0;
    border-top: 1px solid var(--border);
  }
  .chip {
    font-size: 0.8rem;
    padding: 0.1rem 0.6rem;
    border-radius: var(--radius-pill);
    background: rgb(var(--accent-rgb) / 0.14);
    color: var(--accent);
    font-weight: 600;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  td {
    padding: 0.3rem 0.5rem;
    border-bottom: 1px solid var(--border);
  }
</style>
