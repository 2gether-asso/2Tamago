<script lang="ts">
  import { isAccessory, ITEM_IDS, type ItemId } from '@2tamago/core';
  import type { GiftCodeDto } from '@2tamago/core/contracts';
  import { api } from '#lib/api.ts';
  import { game } from '#lib/game.svelte.ts';
  import { intlTag, t } from '#lib/i18n/index.svelte.ts';
  import { bundleLabel, itemLabel } from '#lib/texts.ts';
  import { toasts } from '#lib/toasts.svelte.ts';

  let codes = $state.raw<GiftCodeDto[] | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);

  let code = $state('');
  let coins = $state(0);
  let maxUses = $state(50);
  /** `datetime-local` value; empty: no end. */
  let until = $state('');
  let items = $state<Partial<Record<ItemId, number>>>({});
  let pick = $state<ItemId>('cookie');
  let quantity = $state(1);

  function load() {
    api
      .adminCodes()
      .then((list) => (codes = list))
      .catch((e: Error) => (error = e.message));
  }
  $effect(() => {
    if (game.player?.isAdmin) load();
  });

  let when = $derived(
    new Intl.DateTimeFormat(intlTag(), { dateStyle: 'medium', timeStyle: 'short' }),
  );

  function addItem() {
    items = { ...items, [pick]: isAccessory(pick) ? 1 : quantity };
  }
  function removeItem(id: ItemId) {
    const rest = { ...items };
    delete rest[id];
    items = rest;
  }

  async function create(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    busy = true;
    try {
      await api.adminCreateCode({
        code,
        coins,
        items,
        maxUses,
        expiresAt: until ? new Date(until).getTime() : null,
      });
      toasts.push(t('admin.codes.created'));
      code = '';
      coins = 0;
      items = {};
      until = '';
      load();
    } catch (e) {
      toasts.push((e as Error).message, 'error');
    } finally {
      busy = false;
    }
  }

  async function disable(id: string) {
    try {
      await api.adminDisableCode(id);
      load();
    } catch (e) {
      toasts.push((e as Error).message, 'error');
    }
  }
</script>

{#if !game.player?.isAdmin}
  <p class="card">{t('admin.forbidden')}</p>
{:else}
  <p class="muted">{t('admin.codes.intro')}</p>

  <form class="card" onsubmit={create}>
    <h2>{t('admin.codes.new')}</h2>
    <div class="grid">
      <label>
        {t('admin.codes.code')}
        <input bind:value={code} required minlength="4" maxlength="24" pattern="[A-Za-z0-9\-]+" />
      </label>
      <label>
        {t('admin.codes.coins')}
        <input type="number" bind:value={coins} min="0" max="1000" />
      </label>
      <label>
        {t('admin.codes.max_uses')}
        <input type="number" bind:value={maxUses} min="1" max="10000" required />
      </label>
      <label>
        {t('admin.codes.until')}
        <input type="datetime-local" bind:value={until} />
      </label>
    </div>

    <fieldset>
      <legend>{t('admin.codes.items')}</legend>
      <div class="row">
        <select bind:value={pick} aria-label={t('admin.codes.items')}>
          {#each ITEM_IDS as id (id)}<option value={id}>{itemLabel(id)}</option>{/each}
        </select>
        <input
          type="number"
          bind:value={quantity}
          min="1"
          max="20"
          disabled={isAccessory(pick)}
          aria-label={t('admin.codes.quantity')}
        />
        <button type="button" disabled={Object.keys(items).length >= 4} onclick={addItem}
          >{t('admin.codes.add_item')}</button
        >
      </div>
      <div class="chips">
        {#each Object.entries(items) as [id, count] (id)}
          <button type="button" class="chip" onclick={() => removeItem(id as ItemId)}>
            {itemLabel(id as ItemId)} ×{count} ✕
          </button>
        {/each}
      </div>
    </fieldset>

    <button class="primary" disabled={busy || (coins === 0 && Object.keys(items).length === 0)}
      >{t('admin.codes.create')}</button
    >
  </form>

  {#if error}
    <p class="card">{error}</p>
  {:else if codes}
    <section class="card">
      <h2>{t('admin.codes.list')}</h2>
      {#if codes.length === 0}
        <p class="muted">{t('admin.codes.none')}</p>
      {:else}
        <table>
          <thead>
            <tr>
              <th>{t('admin.codes.code')}</th>
              <th>{t('admin.codes.reward')}</th>
              <th>{t('admin.codes.uses')}</th>
              <th>{t('admin.codes.until')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each codes as gift (gift.id)}
              <tr class:off={gift.disabled}>
                <td><code>{gift.code}</code></td>
                <td>
                  {[
                    gift.coins > 0 ? t('shop.code_coins', { count: gift.coins }) : '',
                    bundleLabel(gift.items),
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </td>
                <td>{gift.uses} / {gift.maxUses}</td>
                <td>{gift.expiresAt ? when.format(gift.expiresAt) : '–'}</td>
                <td>
                  {#if gift.disabled}
                    {t('admin.codes.disabled')}
                  {:else}
                    <button onclick={() => disable(gift.id)}>{t('admin.codes.disable')}</button>
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
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    gap: 0.8rem;
  }
  label {
    display: grid;
    gap: 0.2rem;
    font-weight: 600;
  }
  fieldset {
    margin: 1rem 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }
  .row {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .chips {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    margin-top: 0.6rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    text-align: left;
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid var(--border);
  }
  tr.off {
    opacity: 0.55;
  }
</style>
