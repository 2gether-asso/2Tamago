<script lang="ts">
  import '@fontsource-variable/inter';
  import '@fontsource/bungee';
  import '../app.css';
  import favicon from '#lib/assets/favicon.svg';
  import FeedbackModal from '#lib/components/FeedbackModal.svelte';
  import EventsBanner from '#lib/components/EventsBanner.svelte';
  import { events } from '#lib/events.svelte.ts';
  import Toasts from '#lib/components/Toasts.svelte';
  import { clientConfig } from '#lib/client-config.svelte.ts';
  import { api } from '#lib/api.ts';
  import { game } from '#lib/game.svelte.ts';
  import { i18n, t, type Locale, type MessageKey } from '#lib/i18n/index.svelte.ts';
  import { push } from '#lib/push.svelte.ts';
  import { theme } from '#lib/theme.svelte.ts';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
  let error = $state<string | null>(null);
  let feedbackOpen = $state(false);

  const NAV: { href: string; label: MessageKey; icon: string }[] = [
    { href: '/', label: 'nav.home', icon: '🏠' },
    { href: '/village', label: 'nav.village', icon: '🌳' },
    { href: '/contests', label: 'nav.contests', icon: '🏆' },
    { href: '/shop', label: 'nav.shop', icon: '🛍️' },
    { href: '/journal', label: 'nav.journal', icon: '📜' },
    { href: '/album', label: 'nav.album', icon: '📔' },
  ];

  let nav = $derived<typeof NAV>(
    game.player?.isAdmin ? [...NAV, { href: '/admin', label: 'nav.admin', icon: '🛠️' }] : NAV,
  );
  let isLogin = $derived(page.url.pathname.startsWith('/login'));

  const THEME_UI: Record<typeof theme.choice, { icon: string; label: MessageKey }> = {
    system: { icon: '🌗', label: 'theme.system' },
    light: { icon: '☀️', label: 'theme.light' },
    dark: { icon: '🌙', label: 'theme.dark' },
  };
  let themeUi = $derived(THEME_UI[theme.choice]);
  let otherLocale = $derived<Locale>(i18n.locale === 'fr' ? 'en' : 'fr');

  $effect(() => theme.init());
  $effect(() => {
    document.documentElement.lang = i18n.locale;
  });

  // Only for someone signed in: the bonuses are not shown on the login page.
  $effect(() => {
    if (game.loaded) events.start();
  });

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
    await push.forget();
    await api.logout();
    game.signOut();
    events.stop();
    await goto('/login');
  }
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  <title>2Tamago</title>
</svelte:head>

{#snippet themeToggle()}
  <button
    class="icon-button"
    onclick={() => theme.cycle()}
    title={t('theme.cycle', { label: t(themeUi.label) })}
    aria-label={t(themeUi.label)}
  >
    {themeUi.icon}
  </button>
  <button
    class="icon-button lang"
    onclick={() => i18n.set(otherLocale)}
    title="{t('lang.switch')} : {t(`lang.${otherLocale}`)}"
    aria-label="{t('lang.switch')} : {t(`lang.${otherLocale}`)}"
    lang={otherLocale}
  >
    {otherLocale.toUpperCase()}
  </button>
{/snippet}

{#if isLogin}
  <div class="login-theme">{@render themeToggle()}</div>
  {@render children()}
{:else}
  <header>
    <a class="brand" href="/"
      ><span aria-hidden="true">🥚</span> <span class="name">2Tamago</span></a
    >
    {#if game.player}
      <div class="who">
        <span class="coins" title={t('header.coins')}>🪙 {game.player.coins}</span>
        <a class="who-name" href="/players/{game.player.id}" title={t('profile.mine')}
          >{game.player.displayName}</a
        >
        <button class="link" onclick={logout}>{t('header.logout')}</button>
        {#if clientConfig.feedbackEnabled}
          <button
            class="icon-button"
            onclick={() => (feedbackOpen = true)}
            title={t('feedback.title')}
            aria-label={t('feedback.title')}
          >
            💬
          </button>
        {/if}
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
        <button onclick={() => location.reload()}>{t('common.retry')}</button>
      </div>
    {:else if game.loaded}
      <EventsBanner />
      {@render children()}
    {:else}
      <p class="muted">{t('common.loading')}</p>
    {/if}
  </main>

  <nav>
    {#each nav as item (item.href)}
      <a href={item.href} class:active={page.url.pathname === item.href}>
        <span aria-hidden="true">{item.icon}</span>
        {t(item.label)}
      </a>
    {/each}
  </nav>
{/if}

{#if clientConfig.feedbackEnabled}
  <FeedbackModal bind:open={feedbackOpen} />
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
  }
  .brand .name {
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
  .who-name {
    color: var(--muted);
    text-decoration: none;
  }
  .who-name:hover {
    color: var(--accent);
    text-decoration: underline;
  }
  .coins {
    font-weight: 700;
    padding: 0.15rem 0.7rem;
    border-radius: var(--radius-pill);
    background: var(--surface);
    border: 1px solid var(--border);
  }
  .icon-button {
    padding: 0.25rem 0.6rem;
    font-size: 1.05rem;
    line-height: 1.3;
  }
  .lang {
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.04em;
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
