<script lang="ts">
  import { api } from '#lib/api.ts';
  import { game } from '#lib/game.svelte.ts';
  import { toasts } from '#lib/toasts.svelte.ts';

  let json = $state('{}');
  let loaded = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let base = $state.raw<Record<string, unknown> | null>(null);

  $effect(() => {
    if (!game.player?.isAdmin) return;
    api
      .adminRules()
      .then((rules) => {
        json = JSON.stringify(rules.overrides, null, 2);
        base = rules.base as unknown as Record<string, unknown>;
        loaded = true;
      })
      .catch((e: Error) => (error = e.message));
  });

  async function save(event: SubmitEvent) {
    event.preventDefault();
    error = null;
    let overrides: unknown;
    try {
      overrides = JSON.parse(json);
    } catch {
      error = 'Ce n’est pas du JSON valide.';
      return;
    }
    busy = true;
    try {
      const rules = await api.saveAdminRules(overrides);
      json = JSON.stringify(rules.overrides, null, 2);
      toasts.push('Réglages enregistrés. Les joueurs les reçoivent au prochain chargement.');
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<h1>Administration</h1>

{#if !game.player?.isAdmin}
  <p class="card">Cette page est réservée aux administrateurs.</p>
{:else if error && !loaded}
  <p class="card">{error}</p>
{:else if loaded}
  <p class="muted">
    Réglages du jeu, modifiables sans redéploiement. Seules les valeurs listées ci-dessous
    remplacent celles par défaut ; <code>{'{}'}</code> revient aux valeurs par défaut. La vitesse du temps
    et le pas de simulation ne sont pas modifiables.
  </p>
  <form class="card" onsubmit={save}>
    <label>
      Modifications (JSON)
      <textarea bind:value={json} rows="12" spellcheck="false"></textarea>
    </label>
    {#if error}<p class="error">{error}</p>{/if}
    <button class="primary" disabled={busy}>Enregistrer</button>
  </form>
  <details class="card">
    <summary>Valeurs par défaut</summary>
    <pre>{JSON.stringify(base, null, 2)}</pre>
  </details>
{:else}
  <p class="muted">Chargement…</p>
{/if}

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  textarea {
    font-family: monospace;
    width: 100%;
  }
  .error {
    color: var(--bad);
  }
  pre {
    overflow-x: auto;
  }
</style>
