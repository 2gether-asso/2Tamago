<script lang="ts">
  import {
    ageInDays,
    gameHours,
    bedtimeOf,
    isAccessory,
    isNight,
    isSnack,
    SPECIES_LABELS,
    TRICKS,
    WALK_ZONE_IDS,
    WALK_ZONES,
    zoneOpenTo,
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
  import { intlTag, t } from '#lib/i18n/index.svelte.ts';
  import {
    alertLabel,
    formLabel,
    itemLabel,
    moodLabel,
    stageLabel,
    temperamentHint,
    temperamentLabel,
    trickLabel,
    zoneHint,
    zoneLabel,
  } from '#lib/texts.ts';

  const ZONE_ICONS = { meadow: '🌼', forest: '🌲', beach: '🏖️' } as const;

  let playing = $state(false);
  let walkResult = $state<WalkResponse | null>(null);
  let trick = $state<TrickId>('sit');
  let lastCaress = 0;

  let pet = $derived(game.pet);
  let now = $derived(game.now + game.clockOffset);
  let alive = $derived(pet?.status === 'alive');
  let hatched = $derived(alive && pet?.stage !== 'egg');
  let vacation = $derived(pet?.vacationSince != null);
  let free = $derived(hatched && !pet?.outing && !vacation);
  let awake = $derived(free && !pet?.asleep);
  let night = $derived(game.rules && pet ? isNight(game.rules, now, pet.stage) : false);
  let bedtime = $derived(game.rules && pet ? bedtimeOf(game.rules, pet.stage) : null);
  let needsLightsOff = $derived(awake && night && !pet?.lightsOff);
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
  let dateFormat = $derived(new Intl.DateTimeFormat(intlTag(), { dateStyle: 'long' }));
  /** When the pet may go on vacation again, if it came back recently (otherwise `null`). */
  let vacationAvailableOn = $derived.by(() => {
    if (!game.rules || pet?.vacationEndedAt == null) return null;
    const date = pet.vacationEndedAt + gameHours(game.rules, game.rules.vacationCooldownHours);
    return date > now ? date : null;
  });
  let vacationEnds = $derived(
    game.rules && pet?.vacationSince != null
      ? pet.vacationSince + gameHours(game.rules, game.rules.vacationMaxHours)
      : null,
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
    return t('duration.min_sec', {
      minutes: Math.floor(s / 60),
      seconds: String(s % 60).padStart(2, '0'),
    });
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
      <h2>{t('home.farewell.retired', { name: pet.name })}</h2>
    {:else}
      <h2>{t('home.farewell.left', { name: pet.name })}</h2>
      <p class="muted">{t('home.farewell.left_hint')}</p>
    {/if}
    <p class="muted">{t('home.farewell.album')}</p>
  </div>
  <AdoptForm />
{:else}
  <section class="card pet">
    <div class="heading">
      <h1>{pet.name}</h1>
      <p class="muted">
        {SPECIES_LABELS[pet.species]} · {stageLabel(pet.stage)}
        {#if pet.form}· {formLabel(pet.form)}{/if}
        · {t('duration.days', { count: game.rules ? ageInDays(pet, now, game.rules) : 0 })}
      </p>
      {#if pet.traits}
        {@const hint = temperamentHint(pet.traits.temperament)}
        <p class="temperament" title={hint}>
          {temperamentLabel(pet.traits.temperament)} <span class="muted">· {hint}</span>
        </p>
      {/if}
      {#if bedtime && hatched}
        <p class="muted bedtime">
          {t('home.bedtime', { start: bedtime.startHour, end: bedtime.endHour })}
        </p>
      {/if}
      <p class="mood">{moodLabel(game.mood ?? 'ok')}</p>
      <div class="alerts">
        {#each game.alerts as alert (alert)}<span class="chip">{alertLabel(alert)}</span>{/each}
        {#if needsLightsOff}<span class="chip">{t('home.bedtime_hint')}</span>{/if}
      </div>
    </div>

    <div class="scene" class:night={night || pet.asleep}>
      {#if pet.outing}
        <p class="away">
          {t('home.away', {
            zone: zoneLabel(pet.outing.zone ?? 'meadow'),
            time: formatDuration(walkLeft),
          })}
        </p>
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
        <div class="poops" aria-label={t('home.poops', { count: pet.poops })}>
          {#each Array(pet.poops) as _, i (i)}<span>💩</span>{/each}
        </div>
      {/if}
    </div>
    {#if pet.stage === 'egg'}
      <p class="muted center">{t('home.egg_hint')}</p>
    {:else if awake}
      <p class="muted center">{t('home.caress_tip', { name: pet.name })}</p>
    {/if}
  </section>

  {#if hatched}
    <section class="card">
      <h3>{t('home.status')}</h3>
      <div class="stats">
        <StatBar icon="🍙" label={t('stat.satiety')} value={pet.stats.satiety} />
        <StatBar icon="😊" label={t('stat.happiness')} value={pet.stats.happiness} />
        <StatBar icon="⚡" label={t('stat.energy')} value={pet.stats.energy} />
        <StatBar icon="🛁" label={t('stat.hygiene')} value={pet.stats.hygiene} />
        <StatBar icon="❤️" label={t('stat.health')} value={pet.stats.health} />
        <StatBar icon="🎓" label={t('stat.discipline')} value={pet.stats.discipline} />
        <StatBar icon="💞" label={t('stat.bond')} value={pet.bond} />
      </div>
    </section>

    <section class="card">
      <h3>{t('home.care')}</h3>
      <div class="actions">
        <button disabled={!awake || game.busy} onclick={() => game.act({ type: 'feed' })}
          >{t('action.feed')}</button
        >
        <button disabled={!awake || game.busy} onclick={() => (playing = true)}
          >{t('action.play')}</button
        >
        <button disabled={!free || game.busy} onclick={() => game.act({ type: 'clean' })}
          >{t('action.clean')}</button
        >
        {#if pet.sickSince !== null}
          <button disabled={!free || game.busy} onclick={() => game.act({ type: 'medicine' })}
            >{t('action.medicine')}</button
          >
        {/if}
        {#if pet.asleep}
          <button disabled={!free || game.busy} onclick={() => game.act({ type: 'wake' })}
            >{t('action.wake')}</button
          >
        {:else}
          <button disabled={!awake || game.busy} onclick={() => game.act({ type: 'sleep' })}
            >{t('action.sleep')}</button
          >
        {/if}
        {#if pet.lightsOff}
          <button
            disabled={!free || game.busy}
            onclick={() => game.act({ type: 'lights', on: true })}>{t('action.lights_on')}</button
          >
        {:else if night}
          <button
            disabled={!free || game.busy}
            onclick={() => game.act({ type: 'lights', on: false })}>{t('action.lights_off')}</button
          >
        {/if}
        <button disabled={!awake || game.busy} onclick={() => game.act({ type: 'praise' })}
          >{t('action.praise')}</button
        >
        <button disabled={!awake || game.busy} onclick={() => game.act({ type: 'scold' })}
          >{t('action.scold')}</button
        >
      </div>

      {#if snacks.length > 0}
        <h4>{t('home.treats')}</h4>
        <div class="actions">
          {#each snacks as [id, count] (id)}
            <button
              disabled={!awake || game.busy}
              onclick={() => game.act({ type: 'treat', item: id })}
            >
              {itemLabel(id)} ×{count}
            </button>
          {/each}
        </div>
      {/if}
    </section>

    <section class="card">
      <h3>{t('home.vacation.title')}</h3>
      {#if vacation && pet.vacationSince != null && vacationEnds !== null}
        <p>
          {t('home.vacation.active', {
            name: pet.name,
            since: dateFormat.format(pet.vacationSince),
            until: dateFormat.format(vacationEnds),
          })}
        </p>
        <button
          class="primary"
          disabled={game.busy}
          onclick={() => game.act({ type: 'endVacation' })}>{t('home.vacation.end')}</button
        >
      {:else}
        <p class="muted">
          {t('home.vacation.intro', {
            name: pet.name,
            days: game.rules ? Math.round(game.rules.vacationMaxHours / 24) : 14,
          })}
        </p>
        {#if vacationAvailableOn !== null}
          <p class="muted">
            {t('home.vacation.cooldown', { date: dateFormat.format(vacationAvailableOn) })}
          </p>
        {/if}
        <button
          disabled={!free || game.busy || vacationAvailableOn !== null}
          onclick={() =>
            confirm(t('home.vacation.start_confirm', { name: pet.name })) &&
            game.act({ type: 'startVacation' })}>{t('home.vacation.start')}</button
        >
      {/if}
    </section>

    {#if pet.stage !== 'baby' && !pet.outing && game.rules}
      {@const rules = game.rules}
      <section class="card">
        <h3>{t('home.zones')}</h3>
        <div class="zones">
          {#each WALK_ZONE_IDS as id (id)}
            {@const zone = WALK_ZONES[id]}
            {@const open = zoneOpenTo(zone, pet.stage)}
            {@const tired = pet.stats.energy < zone.energyCost + 5}
            <div class="zone" class:locked={!open}>
              <span class="zone-icon" aria-hidden="true">{ZONE_ICONS[id]}</span>
              <div class="zone-text">
                <strong>{zoneLabel(id)}</strong>
                <small class="muted">{zoneHint(id)}</small>
                <small class="muted">
                  {#if open}
                    {t('home.zone_duration', {
                      minutes: Math.round(rules.outingHours * zone.durationFactor * 60),
                    })}
                    · {t('home.zone_cost', { energy: zone.energyCost })}
                    · 🪙 {zone.coins.min}–{zone.coins.max}
                  {:else}
                    🔒 {t('home.zone_locked', { stage: stageLabel(zone.minStage) })}
                  {/if}
                </small>
              </div>
              <button
                disabled={!awake || !open || tired || game.busy}
                onclick={() => game.startWalk(id)}>{t('home.zone_go')}</button
              >
            </div>
          {/each}
        </div>
      </section>
    {/if}

    {#if pet.stage !== 'baby'}
      <section class="card">
        <h3>{t('home.training')}</h3>
        <div class="actions">
          <select bind:value={trick} aria-label={t('home.trick_to_learn')}>
            {#each TRICKS as id (id)}
              <option value={id}
                >{trickLabel(id)} — {'★'.repeat(trickLevel(pet.tricks[id]))}{'☆'.repeat(
                  3 - trickLevel(pet.tricks[id]),
                )}</option
              >
            {/each}
          </select>
          <button disabled={!awake || game.busy} onclick={() => game.act({ type: 'train', trick })}
            >{t('action.train')}</button
          >
          {#if pet.outing}
            <button class="primary" disabled={walkLeft > 0 || game.busy} onclick={returnFromWalk}
              >{t('action.return')}</button
            >
          {/if}
          {#if pet.stage === 'elder'}
            <button
              disabled={game.busy}
              onclick={() =>
                confirm(t('home.retire_confirm', { name: pet.name })) &&
                game.act({ type: 'retire' })}>{t('action.retire')}</button
            >
          {/if}
        </div>
        {#if accessories.length > 0}
          <h4>{t('home.accessories')}</h4>
          <div class="actions">
            {#each accessories as [id] (id)}
              <button
                class:primary={pet.equipped === id}
                disabled={game.busy}
                onclick={() => game.act({ type: 'equip', item: pet.equipped === id ? null : id })}
              >
                {itemLabel(id)}
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
      <h2>{t('walk.title')}</h2>
      <p class="muted">
        {ZONE_ICONS[walkResult.zone]}
        {t('walk.zone', { zone: zoneLabel(walkResult.zone) })}
      </p>
      <p>{t('walk.coins_found', { count: walkResult.found.coins })}</p>
      {#each walkResult.found.items as item, i (i)}<p>🎁 {itemLabel(item)}</p>{/each}
      {#if walkResult.encounters.length > 0}
        <h3>{t('walk.encounters')}</h3>
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
        <p class="muted">{t('walk.nobody')}</p>
      {/if}
      <button class="primary" onclick={() => (walkResult = null)}>{t('walk.ok')}</button>
    </div>
  </div>
{/if}

<style>
  .zones {
    display: grid;
    gap: 0.6rem;
  }
  .zone {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.6rem 0.8rem;
    border-radius: var(--radius-md);
    background: var(--surface-2);
  }
  .zone.locked {
    opacity: 0.65;
  }
  .zone-icon {
    font-size: 1.8rem;
  }
  .zone-text {
    display: grid;
    gap: 0.1rem;
    flex: 1;
  }

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
  .bedtime {
    font-size: 0.85rem;
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
