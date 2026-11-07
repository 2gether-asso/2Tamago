<script lang="ts">
  import { api } from '#lib/api.ts';
  import { game } from '#lib/game.svelte.ts';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';

  const ERRORS: Record<string, string> = {
    not_member: 'Il faut être membre du Discord de 2GETHER pour jouer.',
    state: 'La connexion a expiré, réessaie.',
  };

  let name = $state('');
  let message = $state<string | null>(ERRORS[page.url.searchParams.get('error') ?? ''] ?? null);
  const config = api.authConfig();

  async function devLogin(event: SubmitEvent) {
    event.preventDefault();
    try {
      await api.devLogin(name);
      await game.load();
      await goto('/');
    } catch (e) {
      message = (e as Error).message;
    }
  }
</script>

<div class="login">
  <div class="card">
    <h1>🥚 2Tamago</h1>
    <p>
      Adopte un compagnon, prends-en soin, et rends visite à ceux des autres membres de 2GETHER.
    </p>

    {#if message}<p class="error">{message}</p>{/if}

    {#await config then { discord, devLogin: devLoginEnabled }}
      {#if discord}
        <a class="discord" href={api.discordLoginUrl}>Se connecter avec Discord</a>
      {/if}
      {#if devLoginEnabled}
        <form onsubmit={devLogin}>
          <p class="muted">Mode développement : connexion par pseudo.</p>
          <input bind:value={name} placeholder="Pseudo" minlength="2" maxlength="32" required />
          <button class="primary">Entrer</button>
        </form>
      {/if}
      {#if !discord && !devLoginEnabled}
        <p class="muted">Aucune méthode de connexion n’est configurée.</p>
      {/if}
    {:catch}
      <p class="error">Le serveur est injoignable.</p>
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
