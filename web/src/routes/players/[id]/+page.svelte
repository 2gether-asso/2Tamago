<script lang="ts">
  import { ageInDays, ITEMS, SPECIES_LABELS, TRICKS, trickLevel, type ItemId } from '@2tamago/core';
  import type { PlayerProfile } from '@2tamago/core/contracts';
  import PushSettings from '#lib/components/PushSettings.svelte';
  import PetSprite from '#lib/components/PetSprite.svelte';
  import StatBar from '#lib/components/StatBar.svelte';
  import { api } from '#lib/api.ts';
  import { game } from '#lib/game.svelte.ts';
  import { toasts } from '#lib/toasts.svelte.ts';
  import { intlTag, t } from '#lib/i18n/index.svelte.ts';
  import {
    formLabel,
    itemLabel,
    moodLabel,
    stageLabel,
    temperamentHint,
    temperamentLabel,
    trickLabel,
  } from '#lib/texts.ts';
  import type { PageProps } from './$types';

  let { params }: PageProps = $props();
  let profile = $state.raw<PlayerProfile | null>(null);
  let error = $state<string | null>(null);

  $effect(() => {
    profile = null;
    error = null;
    api
      .playerProfile(params.id)
      .then((p) => (profile = p))
      .catch((e: Error) => (error = e.message));
  });

  let toggling = $state(false);
  async function toggleFavorite() {
    if (!profile || toggling) return;
    toggling = true;
    try {
      const { favorite } = await api.setFavorite(profile.player.id, !profile.player.favorite);
      profile = { ...profile, player: { ...profile.player, favorite } };
    } catch (e) {
      toasts.push((e as Error).message, 'error');
    } finally {
      toggling = false;
    }
  }

  let date = $derived(new Intl.DateTimeFormat(intlTag(), { dateStyle: 'long' }));
  let now = $derived(game.now + game.clockOffset);

  /** The figures of the player card, in display order. */
  let figures = $derived(
    profile
      ? [
          { label: t('profile.stat.companions'), value: String(profile.stats.companions) },
          {
            label: t('profile.stat.best_age'),
            value:
              profile.stats.bestAgeDays > 0
                ? t('duration.days', { count: profile.stats.bestAgeDays })
                : '–',
          },
          { label: t('profile.stat.retired'), value: String(profile.stats.retired) },
          { label: t('profile.stat.departed'), value: String(profile.stats.departed) },
          { label: t('profile.stat.caresses_given'), value: String(profile.stats.caressesGiven) },
          {
            label: t('profile.stat.caresses_received'),
            value: String(profile.stats.caressesReceived),
          },
          { label: t('profile.stat.gifts_given'), value: String(profile.stats.giftsGiven) },
          { label: t('profile.stat.gifts_received'), value: String(profile.stats.giftsReceived) },
          { label: t('profile.stat.walks'), value: String(profile.stats.walks) },
          { label: t('profile.stat.encounters'), value: String(profile.stats.encounters) },
        ]
      : [],
  );
</script>

