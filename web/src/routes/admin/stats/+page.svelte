<script lang="ts">
  import { SPECIES_LABELS, STAGES, FORMS, type Species, type Temperament } from '@2tamago/core';
  import type { AdminStats, GroupStats } from '@2tamago/core/contracts';
  import BarList from '#lib/components/BarList.svelte';
  import DailyBars from '#lib/components/DailyBars.svelte';
  import StatBar from '#lib/components/StatBar.svelte';
  import { api } from '#lib/api.ts';
  import { game } from '#lib/game.svelte.ts';
  import { intlTag, t } from '#lib/i18n/index.svelte.ts';
  import { formLabel, itemLabel, stageLabel, temperamentLabel } from '#lib/texts.ts';
  import type { ItemId } from '@2tamago/core';

  /** A group needs this many companions to be compared, and is flagged beyond this gap. */
  const MIN_GROUP = 5;
  const GAP = 0.25;

  let stats = $state.raw<AdminStats | null>(null);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!game.player?.isAdmin) return;
    api
      .adminStats()
      .then((s) => (stats = s))
      .catch((e: Error) => (error = e.message));
  });

  let days = $derived(stats?.activity.days.map((d) => d.day) ?? []);
  let number = $derived(new Intl.NumberFormat(intlTag(), { maximumFractionDigits: 1 }));
  let percent = $derived(
    new Intl.NumberFormat(intlTag(), { style: 'percent', maximumFractionDigits: 0 }),
  );
  let dateTime = $derived(
    new Intl.DateTimeFormat(intlTag(), { dateStyle: 'medium', timeStyle: 'short' }),
  );

  type Column = {
    label: string;
    pick: (group: GroupStats) => number | null;
    format: (value: number) => string;
    /** Whether a gap with the mean of the rows is worth flagging. */
    compare: boolean;
  };
  let columns = $derived<Column[]>([
    { label: t('admin.stats.col_pets'), pick: (g) => g.pets, format: String, compare: false },
    { label: t('admin.stats.col_alive'), pick: (g) => g.alive, format: String, compare: false },
    { label: t('admin.stats.col_retired'), pick: (g) => g.retired, format: String, compare: false },
    {
      label: t('admin.stats.col_departed'),
      pick: (g) => g.departed,
      format: String,
      compare: false,
    },
    {
      label: t('admin.stats.col_departure'),
      pick: (g) => g.departureRate,
      format: (v) => percent.format(v),
      compare: true,
    },
    {
      label: t('admin.stats.col_lifespan'),
      pick: (g) => g.avgLifespanDays,
      format: (v) => t('duration.days', { count: Math.round(v * 10) / 10 }),
      compare: true,
    },
    {
      label: t('admin.stats.col_mistakes'),
      pick: (g) => g.mistakesPerDay,
      format: (v) => number.format(v),
      compare: true,
    },
    {
      label: t('admin.stats.col_bond'),
      pick: (g) => g.avgBond,
      format: (v) => number.format(v),
      compare: true,
    },
    {
      label: t('admin.stats.col_happiness'),
      pick: (g) => g.avgHappiness,
      format: (v) => number.format(v),
      compare: true,
    },
  ]);

  /** Whether `group` is far from the mean of the groups that are big enough to count. */
  function deviates(column: Column, group: GroupStats, groups: GroupStats[]): boolean {
    const value = column.pick(group);
    if (!column.compare || value === null || group.pets < MIN_GROUP) return false;
    const values = groups
      .filter((g) => g.pets >= MIN_GROUP)
      .map((g) => column.pick(g))
      .filter((v): v is number => v !== null);
    if (values.length < 2) return false;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return mean !== 0 && Math.abs(value - mean) / mean > GAP;
  }
</script>

