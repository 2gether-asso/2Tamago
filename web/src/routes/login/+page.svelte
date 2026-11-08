<script lang="ts">
  import { api } from '#lib/api.ts';
  import { auth, SessionEnded } from '#lib/auth/index.ts';
  import { game } from '#lib/game.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import { goto, replaceState } from '$app/navigation';
  import { page } from '$app/state';

  // Errors the API sends back in the URL (`?error=`), and reasons a session ended.
  const ERRORS = {
    not_member: 'login.error.not_member',
    state: 'login.error.state',
    denied: 'login.error.denied',
    discord: 'login.error.discord',
    invalid_grant: 'login.error.state',
    invalid_dpop: 'login.error.state',
    session_expired: 'login.error.session_expired',
    session_suspicious: 'login.error.session_suspicious',
    session_roaming: 'login.error.session_roaming',
  } as const;
  const errorCode = page.url.searchParams.get('error') ?? auth.takeEnd();

  let name = $state('');
  let failure = $state<string | null>(null);
  let message = $derived(
    failure ??
      (errorCode && errorCode in ERRORS ? t(ERRORS[errorCode as keyof typeof ERRORS]) : null),
  );
  const config = api.authConfig();

  /** Starts a sign-in, then comes home. */
  async function enter(start: () => Promise<void>) {
    try {
      await start();
      await game.load();
      await goto('/');
    } catch (e) {
      failure =
        e instanceof SessionEnded && e.code in ERRORS
          ? t(ERRORS[e.code as keyof typeof ERRORS])
          : (e as Error).message;
    }
  }

  function devLogin(event: SubmitEvent) {
    event.preventDefault();
    void enter(() => api.devLogin(name));
  }

  // Back from Discord: the API sends a one-time code, traded for tokens with the PKCE secret.
  $effect(() => {
    const code = page.url.searchParams.get('code');
    if (!code) return;
    replaceState('/login', {});
    void enter(() => auth.finishDiscord(code));
  });
</script>

<div class="login">
  <div class="card">
    <h1>🥚 2Tamago</h1>
    <p>{t('login.intro')}</p>

    {#if message}<p class="error">{message}</p>{/if}

    {#await config then { discord, devLogin: devLoginEnabled, inviteUrl }}
      {#if discord}
        <button class="discord" onclick={() => auth.beginDiscord()}>{t('login.discord')}</button>
        {#if inviteUrl}
          <p><a class="invite" href={inviteUrl} rel="noopener">{t('login.join')}</a></p>
        {/if}
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
  .invite {
    font-size: 0.9rem;
    color: var(--muted);
  }
  .discord {
    display: inline-block;
    margin: 1rem 0;
    border: 0;
    cursor: pointer;
    font-size: inherit;
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
