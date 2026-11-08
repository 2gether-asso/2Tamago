<script lang="ts">
  import '@fontsource-variable/inter';
  import '@fontsource/bungee';
  import '../app.css';
  import favicon from '#lib/assets/favicon.svg';
  import Toasts from '#lib/components/Toasts.svelte';
  import { api } from '#lib/api.ts';
  import { game } from '#lib/game.svelte.ts';
  import { theme } from '#lib/theme.svelte.ts';
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

  let nav = $derived(
    game.player?.isAdmin ? [...NAV, { href: '/admin', label: 'Admin', icon: '🛠️' }] : NAV,
  );
  let isLogin = $derived(page.url.pathname.startsWith('/login'));

  const THEME_UI = {
    system: { icon: '🌗', label: 'Thème automatique' },
    light: { icon: '☀️', label: 'Thème jour' },
    dark: { icon: '🌙', label: 'Thème nuit' },
  } as const;
  let themeUi = $derived(THEME_UI[theme.choice]);

  $effect(() => theme.init());

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

{#snippet themeToggle()}
  <button
    class="theme-toggle"
    onclick={() => theme.cycle()}
    title="{themeUi.label} (cliquer pour changer)"
    aria-label={themeUi.label}
  >
    {themeUi.icon}
  </button>
{/snippet}

{#if isLogin}
  <div class="login-theme">{@render themeToggle()}</div>
  {@render children()}
{:else}
  <header>
    <a class="brand" href="/">🥚 2Tamago</a>
    {#if game.player}
      <div class="who">
        <span class="coins" title="Pièces">🪙 {game.player.coins}</span>
        <span class="muted">{game.player.displayName}</span>
        <button class="link" onclick={logout}>Déconnexion</button>
        {@render themeToggle()}
      </div>
    {:else}
      {@render themeToggle()}
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
    {#each nav as item (item.href)}
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
    font-family: var(--font-brand);
    font-size: 1.35rem;
    text-decoration: none;
    background: linear-gradient(90deg, var(--accent), var(--accent-3));
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
  }
  .who {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.2rem 0.8rem;
    align-items: center;
  }
  .coins {
    font-weight: 700;
    padding: 0.15rem 0.7rem;
    border-radius: var(--radius-pill);
    background: var(--surface);
    border: 1px solid var(--border);
  }
  .theme-toggle {
    padding: 0.25rem 0.6rem;
    font-size: 1.05rem;
    line-height: 1.3;
  }
  .login-theme {
    position: fixed;
    top: 0.8rem;
    right: 1rem;
    z-index: 1;
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
    padding: 0.4rem 0.4rem calc(0.4rem + env(safe-area-inset-bottom, 0px));
    background: color-mix(in srgb, var(--surface) 82%, transparent);
    backdrop-filter: blur(16px) saturate(140%);
    border-top: 1px solid var(--border);
  }
  nav a {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.3rem 0.7rem;
    border-radius: var(--radius-md);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--muted);
    text-decoration: none;
    transition:
      color 0.15s,
      background 0.15s;
  }
  nav a span {
    font-size: 1.25rem;
    transition: transform 0.15s;
  }
  nav a.active {
    color: var(--accent);
    background: rgb(var(--accent-rgb) / 0.14);
  }
  nav a.active span {
    transform: translateY(-2px) scale(1.1);
  }
</style>
