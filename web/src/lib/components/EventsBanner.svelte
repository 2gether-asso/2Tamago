<script lang="ts">
  import { events } from '#lib/events.svelte.ts';
  import { intlTag, t, type MessageKey } from '#lib/i18n/index.svelte.ts';

  let day = $derived(new Intl.DateTimeFormat(intlTag(), { dateStyle: 'long' }));
</script>

{#if events.overview.active.length > 0 || events.overview.upcoming.length > 0}
  <aside class="banner" aria-label={t('promo.title')}>
    {#each events.overview.active as event (event.id)}
      <p>
        <strong>{t(`promo.${event.kind}` as MessageKey, { percent: event.percent })}</strong>
        <span class="muted">{t('promo.until', { date: day.format(event.endsAt) })}</span>
      </p>
    {/each}
    {#each events.overview.upcoming as event (event.id)}
      <p class="soon">
        {t(`promo.${event.kind}` as MessageKey, { percent: event.percent })}
        <span class="muted">{t('promo.from', { date: day.format(event.startsAt) })}</span>
      </p>
    {/each}
  </aside>
{/if}

<style>
  .banner {
    margin: 0 0 1rem;
    padding: 0.5rem 1rem;
    border-radius: var(--radius-md);
    background: rgb(var(--accent-rgb) / 0.14);
    border: 1px solid var(--accent);
  }
  p {
    margin: 0.2rem 0;
  }
  .soon {
    opacity: 0.8;
  }
</style>
