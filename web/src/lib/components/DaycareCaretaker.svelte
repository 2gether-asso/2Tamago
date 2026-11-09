<script lang="ts">
  import type { DaycareOverview } from '@2tamago/core/contracts';
  import { api } from '#lib/api.ts';
  import { intlTag, t } from '#lib/i18n/index.svelte.ts';
  import { toasts } from '#lib/toasts.svelte.ts';

  let overview = $state.raw<DaycareOverview | null>(null);
  let busy = $state(false);

  function load() {
    api
      .daycare()
      .then((o) => (overview = o))
      .catch(() => (overview = null));
  }
  $effect(load);

  let when = $derived(
    new Intl.DateTimeFormat(intlTag(), { dateStyle: 'long', timeStyle: 'short' }),
  );

  async function run(task: () => Promise<unknown>, done?: string) {
    if (busy) return;
    busy = true;
    try {
      await task();
      if (done) toasts.push(done);
      load();
    } catch (e) {
      toasts.push((e as Error).message, 'error');
    } finally {
      busy = false;
    }
  }
</script>

{#if overview && (overview.invitations.length > 0 || overview.caring.length > 0)}
  <section class="card" aria-labelledby="daycare-title">
    <h2 id="daycare-title">{t('daycare.title')}</h2>
    {#if overview.invitations.length > 0}
      <h3>{t('daycare.invitations')}</h3>
      {#each overview.invitations as invitation (invitation.id)}
        <div class="row">
          <p>
            {t('daycare.invitation', {
              owner: invitation.ownerName,
              pet: invitation.petName,
              days: overview.maxDays,
              date: when.format(invitation.expiresAt),
            })}
          </p>
          <div class="actions">
            <button
              class="primary"
              disabled={busy}
              onclick={() =>
                run(
                  () => api.daycareAccept(invitation.id),
                  t('daycare.accepted_toast', { pet: invitation.petName }),
                )}>{t('daycare.accept')}</button
            >
            <button disabled={busy} onclick={() => run(() => api.daycareDecline(invitation.id))}
              >{t('daycare.decline')}</button
            >
          </div>
        </div>
      {/each}
    {/if}
    {#if overview.caring.length > 0}
      <h3>{t('daycare.caring')}</h3>
      {#each overview.caring as stay (stay.id)}
        <div class="row">
          <p>
            {t('daycare.caring_item', {
              pet: stay.petName,
              owner: stay.ownerName,
              date: when.format(stay.expiresAt),
            })}
          </p>
          <div class="actions">
            <a class="link-button" href="/village/{stay.petId}">{t('daycare.look_after')}</a>
            <button disabled={busy} onclick={() => run(() => api.daycareEnd(stay.id))}
              >{t('daycare.give_back')}</button
            >
          </div>
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
    align-items: center;
    margin-bottom: 0.4rem;
  }
  .link-button {
    padding: 0.5rem 1.1rem;
    border-radius: var(--radius-pill);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font-weight: 600;
    text-decoration: none;
  }
</style>
