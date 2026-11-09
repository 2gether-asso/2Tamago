<script lang="ts">
  import { page } from '$app/state';
  import { game } from '#lib/game.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
</script>

<h1>{t('admin.title')}</h1>

{#if game.player?.isAdmin}
  <div class="tabs">
    <a href="/admin" class:active={page.url.pathname === '/admin'}>{t('admin.tab_rules')}</a>
    <a href="/admin/stats" class:active={page.url.pathname === '/admin/stats'}
      >{t('admin.tab_stats')}</a
    >
    <a href="/admin/codes" class:active={page.url.pathname === '/admin/codes'}
      >{t('admin.tab_codes')}</a
    >
  </div>
{/if}

{@render children()}

<style>
  .tabs {
    display: flex;
    gap: 0.4rem;
    margin-bottom: 1rem;
  }
  .tabs a {
    padding: 0.35rem 1rem;
    border-radius: var(--radius-pill);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--muted);
    font-weight: 600;
    text-decoration: none;
  }
  .tabs a.active {
    color: var(--accent);
    border-color: var(--accent);
    background: rgb(var(--accent-rgb) / 0.14);
  }
</style>
