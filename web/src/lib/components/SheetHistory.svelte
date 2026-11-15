<script lang="ts">
  import type { CharacterSheet } from '@2tamago/core';
  import { t } from '#lib/i18n/index.svelte.ts';
  import { walkEventText } from '#lib/texts.ts';

  interface Props {
    sheet: CharacterSheet;
    name: string;
    /** Keep only the latest entries. */
    limit?: number;
  }
  let { sheet, name, limit }: Props = $props();

  /** Latest first. */
  let history = $derived([...sheet.history].reverse().slice(0, limit));
</script>

{#if history.length === 0}
  <p class="muted">{t('rpg.history_empty')}</p>
{:else}
  <ul class="history">
    {#each history as entry (entry.at)}
      <li>{walkEventText(entry.event, name)}</li>
    {/each}
  </ul>
{/if}

<style>
  .history {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.75rem;
    text-align: left;
  }
</style>
