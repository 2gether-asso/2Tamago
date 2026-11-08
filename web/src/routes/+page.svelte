<script lang="ts">
  import {
    ageInDays,
    ITEMS,
    isAccessory,
    isSnack,
    SPECIES_LABELS,
    TEMPERAMENT_LABELS,
    TRICK_LABELS,
    TRICKS,
    trickLevel,
    type ItemId,
    type TrickId,
  } from '@2tamago/core';
  import type { WalkResponse } from '@2tamago/core/contracts';
  import AdoptForm from '#lib/components/AdoptForm.svelte';
  import PetSprite from '#lib/components/PetSprite.svelte';
  import PlayGame from '#lib/components/PlayGame.svelte';
  import StatBar from '#lib/components/StatBar.svelte';
  import { game } from '#lib/game.svelte.ts';
  import { ALERT_LABELS, FORM_LABELS, MOOD_LABELS, STAGE_LABELS } from '#lib/texts.ts';

  let playing = $state(false);
  let walkResult = $state<WalkResponse | null>(null);
  let trick = $state<TrickId>('sit');
  let lastCaress = 0;

  let pet = $derived(game.pet);
  let now = $derived(game.now + game.clockOffset);
  let alive = $derived(pet?.status === 'alive');
  let hatched = $derived(alive && pet?.stage !== 'egg');
  let free = $derived(hatched && !pet?.outing);
  let awake = $derived(free && !pet?.asleep);
  let snacks = $derived(
    (Object.entries(game.inventory) as [ItemId, number][]).filter(
      ([id, n]) => n > 0 && isSnack(id),
    ),
  );
  let accessories = $derived(
    (Object.entries(game.inventory) as [ItemId, number][]).filter(
      ([id, n]) => n > 0 && isAccessory(id),
    ),
  );
  let walkLeft = $derived(pet?.outing ? Math.max(0, pet.outing.endsAt - now) : 0);

  function caress() {
    const cooldown = (game.rules?.caressCooldownSeconds ?? 15) * 1000;
    if (!awake || Date.now() - lastCaress < cooldown) return;
    lastCaress = Date.now();
    void game.act({ type: 'caress' });
  }

  async function finishGame(score: number) {
    playing = false;
    await game.act({ type: 'play', score });
  }

  async function returnFromWalk() {
    walkResult = await game.returnFromWalk();
  }

  function formatDuration(ms: number): string {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
  }
</script>