{#snippet balanceTable(title: string, groups: GroupStats[], name: (key: string) => string)}
  <h3>{title}</h3>
  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th scope="col">{t('admin.stats.col_group')}</th>
          {#each columns as column (column.label)}<th scope="col">{column.label}</th>{/each}
        </tr>
      </thead>
      <tbody>
        {#each groups as group (group.key)}
          <tr class:small={group.pets < MIN_GROUP}>
            <th scope="row">{name(group.key)}</th>
            {#each columns as column (column.label)}
              {@const value = column.pick(group)}
              <td class:flag={deviates(column, group, groups)}>
                {value === null ? '–' : column.format(value)}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/snippet}

{#if !game.player?.isAdmin}
  <p class="card">{t('admin.forbidden')}</p>
{:else if error}
  <p class="card">{error}</p>
{:else if stats}
  <p class="muted">{t('admin.stats.generated', { date: dateTime.format(stats.generatedAt) })}</p>

  <section class="card">
    <h2>{t('admin.stats.players')}</h2>
    <dl class="tiles">
      <div>
        <dt>{t('admin.stats.players_total')}</dt>
        <dd>{stats.players.total}</dd>
      </div>
      <div>
        <dt>{t('admin.stats.players_active_today')}</dt>
        <dd>{stats.players.activeToday}</dd>
      </div>
      <div>
        <dt>{t('admin.stats.players_active_week')}</dt>
        <dd>{stats.players.activeLast7Days}</dd>
      </div>
      <div>
        <dt>{t('admin.stats.players_new_week')}</dt>
        <dd>{stats.players.newLast7Days}</dd>
      </div>
      <div>
        <dt>{t('admin.stats.players_with_pet')}</dt>
        <dd>{stats.players.withLivingPet}</dd>
      </div>
    </dl>
  </section>

  <section class="card">
    <h2>{t('admin.stats.pets')}</h2>
    <dl class="tiles">
      <div>
        <dt>{t('admin.stats.pets_hatched')}</dt>
        <dd>{stats.pets.hatched}</dd>
      </div>
      <div>
        <dt>{t('admin.stats.pets_alive')}</dt>
        <dd>{stats.pets.alive}</dd>
      </div>
      <div>
        <dt>{t('admin.stats.pets_retired')}</dt>
        <dd>{stats.pets.retired}</dd>
      </div>
      <div>
        <dt>{t('admin.stats.pets_departed')}</dt>
        <dd>{stats.pets.departed}</dd>
      </div>
    </dl>
    <div class="two">
      <div>
        <h3>{t('admin.stats.by_stage')}</h3>
        <BarList
          rows={STAGES.filter((s) => s !== 'egg').map((s) => ({
            label: stageLabel(s),
            value: stats!.pets.byStage[s],
          }))}
        />
      </div>
      <div>
        <h3>{t('admin.stats.by_form')}</h3>
        <BarList rows={FORMS.map((f) => ({ label: formLabel(f), value: stats!.pets.byForm[f] }))} />
      </div>
    </div>
    <h3>{t('admin.stats.averages')}</h3>
    <div class="averages">
      <StatBar icon="🍙" label={t('stat.satiety')} value={stats.averages.satiety} />
      <StatBar icon="😊" label={t('stat.happiness')} value={stats.averages.happiness} />
      <StatBar icon="⚡" label={t('stat.energy')} value={stats.averages.energy} />
      <StatBar icon="🛁" label={t('stat.hygiene')} value={stats.averages.hygiene} />
      <StatBar icon="❤️" label={t('stat.health')} value={stats.averages.health} />
      <StatBar icon="🎓" label={t('stat.discipline')} value={stats.averages.discipline} />
      <StatBar icon="💞" label={t('stat.bond')} value={stats.averages.bond} />
    </div>
  </section>

  <section class="card">
    <h2>{t('admin.stats.economy')}</h2>
    <dl class="tiles">
      <div>
        <dt>{t('admin.stats.coins_total')}</dt>
        <dd>{stats.economy.coinsInCirculation}</dd>
      </div>
      <div>
        <dt>{t('admin.stats.coins_average')}</dt>
        <dd>{number.format(stats.economy.averageCoins)}</dd>
      </div>
    </dl>
    {#if stats.economy.items.length > 0}
      <h3>{t('admin.stats.items')}</h3>
      <BarList
        rows={stats.economy.items.map((i) => ({
          label: itemLabel(i.itemId as ItemId),
          value: i.quantity,
        }))}
      />
    {/if}
  </section>

  <section class="card">
    <h2>{t('admin.stats.activity')}</h2>
    <div class="daily">
      <DailyBars
        label={t('admin.stats.new_players')}
        {days}
        values={stats.activity.days.map((d) => d.newPlayers)}
      />
      <DailyBars
        label={t('admin.stats.caresses')}
        {days}
        values={stats.activity.days.map((d) => d.caresses)}
      />
      <DailyBars
        label={t('admin.stats.gifts')}
        {days}
        values={stats.activity.days.map((d) => d.gifts)}
      />
      <DailyBars
        label={t('admin.stats.walks')}
        {days}
        values={stats.activity.days.map((d) => d.walks)}
      />
    </div>
    <p class="muted">{t('admin.stats.encounters')} : {stats.activity.encounters}</p>
  </section>

  <section class="card">
    <h2>{t('admin.stats.balance')}</h2>
    <p class="muted">{t('admin.stats.balance_hint')}</p>
    {#if stats.pets.hatched === 0}
      <p>{t('admin.stats.empty')}</p>
    {:else}
      {@render balanceTable(t('admin.stats.by_temperament'), stats.balance.byTemperament, (key) =>
        temperamentLabel(key as Temperament),
      )}
      {@render balanceTable(
        t('admin.stats.by_species'),
        stats.balance.bySpecies,
        (key) => SPECIES_LABELS[key as Species],
      )}
    {/if}
  </section>
{:else}
  <p class="muted">{t('common.loading')}</p>
{/if}

<style>
  section {
    margin-bottom: 1rem;
  }
  h2,
  h3 {
    margin-top: 0;
  }
  h3 {
    margin-top: 1.2rem;
    font-size: 1rem;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
    gap: 0.6rem;
    margin: 0;
  }
  .tiles div {
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
    font-size: 1.4rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .two {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: 1.5rem;
  }
  .averages {
    display: grid;
    gap: 0.4rem;
    max-width: 28rem;
  }
  .daily {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 1.2rem;
  }
  .scroll {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    padding: 0.4rem 0.6rem;
    text-align: right;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  thead th {
    color: var(--muted);
    font-weight: 600;
    font-size: 0.8rem;
  }
  th:first-child,
  td:first-child {
    text-align: left;
  }
  tr.small {
    opacity: 0.6;
  }
  td.flag {
    background: rgb(var(--accent-3-rgb) / 0.18);
    color: var(--accent-3);
    font-weight: 700;
  }
</style>
