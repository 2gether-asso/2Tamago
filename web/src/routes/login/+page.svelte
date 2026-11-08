<script lang="ts">
  import { api } from '#lib/api.ts';
  import { game } from '#lib/game.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';

  const ERRORS = { not_member: 'login.error.not_member', state: 'login.error.state' } as const;
  const errorCode = page.url.searchParams.get('error');

  let name = $state('');
  let failure = $state<string | null>(null);
  let message = $derived(
    failure ??
      (errorCode && errorCode in ERRORS ? t(ERRORS[errorCode as keyof typeof ERRORS]) : null),
  );
  const config = api.authConfig();

  async function devLogin(event: SubmitEvent) {
    event.preventDefault();
    try {
      await api.devLogin(name);
      await game.load();
      await goto('/');
    } catch (e) {
      failure = (e as Error).message;
    }
  }
</script>

<div class="login">
  <div class="card">
    <h1>🥚 2Tamago</h1>
    <p>{t('login.intro')}</p>

    {#if message}<p class="error">{message}</p>{/if}

    {#await config then { discord, devLogin: devLoginEnabled }}
      {#if discord}
        <a class="discord" href={api.discordLoginUrl}>{t('login.discord')}</a>
      {/if}
      {#if devLoginEnabled}
        <form onsubmit={devLogin}>
          <p class="muted">{t('login.dev_hint')}</p>
          <input
            bind:value={name}
            placeholder={t('login.nickname')}
            minlength="2"
            maxlength="32"
            required
          />
          <button class="primary">{t('login.enter')}</button>
        </form>
      {/if}
      {#if !discord && !devLoginEnabled}
        <p class="muted">{t('login.none')}</p>
      {/if}
    {:catch}
      <p class="error">{t('login.unreachable')}</p>
    {/await}
  </div>
</div>

<style>
  .login {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 1rem;
  }
  .card {
    width: min(26rem, 100%);
    text-align: center;
  }
  .discord {
    display: inline-block;
    margin: 1rem 0;
    padding: 0.7rem 1.4rem;
    border-radius: 999px;
    background: #5865f2;
    color: white;
    font-weight: bold;
    text-decoration: none;
  }
  form {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: center;
    margin-top: 1rem;
  }
  form p {
    width: 100%;
    margin: 0;
  }
  .error {
    color: var(--bad);
  }
</style>