{#if !pet}
  <AdoptForm />
{:else if !alive}
  <div class="card farewell">
    <PetSprite
      species={pet.species}
      stage={pet.stage}
      form={pet.form}
      color={pet.color}
      traits={pet.traits}
      mood={game.mood ?? 'gone'}
      size={160}
    />
    {#if pet.status === 'retired'}
      <h2>{pet.name} prend une retraite bien méritée 🌅</h2>
    {:else}
      <h2>{pet.name} est parti…</h2>
      <p class="muted">
        Il ne se sentait plus assez entouré. Il vit désormais sa vie, quelque part.
      </p>
    {/if}
    <p class="muted">Il restera dans ton album.</p>
  </div>
  <AdoptForm />
{:else}
  <section class="card pet">
    <div class="heading">
      <h1>{pet.name}</h1>
      <p class="muted">
        {SPECIES_LABELS[pet.species]} · {STAGE_LABELS[pet.stage]}
        {#if pet.form}· {FORM_LABELS[pet.form]}{/if}
        · {game.rules ? ageInDays(pet, now, game.rules) : 0} j
      </p>
      {#if pet.traits}
        {@const temperament = TEMPERAMENT_LABELS[pet.traits.temperament]}
        <p class="temperament" title={temperament.hint}>
          {temperament.label} <span class="muted">· {temperament.hint}</span>
        </p>
      {/if}
      <p class="mood">{MOOD_LABELS[game.mood ?? 'ok']}</p>
      <div class="alerts">
        {#each game.alerts as alert (alert)}<span class="chip">{ALERT_LABELS[alert]}</span>{/each}
      </div>
    </div>

    <div class="scene" class:night={pet.asleep}>
      {#if pet.outing}
        <p class="away">🚶 En promenade… retour dans {formatDuration(walkLeft)}</p>
      {:else}
        <PetSprite
          species={pet.species}
          stage={pet.stage}
          form={pet.form}
          color={pet.color}
          traits={pet.traits}
          mood={game.mood ?? 'ok'}
          equipped={pet.equipped}
          oncaress={awake ? caress : undefined}
        />
        <div class="poops" aria-label="{pet.poops} cacas">
          {#each Array(pet.poops) as _, i (i)}<span>💩</span>{/each}
        </div>
      {/if}
    </div>
    {#if pet.stage === 'egg'}
      <p class="muted center">L’œuf bouge… il va bientôt éclore !</p>
    {:else if awake}
      <p class="muted center">
        Astuce : caresse {pet.name} en passant la souris (ou le doigt) dessus.
      </p>
    {/if}
  </section>

  {#if hatched}
    <section class="card">
      <h3>État</h3>
      <div class="stats">
        <StatBar icon="🍙" label="Satiété" value={pet.stats.satiety} />
        <StatBar icon="😊" label="Bonheur" value={pet.stats.happiness} />
        <StatBar icon="⚡" label="Énergie" value={pet.stats.energy} />
        <StatBar icon="🛁" label="Propreté" value={pet.stats.hygiene} />
        <StatBar icon="❤️" label="Santé" value={pet.stats.health} />
        <StatBar icon="🎓" label="Discipline" value={pet.stats.discipline} />
        <StatBar icon="💞" label="Lien" value={pet.bond} />
      </div>
    </section>

    <section class="card">
      <h3>Soins</h3>
      <div class="actions">
        <button disabled={!awake || game.busy} onclick={() => game.act({ type: 'feed' })}
          >🍙 Nourrir</button
        >
        <button disabled={!awake || game.busy} onclick={() => (playing = true)}>🎲 Jouer</button>
        <button disabled={!free || game.busy} onclick={() => game.act({ type: 'clean' })}
          >🧽 Nettoyer</button
        >
        {#if pet.sickSince !== null}
          <button disabled={!free || game.busy} onclick={() => game.act({ type: 'medicine' })}
            >💊 Soigner</button
          >
        {/if}
        {#if pet.asleep}
          <button disabled={!free || game.busy} onclick={() => game.act({ type: 'wake' })}
            >☀️ Réveiller</button
          >
        {:else}
          <button disabled={!awake || game.busy} onclick={() => game.act({ type: 'sleep' })}
            >🌙 Coucher</button
          >
        {/if}
        <button disabled={!awake || game.busy} onclick={() => game.act({ type: 'praise' })}
          >👏 Féliciter</button
        >
        <button disabled={!awake || game.busy} onclick={() => game.act({ type: 'scold' })}
          >☝️ Gronder</button
        >
      </div>

      {#if snacks.length > 0}
        <h4>Friandises</h4>
        <div class="actions">
          {#each snacks as [id, count] (id)}
            <button
              disabled={!awake || game.busy}
              onclick={() => game.act({ type: 'treat', item: id })}
            >
              {ITEMS[id].label} ×{count}
            </button>
          {/each}
        </div>
      {/if}
    </section>

    {#if pet.stage !== 'baby'}
      <section class="card">
        <h3>Dressage et sorties</h3>
        <div class="actions">
          <select bind:value={trick} aria-label="Tour à apprendre">
            {#each TRICKS as id (id)}
              <option value={id}
                >{TRICK_LABELS[id]} — {'★'.repeat(trickLevel(pet.tricks[id]))}{'☆'.repeat(
                  3 - trickLevel(pet.tricks[id]),
                )}</option
              >
            {/each}
          </select>
          <button disabled={!awake || game.busy} onclick={() => game.act({ type: 'train', trick })}
            >🎓 Entraîner</button
          >
          {#if pet.outing}
            <button class="primary" disabled={walkLeft > 0 || game.busy} onclick={returnFromWalk}
              >🏠 Ramener</button
            >
          {:else}
            <button disabled={!awake || game.busy} onclick={() => game.startWalk()}
              >🚶 Promenade</button
            >
          {/if}
          {#if pet.stage === 'elder'}
            <button
              disabled={game.busy}
              onclick={() =>
                confirm(`${pet.name} partira à la retraite. Continuer ?`) &&
                game.act({ type: 'retire' })}>🌅 Retraite</button
            >
          {/if}
        </div>
        {#if accessories.length > 0}
          <h4>Accessoires</h4>
          <div class="actions">
            {#each accessories as [id] (id)}
              <button
                class:primary={pet.equipped === id}
                disabled={game.busy}
                onclick={() => game.act({ type: 'equip', item: pet.equipped === id ? null : id })}
              >
                {ITEMS[id].label}
              </button>
            {/each}
          </div>
        {/if}
      </section>
    {/if}
  {/if}
{/if}

{#if playing && pet}
  <PlayGame name={pet.name} onfinish={finishGame} oncancel={() => (playing = false)} />
{/if}

{#if walkResult}
  <div class="backdrop">
    <div class="card dialog">
      <h2>De retour de promenade !</h2>
      <p>🪙 {walkResult.found.coins} pièces trouvées</p>
      {#each walkResult.found.items as item, i (i)}<p>🎁 {ITEMS[item].label}</p>{/each}
      {#if walkResult.encounters.length > 0}
        <h3>Rencontres</h3>
        <div class="met">
          {#each walkResult.encounters as friend (friend.petId)}
            <a href="/village/{friend.petId}">
              <PetSprite
                species={friend.species}
                stage="child"
                form={null}
                color={friend.color}
                mood="happy"
                size={80}
              />
              {friend.name}<br /><small class="muted">{friend.ownerName}</small>
            </a>
          {/each}
        </div>
      {:else}
        <p class="muted">Personne d’autre ne se promenait à ce moment-là.</p>
      {/if}
      <button class="primary" onclick={() => (walkResult = null)}>Super !</button>
    </div>
  </div>
{/if}

<style>
  section {
    margin-bottom: 1rem;
  }
  .pet {
    text-align: center;
  }
  .heading h1 {
    margin-bottom: 0;
  }
  .heading p {
    margin: 0.2rem 0;
  }
  .mood {
    font-weight: bold;
  }
  .temperament {
    margin: 0.2rem 0 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--accent);
  }
  .alerts {
    display: flex;
    gap: 0.4rem;
    justify-content: center;
    flex-wrap: wrap;
    min-height: 1.6rem;
  }
  .chip {
    font-size: 0.8rem;
    padding: 0.1rem 0.6rem;
    border-radius: 999px;
    background: var(--warn);
    color: var(--warn-text);
    font-weight: 600;
  }
  .scene {
    position: relative;
    margin: 1rem auto 0;
    min-height: 240px;
    max-width: 26rem;
    display: grid;
    place-items: center;
    border-radius: var(--radius);
    background: linear-gradient(var(--scene-top), var(--scene-bottom));
    border: 1px solid var(--border);
    transition: background 0.6s;
  }
  .scene.night {
    background: linear-gradient(#141638, #3a2f78);
  }
  .poops {
    position: absolute;
    bottom: 0.5rem;
    right: 0.8rem;
    font-size: 1.6rem;
  }
  .away {
    font-size: 1.1rem;
  }
  .center {
    text-align: center;
  }
  .stats {
    display: grid;
    gap: 0.4rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  h4 {
    margin: 1rem 0 0.5rem;
  }
  .farewell {
    text-align: center;
    margin-bottom: 1rem;
  }
  .met {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-bottom: 1rem;
  }
  .met a {
    color: var(--text);
    text-decoration: none;
  }
</style>
