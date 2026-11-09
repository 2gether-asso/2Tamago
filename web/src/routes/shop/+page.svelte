<script lang="ts">
  import { discounted, isForSale, ITEMS, type ItemId } from '@2tamago/core';
  import { events } from '#lib/events.svelte.ts';
  import { game } from '#lib/game.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import { bundleLabel } from '#lib/texts.ts';
  import { itemLabel } from '#lib/texts.ts';
  import { api } from '#lib/api.ts';
  import { toasts } from '#lib/toasts.svelte.ts';

  // Some items can only be found on walks.
  const items = Object.values(ITEMS).filter((item) => isForSale(item.id));
  const snacks = items.filter((item) => item.kind === 'snack');
  const meals = items.filter((item) => item.kind === 'meal');
  const medicines = items.filter((item) => item.kind === 'medicine');
  const accessories = items.filter((item) => item.kind === 'accessory');

  let coins = $derived(game.player?.coins ?? 0);
  /** What an item costs now: an event may take a percentage off. */
  const priceOf = (item: { price: number }) =>
    discounted(item.price, events.percent('shop_discount'));

  let code = $state('');
  let redeeming = $state(false);
  async function redeem(event: SubmitEvent) {
    event.preventDefault();
    if (!code.trim() || redeeming) return;
    redeeming = true;
    try {
      const gift = await api.redeemCode(code);
      if (game.player) game.player.coins = gift.balance;
      game.inventory = gift.inventory;
      const parts = [
        ...(gift.coins > 0 ? [t('shop.code_coins', { count: gift.coins })] : []),
        ...(Object.keys(gift.items).length > 0 ? [bundleLabel(gift.items)] : []),
      ];
      toasts.push(t('shop.code_done', { reward: parts.join(', ') }));
      code = '';
    } catch (e) {
      toasts.push((e as Error).message, 'error');
    } finally {
      redeeming = false;
    }
  }
</script>

{#snippet buy(item: { id: string; price: number })}
  <button disabled={game.busy || coins < priceOf(item)} onclick={() => game.buy(item.id as ItemId)}
    >🪙 {priceOf(item)}{#if priceOf(item) < item.price}
      <s class="was">{item.price}</s>{/if}</button
  >
{/snippet}

<h1>{t('shop.title')}</h1>
<p class="muted">{t('shop.intro')}</p>

<form class="card code" onsubmit={redeem}>
  <h2>{t('shop.code_title')}</h2>
  <p class="muted">{t('shop.code_hint')}</p>
  <div class="row">
    <input
      bind:value={code}
      aria-label={t('shop.code_label')}
      placeholder="WELCOME-2026"
      autocomplete="off"
      autocapitalize="characters"
      maxlength="40"
    />
    <button class="primary" disabled={redeeming || !code.trim()}>{t('shop.code_redeem')}</button>
  </div>
</form>

<h2>{t('shop.snacks')}</h2>
<div class="grid">
  {#each snacks as item (item.id)}
    <div class="card item">
      <strong>{itemLabel(item.id as ItemId)}</strong>
      <small class="muted">
        {Object.entries(item.effects)
          .map(([k, v]) => `${t(`stat.${k as 'satiety' | 'happiness' | 'energy'}`)} +${v}`)
          .join(', ')}
      </small>
      <small>{t('shop.in_bag', { count: game.inventory[item.id as ItemId] ?? 0 })}</small>
      <button
        disabled={game.busy || coins < priceOf(item)}
        onclick={() => game.buy(item.id as ItemId)}
        >🪙 {priceOf(item)}{#if priceOf(item) < item.price}
          <s class="was">{item.price}</s>{/if}</button
      >
    </div>
  {/each}
</div>

<h2>{t('shop.meals')}</h2>
<div class="grid">
  {#each meals as item (item.id)}
    <div class="card item">
      <strong>{itemLabel(item.id as ItemId)}</strong>
      <small class="muted">
        {t('item.meal_hint', { satiety: item.satiety, group: t(`group.${item.group}`) })}
      </small>
      <small>{t('shop.in_bag', { count: game.inventory[item.id as ItemId] ?? 0 })}</small>
      {@render buy(item)}
    </div>
  {/each}
</div>

<h2>{t('shop.medicines')}</h2>
<div class="grid">
  {#each medicines as item (item.id)}
    <div class="card item">
      <strong>{itemLabel(item.id as ItemId)}</strong>
      <small class="muted">
        {item.cures === 'any'
          ? t('item.medicine_hint_any', { doses: game.rules?.medicineDoses ?? 2 })
          : t('item.medicine_hint', { illness: t(`illness.${item.cures}`) })}
      </small>
      <small>{t('shop.in_bag', { count: game.inventory[item.id as ItemId] ?? 0 })}</small>
      {@render buy(item)}
    </div>
  {/each}
</div>

<h2>{t('shop.accessories')}</h2>
<div class="grid">
  {#each accessories as item (item.id)}
    {@const owned = (game.inventory[item.id as ItemId] ?? 0) > 0}
    <div class="card item">
      <strong>{itemLabel(item.id as ItemId)}</strong>
      {#if owned}
        <small>{t('shop.owned')}</small>
      {:else}
        <button
          disabled={game.busy || coins < priceOf(item)}
          onclick={() => game.buy(item.id as ItemId)}
          >🪙 {priceOf(item)}{#if priceOf(item) < item.price}
            <s class="was">{item.price}</s>{/if}</button
        >
      {/if}
    </div>
  {/each}
</div>

<style>
  .was {
    opacity: 0.6;
    margin-left: 0.3rem;
  }
  .code {
    margin: 1rem 0;
  }
  .code h2 {
    margin: 0 0 0.3rem;
  }
  .code .row {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .code input {
    flex: 1;
    min-width: 12rem;
    text-transform: uppercase;
  }
  h2 {
    margin-top: 1.5rem;
  }
  .item {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    align-items: flex-start;
  }
</style>
