<script lang="ts">
  import { api } from '#lib/api.ts';
  import { intlTag, t } from '#lib/i18n/index.svelte.ts';
  import { activityText } from '#lib/texts.ts';

  const entries = api.activity().then((list) => {
    void api.markActivityRead();
    return list;
  });

  let format = $derived(
    new Intl.DateTimeFormat(intlTag(), { dateStyle: 'short', timeStyle: 'short' }),
  );
</script>

<h1>{t('journal.title')}</h1>

{#await entries}
  <p class="muted">{t('common.loading')}</p>
{:then list}
  {#if list.length === 0}
    <p class="card">{t('journal.empty')}</p>
  {:else}
    <ul class="card">
      {#each list as entry (entry.id)}
        <li class:unread={!entry.read}>
          <span>{activityText(entry)}</span>
          <small class="muted">{format.format(entry.createdAt)}</small>
        </li>
      {/each}
    </ul>
  {/if}
{:catch error}
  <p class="card">{error.message}</p>
{/await}

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0.4rem 1rem;
  }
  li {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.6rem 0;
    border-bottom: 1px solid var(--surface-2);
  }
  li:last-child {
    border-bottom: none;
  }
  .unread span {
    font-weight: bold;
  }
</style>
