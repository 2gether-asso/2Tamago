<script lang="ts">
  import { isForSale, ITEMS, type ItemId } from '@2tamago/core';
  import { game } from '#lib/game.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import { itemLabel } from '#lib/texts.ts';

  // Some items can only be found on walks.
  const items = Object.values(ITEMS).filter((item) => isForSale(item.id));
  const snacks = items.filter((item) => item.kind === 'snack');
  const accessories = items.filter((item) => item.kind === 'accessory');

  let coins = $derived(game.player?.coins ?? 0);
</script>

<h1>{t('shop.title')}</h1>
<p class="muted">{t('shop.intro')}</p>

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
      <button disabled={game.busy || coins < item.price} onclick={() => game.buy(item.id as ItemId)}
        >🪙 {item.price}</button
      >
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
          disabled={game.busy || coins < item.price}
          onclick={() => game.buy(item.id as ItemId)}>🪙 {item.price}</button
        >
      {/if}
    </div>
  {/each}
</div>

<style>
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
