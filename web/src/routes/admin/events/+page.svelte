<script lang="ts">
  import { EVENT_KINDS, EVENT_LIMITS, maxPercent, type EventKind } from '@2tamago/core';
  import type { GameEventDto } from '@2tamago/core/contracts';
  import { api } from '#lib/api.ts';
  import { game } from '#lib/game.svelte.ts';
  import { intlTag, t, type MessageKey } from '#lib/i18n/index.svelte.ts';
  import { toasts } from '#lib/toasts.svelte.ts';

  /** `datetime-local` wants the local time, as `2026-11-09T18:30`. */
  const localInput = (time: number) => {
    const date = new Date(time - new Date(time).getTimezoneOffset() * 60_000);
    return date.toISOString().slice(0, 16);
  };

  let events = $state.raw<GameEventDto[] | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let kind = $state<EventKind>('walk_coins');
  let percent = $state(50);
  let startsAt = $state(localInput(Date.now()));
  let endsAt = $state(localInput(Date.now() + 86_400_000));

  function load() {
    api
      .adminEvents()
      .then((list) => (events = list))
      .catch((e: Error) => (error = e.message));
  }
  $effect(() => {
    if (game.player?.isAdmin) load();
  });

  let when = $derived(
    new Intl.DateTimeFormat(intlTag(), { dateStyle: 'medium', timeStyle: 'short' }),
  );
  const kindLabel = (k: EventKind) => t(`admin.events.kind.${k}` as MessageKey);

  function statusKey(event: GameEventDto): MessageKey {
    const now = Date.now();
    if (event.cancelled) return 'admin.events.state_cancelled';
    if (event.endsAt <= now) return 'admin.events.state_over';
    return event.startsAt <= now ? 'admin.events.state_on' : 'admin.events.state_soon';
  }

  async function create(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    try {
      await api.adminCreateEvent({
        kind,
        percent,
        startsAt: new Date(startsAt).getTime(),
        endsAt: new Date(endsAt).getTime(),
      });
      toasts.push(t('admin.events.created'));
      load();
    } catch (e) {
      toasts.push((e as Error).message, 'error');
    } finally {
      busy = false;
    }
  }

  async function cancel(id: string) {
    try {
      await api.adminCancelEvent(id);
      load();
    } catch (e) {
      toasts.push((e as Error).message, 'error');
    }
  }
</script>

{#if !game.player?.isAdmin}
  <p class="card">{t('admin.forbidden')}</p>
{:else}
  <p class="muted">{t('admin.events.intro', { days: EVENT_LIMITS.maxDays })}</p>

  <form class="card" onsubmit={create}>
    <h2>{t('admin.events.new')}</h2>
    <div class="grid">
      <label>
        {t('admin.events.kind')}
        <select bind:value={kind}>
          {#each EVENT_KINDS as k (k)}<option value={k}>{kindLabel(k)}</option>{/each}
        </select>
      </label>
      <label>
        {t('admin.events.percent')} (1–{maxPercent(kind)})
        <input type="number" bind:value={percent} min="1" max={maxPercent(kind)} required />
      </label>
      <label>
        {t('admin.events.starts')}
        <input type="datetime-local" bind:value={startsAt} required />
      </label>
      <label>
        {t('admin.events.ends')}
        <input type="datetime-local" bind:value={endsAt} required />
      </label>
    </div>
    <p class="muted"><small>{t('admin.events.announce')}</small></p>
    <button class="primary" disabled={busy}>{t('admin.events.create')}</button>
  </form>

  {#if error}
    <p class="card">{error}</p>
  {:else if events}
    <section class="card">
      <h2>{t('admin.events.list')}</h2>
      {#if events.length === 0}
        <p class="muted">{t('admin.events.none')}</p>
      {:else}
        <table>
          <tbody>
            {#each events as event (event.id)}
              <tr class:off={event.cancelled || event.endsAt <= Date.now()}>
                <td>{kindLabel(event.kind)}</td>
                <td>{event.kind === 'shop_discount' ? '−' : '+'}{event.percent} %</td>
                <td>{when.format(event.startsAt)} → {when.format(event.endsAt)}</td>
                <td>{t(statusKey(event))}</td>
                <td>
                  {#if !event.cancelled && event.endsAt > Date.now()}
                    <button onclick={() => cancel(event.id)}>{t('admin.events.cancel')}</button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>
  {/if}
{/if}

<style>
  form,
  section {
    margin: 1rem 0;
  }
  h2 {
    margin: 0 0 0.6rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
    gap: 0.8rem;
  }
  label {
    display: grid;
    gap: 0.2rem;
    font-weight: 600;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  td {
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid var(--border);
  }
  tr.off {
    opacity: 0.55;
  }
</style>
