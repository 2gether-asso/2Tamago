<script lang="ts">
  import { ITEMS, type ItemId } from '@2tamago/core';
  import type { Illness, MealItem, MedicineItem } from '@2tamago/core';
  import { game } from '#lib/game.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import { itemLabel } from '#lib/texts.ts';

  interface Props {
    kind: 'feed' | 'medicine';
    /** Called with the item to use, or `undefined` for the free care. */
    onpick: (item: ItemId | undefined) => void;
    onclose: () => void;
  }
  let { kind, onpick, onclose }: Props = $props();

  /** What the bag holds for this care. */
  let owned = $derived(
    (Object.entries(game.inventory) as [ItemId, number][])
      .filter(([id, n]) => n > 0 && ITEMS[id].kind === (kind === 'feed' ? 'meal' : 'medicine'))
      .map(([id, count]) => ({ id, count, item: ITEMS[id] as MealItem | MedicineItem })),
  );
  let freeDoses = $derived(
    game.rules ? Math.ceil(game.rules.medicineDoses / game.rules.freeMedicineDose) : 4,
  );

  function hint(item: MealItem | MedicineItem): string {
    if (item.kind === 'meal') {
      return t('item.meal_hint', { satiety: item.satiety, group: t(`group.${item.group}`) });
    }
    if (item.cures === 'any') {
      return t('item.medicine_hint_any', { doses: game.rules?.medicineDoses ?? 2 });
    }
    return t('item.medicine_hint', { illness: t(`illness.${item.cures as Illness}`) });
  }
</script>

<div class="backdrop" role="presentation">
  <div class="card dialog" role="dialog" aria-modal="true" aria-label={t(`care.${kind}.title`)}>
    <h2>{t(`care.${kind}.title`)}</h2>
    <div class="options">
      {#each owned as { id, count, item } (id)}
        <button disabled={game.busy} onclick={() => onpick(id)}>
          <strong>{itemLabel(id)} {t('care.in_bag', { count })}</strong>
          <small class="muted">{hint(item)}</small>
        </button>
      {/each}
      <button disabled={game.busy} onclick={() => onpick(undefined)}>
        <strong>{t(`care.${kind}.free`)}</strong>
        <small class="muted">
          {#if kind === 'feed'}
            {t('care.feed.free_hint', { satiety: game.rules?.freeMealSatiety ?? 20 })}
          {:else}
            {t('care.medicine.free_hint', { count: freeDoses })}
          {/if}
        </small>
      </button>
    </div>
    {#if owned.length === 0}
      <p class="muted">{t(`care.${kind}.empty`)}</p>
      <a href="/shop" onclick={onclose}>{t('care.shop')}</a>
    {/if}
    <button onclick={onclose}>{t('care.cancel')}</button>
  </div>
</div>

<style>
  .options {
    display: grid;
    gap: 0.5rem;
    margin: 1rem 0;
  }
  .options button {
    display: grid;
    gap: 0.15rem;
    text-align: left;
  }
  a {
    display: block;
    margin-bottom: 0.8rem;
  }
</style>
