<script lang="ts">
  import { ITEMS, type ItemId } from '@2tamago/core';
  import { game } from '#lib/game.svelte.ts';

  const items = Object.values(ITEMS);
  const snacks = items.filter((item) => item.kind === 'snack');
  const accessories = items.filter((item) => item.kind === 'accessory');

  let coins = $derived(game.player?.coins ?? 0);
</script>

<h1>Boutique</h1>
<p class="muted">
  Gagne des pièces en jouant, en te promenant et en rendant visite aux autres compagnons.
</p>

<h2>Friandises</h2>
<div class="grid">
  {#each snacks as item (item.id)}
    <div class="card item">
      <strong>{item.label}</strong>
      <small class="muted">
        {Object.entries(item.effects)
          .map(
            ([k, v]) =>
              `${k === 'satiety' ? 'Satiété' : k === 'happiness' ? 'Bonheur' : 'Énergie'} +${v}`,
          )
          .join(', ')}
      </small>
      <small>Dans ton sac : {game.inventory[item.id as ItemId] ?? 0}</small>
      <button disabled={game.busy || coins < item.price} onclick={() => game.buy(item.id as ItemId)}
        >🪙 {item.price}</button
      >
    </div>
  {/each}
</div>

<h2>Accessoires</h2>
<div class="grid">
  {#each accessories as item (item.id)}
    {@const owned = (game.inventory[item.id as ItemId] ?? 0) > 0}
    <div class="card item">
      <strong>{item.label}</strong>
      {#if owned}
        <small>Déjà à toi ✔</small>
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
