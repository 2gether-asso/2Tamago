<script lang="ts">
  import type { TradeDto, TradeOverview } from '@2tamago/core/contracts';
  import { api } from '#lib/api.ts';
  import { game } from '#lib/game.svelte.ts';
  import { intlTag, t } from '#lib/i18n/index.svelte.ts';
  import { toasts } from '#lib/toasts.svelte.ts';
  import { tradeSideLabel } from '#lib/texts.ts';

  let overview = $state.raw<TradeOverview | null>(null);
  let busy = $state(false);

  function load() {
    api
      .trades()
      .then((o) => (overview = o))
      .catch(() => (overview = null));
  }
  $effect(load);

  let when = $derived(
    new Intl.DateTimeFormat(intlTag(), { dateStyle: 'long', timeStyle: 'short' }),
  );
  const asking = (trade: TradeDto) =>
    Object.keys(trade.request).length > 0 || trade.requestCoins > 0;

  async function run(task: () => Promise<unknown>, done: string) {
    if (busy) return;
    busy = true;
    try {
      await task();
      toasts.push(done);
    } catch (e) {
      toasts.push((e as Error).message, 'error');
    } finally {
      busy = false;
      // The bag may have changed (items taken, returned or received): ask again for both.
      load();
      void game.refresh().catch(() => {});
    }
  }
</script>

{#if overview && (overview.incoming.length > 0 || overview.outgoing.length > 0)}
  <section class="card" aria-labelledby="trades-title">
    <h2 id="trades-title">{t('trade.title')}</h2>
    {#if overview.incoming.length > 0}
      <h3>{t('trade.incoming')}</h3>
      {#each overview.incoming as trade (trade.id)}
        <div class="row">
          <p>
            {asking(trade)
              ? t('trade.incoming_swap', {
                  name: trade.proposerName,
                  give: tradeSideLabel(trade.offer, trade.offerCoins),
                  ask: tradeSideLabel(trade.request, trade.requestCoins),
                })
              : t('trade.incoming_gift', {
                  name: trade.proposerName,
                  give: tradeSideLabel(trade.offer, trade.offerCoins),
                })}
          </p>
          <div class="actions">
            <button
              class="primary"
              disabled={busy}
              onclick={() => run(() => api.tradeAccept(trade.id), t('trade.accepted_toast'))}
              >{t('trade.accept')}</button
            >
            <button
              disabled={busy}
              onclick={() => run(() => api.tradeDecline(trade.id), t('trade.declined_toast'))}
              >{t('trade.decline')}</button
            >
          </div>
        </div>
      {/each}
    {/if}
    {#if overview.outgoing.length > 0}
      <h3>{t('trade.outgoing')}</h3>
      {#each overview.outgoing as trade (trade.id)}
        <div class="row">
          <p>
            {asking(trade)
              ? t('trade.outgoing_swap', {
                  name: trade.targetName,
                  give: tradeSideLabel(trade.offer, trade.offerCoins),
                  ask: tradeSideLabel(trade.request, trade.requestCoins),
                })
              : t('trade.outgoing_gift', {
                  name: trade.targetName,
                  give: tradeSideLabel(trade.offer, trade.offerCoins),
                })}
            <small class="muted">{t('trade.until', { date: when.format(trade.expiresAt) })}</small>
          </p>
          <button
            disabled={busy}
            onclick={() => run(() => api.tradeCancel(trade.id), t('trade.withdrawn_toast'))}
            >{t('trade.withdraw')}</button
          >
        </div>
      {/each}
    {/if}
  </section>
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
    margin-top: 0.8rem;
    font-size: 1rem;
  }
  .row p {
    margin: 0.2rem 0;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    margin-bottom: 0.4rem;
  }
</style>
