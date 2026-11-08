<script lang="ts">
  import type { DaycareDto } from '@2tamago/core/contracts';
  import { api } from '#lib/api.ts';
  import { intlTag, t } from '#lib/i18n/index.svelte.ts';
  import { toasts } from '#lib/toasts.svelte.ts';

  interface Props {
    petName: string;
  }
  let { petName }: Props = $props();

  let entrusted = $state.raw<DaycareDto | null>(null);
  let loaded = $state(false);
  let busy = $state(false);

  $effect(() => {
    api
      .daycare()
      .then((overview) => (entrusted = overview.entrusted))
      .catch(() => {})
      .finally(() => (loaded = true));
  });

  let when = $derived(
    new Intl.DateTimeFormat(intlTag(), { dateStyle: 'long', timeStyle: 'short' }),
  );

  async function end() {
    if (!entrusted || busy) return;
    busy = true;
    try {
      await api.daycareEnd(entrusted.id);
      entrusted = null;
    } catch (e) {
      toasts.push((e as Error).message, 'error');
    } finally {
      busy = false;
    }
  }
</script>

{#if loaded}
  <section class="card">
    <h3>{t('daycare.title')}</h3>
    {#if entrusted}
      <p>
        {entrusted.status === 'pending'
          ? t('daycare.pending', {
              caretaker: entrusted.caretakerName,
              date: when.format(entrusted.expiresAt),
            })
          : t('daycare.active', {
              pet: entrusted.petName,
              caretaker: entrusted.caretakerName,
              date: when.format(entrusted.expiresAt),
            })}
      </p>
      <button disabled={busy} onclick={end}>
        {entrusted.status === 'pending' ? t('daycare.cancel') : t('daycare.retrieve')}
      </button>
    {:else}
      <p class="muted">{t('daycare.owner_intro', { name: petName })}</p>
    {/if}
  </section>
{/if}
