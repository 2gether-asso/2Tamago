<script lang="ts">
  import { isAccessory, ITEM_IDS, TRADE_LIMITS, type ItemId } from '@2tamago/core';
  import type { TradeItems, TradeOverview } from '@2tamago/core/contracts';
  import { api } from '#lib/api.ts';
  import { game } from '#lib/game.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import { itemLabel } from '#lib/texts.ts';
  import { toasts } from '#lib/toasts.svelte.ts';

  interface Props {
    /** The other member. */
    targetId: string;
    targetName: string;
  }
  let { targetId, targetName }: Props = $props();

  let overview = $state.raw<TradeOverview | null>(null);
  let open = $state(false);
  let sending = $state(false);
  let give = $state<TradeItems>({});
  let ask = $state<TradeItems>({});

  $effect(() => {
    api
      .trades()
      .then((o) => (overview = o))
      .catch(() => {});
  });

  /** What the viewer can give: what is in the bag. */
  let owned = $derived(ITEM_IDS.filter((id) => (game.inventory[id] ?? 0) > 0));
  const maxOf = (id: ItemId) => (isAccessory(id) ? 1 : TRADE_LIMITS.maxQuantity);
  const kinds = (items: TradeItems) => Object.keys(items).length;
  let canSend = $derived(
    kinds(give) > 0 && kinds(give) <= TRADE_LIMITS.maxKinds && kinds(ask) <= TRADE_LIMITS.maxKinds,
  );

  function set(side: 'give' | 'ask', id: ItemId, quantity: number) {
    const items = { ...(side === 'give' ? give : ask) };
    if (quantity <= 0) delete items[id];
    else items[id] = quantity;
    if (side === 'give') {
      give = items;
      // The same item on both sides would change nothing hands.
      if (quantity > 0 && id in ask) set('ask', id, 0);
    } else {
      ask = items;
      if (quantity > 0 && id in give) set('give', id, 0);
    }
  }
  const limit = (side: 'give' | 'ask', id: ItemId) =>
    side === 'give' ? Math.min(game.inventory[id] ?? 0, maxOf(id)) : maxOf(id);
  const current = (side: 'give' | 'ask', id: ItemId) => (side === 'give' ? give : ask)[id] ?? 0;
  /** An item full to the limit of the side, or the side full of other items, cannot grow. */
  const full = (side: 'give' | 'ask', id: ItemId) =>
    current(side, id) === 0 && kinds(side === 'give' ? give : ask) >= TRADE_LIMITS.maxKinds;

  async function send() {
    if (!canSend || sending) return;
    sending = true;
    try {
      await api.tradeOffer({ targetId, offer: give, request: ask });
      toasts.push(t('trade.sent_toast', { name: targetName }));
      give = {};
      ask = {};
      open = false;
      // What was offered is set aside: the bag has changed.
      void game.refresh().catch(() => {});
      overview = await api.trades();
    } catch (e) {
      toasts.push((e as Error).message, 'error');
    } finally {
      sending = false;
    }
  }
</script>

{#snippet picker(side: 'give' | 'ask', ids: readonly ItemId[])}
  <div class="items">
    {#each ids as id (id)}
      {@const quantity = current(side, id)}
      <div class="item" class:picked={quantity > 0}>
        <span>{itemLabel(id)}</span>
        <span class="stepper">
          <button
            type="button"
            aria-label="−"
            disabled={quantity === 0}
            onclick={() => set(side, id, quantity - 1)}>−</button
          >
          <output>{quantity}</output>
          <button
            type="button"
            aria-label="+"
            disabled={quantity >= limit(side, id) || full(side, id)}
            onclick={() => set(side, id, quantity + 1)}>+</button
          >
        </span>
      </div>
    {/each}
  </div>
{/snippet}

<section class="composer">
  <button class="link-button" type="button" aria-expanded={open} onclick={() => (open = !open)}>
    {t('trade.propose')}
  </button>
  {#if open}
    <div class="card panel">
      <p class="muted">
        {t('trade.intro', { name: targetName, hours: overview?.expireHours ?? 72 })}
      </p>
      <h4>{t('trade.give')}</h4>
      {#if owned.length === 0}
        <p class="muted">{t('trade.nothing_to_give')}</p>
      {:else}
        {@render picker('give', owned)}
      {/if}
      <h4>{t('trade.ask')}</h4>
      <p class="muted"><small>{t('trade.ask_hint')}</small></p>
      {@render picker('ask', ITEM_IDS)}
      <div class="actions">
        <button class="primary" type="button" disabled={!canSend || sending} onclick={send}
          >{t('trade.send')}</button
        >
        <button type="button" onclick={() => (open = false)}>{t('trade.close')}</button>
      </div>
    </div>
  {/if}
</section>

<style>
  .composer {
    margin-top: 0.8rem;
  }
  .panel {
    margin-top: 0.6rem;
    text-align: left;
  }
  h4 {
    margin: 0.8rem 0 0.3rem;
  }
  .items {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
    gap: 0.4rem;
  }
  .item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.6rem;
    border-radius: var(--radius-md);
    background: var(--surface-2);
  }
  .item.picked {
    outline: 2px solid var(--accent);
  }
  .stepper {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .stepper button {
    min-width: 2rem;
    padding: 0.1rem 0.5rem;
  }
  .actions {
    display: flex;
    gap: 0.6rem;
    margin-top: 1rem;
  }
</style>
