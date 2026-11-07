<script lang="ts">
  import '../app.css';
  import favicon from '#lib/assets/favicon.svg';
  import Toasts from '#lib/components/Toasts.svelte';
  import { api } from '#lib/api.ts';
  import { game } from '#lib/game.svelte.ts';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
  let error = $state<string | null>(null);

  const NAV = [
    { href: '/', label: 'Maison', icon: '🏠' },
    { href: '/village', label: 'Village', icon: '🌳' },
    { href: '/shop', label: 'Boutique', icon: '🛍️' },
    { href: '/journal', label: 'Journal', icon: '📜' },
    { href: '/album', label: 'Album', icon: '📔' },
  ];

  let isLogin = $derived(page.url.pathname.startsWith('/login'));

  $effect(() => {
    if (isLogin || game.loaded) return;
    game
      .load()
      .then((signedIn) => {
        if (!signedIn) void goto('/login');
      })
      .catch((e: Error) => (error = e.message));
  });

  async function logout() {
    await api.logout();
    game.signOut();
    await goto('/login');
  }
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  <title>2Tamago</title>
</svelte:head>

{#if isLogin}
  {@render children()}
{:else}
  <header>
    <a class="brand" href="/">🥚 2Tamago</a>
    {#if game.player}
      <div class="who">
        <span class="coins" title="Pièces">🪙 {game.player.coins}</span>
        <span class="muted">{game.player.displayName}</span>
        <button class="link" onclick={logout}>Déconnexion</button>
      </div>
    {/if}
  </header>

  <main>
    {#if error}
      <div class="card">
        <p>{error}</p>
        <button onclick={() => location.reload()}>Réessayer</button>
      </div>
    {:else if game.loaded}
      {@render children()}
    {:else}
      <p class="muted">Chargement…</p>
    {/if}
  </main>

  <nav>
    {#each NAV as item (item.href)}
      <a href={item.href} class:active={page.url.pathname === item.href}>
        <span aria-hidden="true">{item.icon}</span>
        {item.label}
      </a>
    {/each}
  </nav>
{/if}

<Toasts />

<style>
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.8rem 1rem;
    max-width: 56rem;
    margin: 0 auto;
  }
  .brand {
    white-space: nowrap;
    font-weight: 800;
    font-size: 1.3rem;
    text-decoration: none;
    color: var(--text);
  }
  .who {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.2rem 0.8rem;
    align-items: center;
  }
  .coins {
    font-weight: bold;
  }
  main {
    max-width: 56rem;
    margin: 0 auto;
    padding: 0 1rem 6rem;
  }
  nav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    gap: 0.2rem;
    padding: 0.4rem;
    background: var(--surface);
    box-shadow: 0 -2px 12px rgb(0 0 0 / 0.08);
  }
  nav a {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.3rem 0.7rem;
    border-radius: 12px;
    font-size: 0.8rem;
    color: var(--muted);
    text-decoration: none;
  }
  nav a.active {
    color: var(--accent);
    background: var(--surface-2);
  }
</style>