{#if error}
  <p class="card">{error}</p>
{:else if profile}
  {@const player = profile.player}
  {@const pet = profile.pet?.state ?? null}
  <section class="card player" aria-labelledby="player-title">
    <h2 class="sr-only">{t('profile.player_card')}</h2>
    <div class="identity">
      {#if player.avatarUrl}
        <img class="avatar" src={player.avatarUrl} alt="" referrerpolicy="no-referrer" />
      {:else}
        <span class="avatar initial" aria-hidden="true"
          >{player.displayName.slice(0, 1).toUpperCase()}</span
        >
      {/if}
      <div>
        <h1 id="player-title">{player.displayName}</h1>
        <p class="muted">{t('profile.member_since', { date: date.format(player.memberSince) })}</p>
        {#if player.isYou}<span class="chip you">{t('profile.you')}</span>{/if}
      </div>
    </div>
    <dl class="figures">
      {#each figures as figure (figure.label)}
        <div>
          <dt>{figure.label}</dt>
          <dd>{figure.value}</dd>
        </div>
      {/each}
    </dl>
    {#if player.isYou}<a class="link-button" href="/album">{t('profile.album')}</a>{:else}
      <button
        class="link-button"
        type="button"
        aria-pressed={player.favorite}
        disabled={toggling}
        onclick={toggleFavorite}
      >
        {player.favorite ? t('profile.unfollow') : t('profile.follow')}
      </button>
    {/if}
  </section>

  <section class="card pet" aria-labelledby="pet-title">
    <h2 class="sr-only">{t('profile.pet_card')}</h2>
    {#if pet && profile.pet}
      <div class="scene" class:night={pet.asleep}>
        <PetSprite
          species={pet.species}
          stage={pet.stage}
          form={pet.form}
          color={pet.color}
          traits={pet.traits}
          mood={profile.pet.mood}
          equipped={pet.equipped}
          size={240}
        />
      </div>
      <h2 id="pet-title" class="name">{pet.name}</h2>
      <p class="muted">
        {SPECIES_LABELS[pet.species]} · {stageLabel(pet.stage)}
        {#if pet.form}· {formLabel(pet.form)}{/if}
        {#if game.rules}· {t('duration.days', { count: ageInDays(pet, now, game.rules) })}{/if}
      </p>
      <p class="mood">{moodLabel(profile.pet.mood)}</p>
      {#if pet.traits}
        <p class="temperament" title={temperamentHint(pet.traits.temperament)}>
          {temperamentLabel(pet.traits.temperament)}
          <span class="muted">· {temperamentHint(pet.traits.temperament)}</span>
        </p>
      {/if}
      {#if pet.equipped && pet.equipped in ITEMS}
        <p class="muted">{t('profile.equipped', { item: itemLabel(pet.equipped as ItemId) })}</p>
      {/if}

      {#if pet.stage === 'egg'}
        <p class="muted">{t('profile.egg')}</p>
      {:else}
        <div class="bars">
          <StatBar icon="🍙" label={t('stat.satiety')} value={pet.stats.satiety} />
          <StatBar icon="😊" label={t('stat.happiness')} value={pet.stats.happiness} />
          <StatBar icon="⚡" label={t('stat.energy')} value={pet.stats.energy} />
          <StatBar icon="🛁" label={t('stat.hygiene')} value={pet.stats.hygiene} />
          <StatBar icon="❤️" label={t('stat.health')} value={pet.stats.health} />
          <StatBar icon="🎓" label={t('stat.discipline')} value={pet.stats.discipline} />
          <StatBar icon="💞" label={t('stat.bond')} value={pet.bond} />
        </div>
        {#if pet.stage !== 'baby'}
          <h3>{t('profile.tricks')}</h3>
          <ul class="tricks">
            {#each TRICKS as id (id)}
              <li>
                <span>{trickLabel(id)}</span>
                <span aria-hidden="true"
                  >{'★'.repeat(trickLevel(pet.tricks[id]))}{'☆'.repeat(
                    3 - trickLevel(pet.tricks[id]),
                  )}</span
                >
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
      {#if !player.isYou}
        <a class="link-button primary-link" href="/village/{profile.pet.id}">{t('profile.visit')}</a
        >
      {/if}
    {:else}
      <p class="muted center">{t('profile.no_pet')}</p>
    {/if}
  </section>
  {#if player.isYou}<PushSettings />{/if}
{:else}
  <p class="muted">{t('common.loading')}</p>
{/if}

<style>
  section {
    margin: 1rem 0;
  }
  .identity {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .identity h1 {
    margin: 0;
  }
  .identity p {
    margin: 0.1rem 0 0.4rem;
  }
  .avatar {
    width: 4.5rem;
    height: 4.5rem;
    border-radius: 50%;
    border: 2px solid var(--border);
    object-fit: cover;
    flex: none;
  }
  .initial {
    display: grid;
    place-items: center;
    font-family: var(--font-brand);
    font-size: 1.8rem;
    color: var(--accent-text);
    background: linear-gradient(135deg, var(--accent), var(--accent-3));
  }
  .chip {
    font-size: 0.8rem;
    padding: 0.1rem 0.6rem;
    border-radius: var(--radius-pill);
    background: rgb(var(--accent-rgb) / 0.14);
    color: var(--accent);
    font-weight: 600;
  }
  .figures {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
    gap: 0.6rem;
    margin: 1.2rem 0 0;
  }
  .figures div {
    padding: 0.6rem 0.8rem;
    border-radius: var(--radius-md);
    background: var(--surface-2);
  }
  dt {
    font-size: 0.8rem;
    color: var(--muted);
  }
  dd {
    margin: 0.1rem 0 0;
    font-size: 1.3rem;
    font-weight: 700;
  }
  .pet {
    text-align: center;
  }
  .scene {
    display: grid;
    place-items: center;
    border-radius: var(--radius);
    background: linear-gradient(var(--scene-top), var(--scene-bottom));
    border: 1px solid var(--border);
    padding: 1rem 0;
    margin-bottom: 0.8rem;
  }
  .scene.night {
    background: linear-gradient(#141638, #3a2f78);
  }
  .name {
    margin: 0;
    font-family: var(--font-brand);
    font-weight: 400;
    font-size: 1.8rem;
  }
  .pet p {
    margin: 0.2rem 0;
  }
  .mood {
    font-weight: 700;
  }
  .temperament {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--accent);
  }
  .bars {
    display: grid;
    gap: 0.4rem;
    margin: 1rem auto 0;
    max-width: 26rem;
    text-align: left;
  }
  .tricks {
    list-style: none;
    padding: 0;
    margin: 0 auto;
    max-width: 18rem;
    display: grid;
    gap: 0.2rem;
  }
  .tricks li {
    display: flex;
    justify-content: space-between;
  }
  .link-button {
    display: inline-block;
    margin-top: 1rem;
    padding: 0.5rem 1.1rem;
    border-radius: var(--radius-pill);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font-weight: 600;
    text-decoration: none;
  }
  .primary-link {
    background: linear-gradient(135deg, var(--accent), var(--accent-3));
    color: var(--accent-text);
    border-color: transparent;
  }
  .center {
    text-align: center;
  }
</style>
