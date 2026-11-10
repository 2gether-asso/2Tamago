<script lang="ts">
  import type { AccountOverview } from '@2tamago/core/contracts';
  import { goto } from '$app/navigation';
  import { api } from '#lib/api.ts';
  import { events } from '#lib/events.svelte.ts';
  import { game } from '#lib/game.svelte.ts';
  import { hasMessage, intlTag, t, type MessageKey } from '#lib/i18n/index.svelte.ts';
  import { toasts } from '#lib/toasts.svelte.ts';

  let account = $state.raw<AccountOverview | null>(null);
  let name = $state('');
  let busy = $state(false);
  let confirmName = $state('');

  let when = $derived(
    new Intl.DateTimeFormat(intlTag(), { dateStyle: 'short', timeStyle: 'short' }),
  );
  let others = $derived(account?.sessions.filter((s) => !s.current) ?? []);

  async function load() {
    try {
      account = await api.account();
      name = account.displayName;
    } catch (e) {
      toasts.push((e as Error).message, 'error');
    }
  }
  $effect(() => {
    void load();
  });

  /** `chrome/windows` as text, with a fallback for what the API may add later. */
  function device(family: string): string {
    const [browser = 'other', system = 'other'] = family.split('/');
    const pick = (kind: 'browser' | 'system', code: string) => {
      const key = `account.${kind}.${code}` as MessageKey;
      return t(hasMessage(key) ? key : (`account.${kind}.other` as MessageKey));
    };
    return t('account.session.device', {
      browser: pick('browser', browser),
      system: pick('system', system),
    });
  }

  async function guarded(task: () => Promise<unknown>, done: string) {
    if (busy) return;
    busy = true;
    try {
      await task();
      toasts.push(done);
      await load();
    } catch (e) {
      toasts.push((e as Error).message, 'error');
    } finally {
      busy = false;
    }
  }

  function rename(event: SubmitEvent) {
    event.preventDefault();
    return guarded(async () => {
      await api.renameSelf(name.trim());
      if (game.player) game.player.displayName = name.trim();
    }, t('account.name_saved'));
  }

  async function deleteAccount(event: SubmitEvent) {
    event.preventDefault();
    if (busy || !account || !confirm(t('account.delete_confirm'))) return;
    busy = true;
    try {
      await api.deleteAccount(confirmName.trim());
      // The sessions went with the account: clean up here like a sign-out would.
      await api.logout();
      game.signOut();
      events.stop();
      toasts.push(t('account.deleted'));
      await goto('/login');
    } catch (e) {
      toasts.push((e as Error).message, 'error');
    } finally {
      busy = false;
    }
  }
</script>

<h1>{t('account.title')}</h1>

{#if account}
  <form class="card" onsubmit={rename}>
    <h2>{t('account.name_title')}</h2>
    <p class="muted">{t('account.name_hint')}</p>
    {#if account.nameLocked}
      <p>{t('account.name_locked')}</p>
    {/if}
    <label>
      {t('account.name_label')}
      <input
        bind:value={name}
        minlength="2"
        maxlength="32"
        required
        disabled={account.nameLocked}
      />
    </label>
    <button
      type="submit"
      disabled={busy || account.nameLocked || name.trim() === account.displayName}
    >
      {t('account.name_save')}
    </button>
  </form>

  <section class="card">
    <h2>{t('account.sessions_title')}</h2>
    <p class="muted">{t('account.sessions_hint')}</p>
    <ul class="sessions">
      {#each account.sessions as session (session.id)}
        <li>
          <div>
            <strong>{device(session.family)}</strong>
            {#if session.current}<span class="badge">{t('account.session.current')}</span>{/if}
            <div class="muted">{t('account.session.ip', { ip: session.ip })}</div>
            <div class="muted">
              {t('account.session.last_used', { date: when.format(session.lastUsedAt) })}
            </div>
            <div class="muted">
              {t('account.session.created', { date: when.format(session.createdAt) })}
            </div>
            <div class="muted">
              {t('account.session.expires', { date: when.format(session.expiresAt) })}
            </div>
          </div>
          {#if !session.current}
            <button
              disabled={busy}
              onclick={() =>
                guarded(() => api.revokeSession(session.id), t('account.session.revoked'))}
            >
              {t('account.session.revoke')}
            </button>
          {/if}
        </li>
      {/each}
    </ul>
    {#if others.length > 0}
      <button
        disabled={busy}
        onclick={() =>
          guarded(() => api.revokeOtherSessions(), t('account.session.revoked_others'))}
      >
        {t('account.session.revoke_others')}
      </button>
    {:else}
      <p class="muted">{t('account.session.none_others')}</p>
    {/if}
  </section>

  <form class="card danger" onsubmit={deleteAccount}>
    <h2>{t('account.delete_title')}</h2>
    <p class="muted">{t('account.delete_hint')}</p>
    <label>
      {t('account.delete_label', { name: account.displayName })}
      <input bind:value={confirmName} autocomplete="off" required />
    </label>
    <button
      type="submit"
      class="delete"
      disabled={busy || confirmName.trim() !== account.displayName}
    >
      {t('account.delete_button')}
    </button>
  </form>
{/if}

<style>
  .danger {
    border-color: var(--bad);
  }
  button.delete:not(:disabled) {
    background: var(--bad);
    border-color: transparent;
    color: #fff;
  }
  .sessions {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 0.75rem;
  }
  .sessions li {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }
  .badge {
    margin-left: 0.5rem;
    font-size: 0.8em;
    opacity: 0.8;
  }
</style>
