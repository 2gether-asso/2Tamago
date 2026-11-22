<script lang="ts">
  import { FORMS, ILLNESSES, NEEDS, WISH_IDS, type Form } from '@2tamago/core';
  import type {
    AdminBalance,
    BalanceInsight,
    BalanceLevel,
    CareBucket,
    MissionBalance,
  } from '@2tamago/core/contracts';
  import BarList from '#lib/components/BarList.svelte';
  import DailyBars from '#lib/components/DailyBars.svelte';
  import { api } from '#lib/api.ts';
  import { game } from '#lib/game.svelte.ts';
  import { intlTag, t } from '#lib/i18n/index.svelte.ts';
  import { formLabel, missionLabel, WISH_ICON } from '#lib/texts.ts';

  /**
   * The admin's first screen: is the game well balanced? One verdict per question, each with its
   * target and the setting to tune, then the figures behind the verdicts.
   */
  let report = $state.raw<AdminBalance | null>(null);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!game.player?.isAdmin) return;
    api
      .adminBalance()
      .then((r) => (report = r))
      .catch((e: Error) => (error = e.message));
  });

  let percent = $derived(
    new Intl.NumberFormat(intlTag(), { style: 'percent', maximumFractionDigits: 0 }),
  );
  let decimal = $derived(new Intl.NumberFormat(intlTag(), { maximumFractionDigits: 2 }));
  let dateTime = $derived(
    new Intl.DateTimeFormat(intlTag(), { dateStyle: 'medium', timeStyle: 'short' }),
  );

  const LEVEL_ICON: Record<BalanceLevel, string> = {
    good: '✅',
    watch: '⚠️',
    bad: '🔴',
    unknown: '⏳',
  };
  /** Rates per pet and game day read as decimals; the other insights are shares. */
  const RATES = new Set(['illness_rate', 'mistake_rate']);
  const format = (insight: BalanceInsight, value: number) =>
    RATES.has(insight.id) ? decimal.format(value) : percent.format(value);

  function target(insight: BalanceInsight): string {
    const value = format(insight, insight.good);
    return insight.higherIsBetter
      ? t('admin.balance.target_min', { value })
      : t('admin.balance.target_max', { value });
  }

  let days = $derived(report?.days.map((d) => d.day) ?? []);
  let worrying = $derived(
    report?.insights.filter((i) => i.level === 'bad' || i.level === 'watch').length ?? 0,
  );

  /** Mean completion of the missions that were offered, to flag the ones far below it. */
  let missionMean = $derived.by(() => {
    const rates = (report?.missions ?? []).filter((m) => m.offered >= 5 && m.rate !== null);
    return rates.length === 0 ? null : rates.reduce((s, m) => s + m.rate!, 0) / rates.length;
  });
  const skipped = (mission: MissionBalance) =>
    missionMean !== null && mission.offered >= 5 && (mission.rate ?? 0) < missionMean / 2;

  const share = (bucket: CareBucket, form: Form) =>
    bucket.pets === 0 ? '–' : percent.format(bucket.byForm[form] / bucket.pets);
  let grantRate = $derived(
    report && report.wishes.granted + report.wishes.faded > 0
      ? report.wishes.granted / (report.wishes.granted + report.wishes.faded)
      : null,
  );
</script>

{#if !game.player?.isAdmin}
  <p class="card">{t('admin.forbidden')}</p>
{:else if error}
  <p class="card">{error}</p>
{:else if report}
  <h2>{t('admin.balance.title')}</h2>
  <p class="muted">
    {t('admin.balance.intro', { days: report.windowDays })}
    {t('admin.balance.generated', { date: dateTime.format(report.generatedAt) })}
  </p>

  <dl class="tiles">
    <div>
      <dt>{t('admin.balance.living')}</dt>
      <dd>{report.living}</dd>
    </div>
    <div>
      <dt>{t('admin.balance.sick_now')}</dt>
      <dd>{report.sickNow}</dd>
    </div>
    <div>
      <dt>{t('admin.balance.active_today')}</dt>
      <dd>{report.days.at(-1)?.activePlayers ?? 0}</dd>
    </div>
    <div>
      <dt>{t('admin.balance.worrying')}</dt>
      <dd class:alert={worrying > 0}>{worrying}</dd>
    </div>
  </dl>

  <section class="insights" aria-label={t('admin.balance.verdicts')}>
    {#each report.insights as insight (insight.id)}
      <article class="card insight {insight.level}">
        <header>
          <span class="level" aria-hidden="true">{LEVEL_ICON[insight.level]}</span>
          <h3>{t(`admin.balance.q.${insight.id}`)}</h3>
        </header>
        <p class="value">
          {#if insight.value === null}
            –
          {:else}
            {format(insight, insight.value)}
          {/if}
          <span class="sr-only">{t(`admin.balance.level.${insight.level}`)}</span>
        </p>
        <p class="muted small">
          {target(insight)} · {t(`admin.balance.sample.${insight.id}`, { count: insight.sample })}
        </p>
        {#if insight.level === 'unknown'}
          <p class="small">{t('admin.balance.not_enough')}</p>
        {:else if insight.level !== 'good'}
          <p class="small lever">💡 {t(`admin.balance.lever.${insight.id}`)}</p>
        {/if}
      </article>
    {/each}
  </section>

  <section class="card">
    <h3>{t('admin.balance.daily')}</h3>
    <div class="daily">
      <DailyBars
        label={t('admin.balance.series.players')}
        {days}
        values={report.days.map((d) => d.activePlayers)}
      />
      <DailyBars
        label={t('admin.balance.series.illnesses')}
        {days}
        values={report.days.map((d) => d.illnesses)}
      />
      <DailyBars
        label={t('admin.balance.series.mistakes')}
        {days}
        values={report.days.map((d) => d.careMistakes)}
      />
      <DailyBars
        label={t('admin.balance.series.wishes')}
        {days}
        values={report.days.map((d) => d.wishesGranted)}
      />
      <DailyBars
        label={t('admin.balance.series.missions')}
        {days}
        values={report.days.map((d) => d.missionsAllDone)}
      />
    </div>
  </section>

  <section class="card">
    <h3>{t('admin.balance.forms_title')}</h3>
    <p class="muted small">{t('admin.balance.forms_hint')}</p>
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">{t('admin.balance.col_care')}</th>
            <th scope="col">{t('admin.balance.col_pets')}</th>
            {#each FORMS as form (form)}<th scope="col">{formLabel(form)}</th>{/each}
          </tr>
        </thead>
        <tbody>
          {#each report.careBuckets as bucket (bucket.key)}
            <tr>
              <th scope="row">{t(`admin.balance.care.${bucket.key}`)}</th>
              <td>{bucket.pets}</td>
              {#each FORMS as form (form)}
                <td
                  class:flag={bucket.key === 'good' &&
                    form === 'rascal' &&
                    bucket.pets > 0 &&
                    bucket.byForm.rascal / bucket.pets > 0.15}
                >
                  {share(bucket, form)}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <div class="two">
    <section class="card">
      <h3>{t('admin.balance.mistakes_title')}</h3>
      <BarList
        rows={NEEDS.map((need) => ({
          label: t(`admin.balance.need.${need}`),
          value: report!.mistakesByNeed[need],
        }))}
      />
    </section>
    <section class="card">
      <h3>{t('admin.balance.illnesses_title')}</h3>
      <BarList
        rows={ILLNESSES.map((illness) => ({
          label: t(`illness.${illness}`),
          value: report!.illnessesByKind[illness],
        }))}
      />
    </section>
  </div>

  <div class="two">
    <section class="card">
      <h3>{t('admin.balance.wishes_title')}</h3>
      <p class="small">
        {t('admin.balance.wishes_total', {
          granted: report.wishes.granted,
          faded: report.wishes.faded,
          rate: grantRate === null ? '–' : percent.format(grantRate),
        })}
      </p>
      <BarList
        rows={WISH_IDS.map((id) => ({
          label: `${WISH_ICON[id]} ${t(`admin.balance.wish.${id}`)}`,
          value: report!.wishes.grantedByWish[id],
        }))}
      />
    </section>
    <section class="card">
      <h3>{t('admin.balance.missions_title')}</h3>
      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">{t('admin.balance.col_mission')}</th>
              <th scope="col">{t('admin.balance.col_offered')}</th>
              <th scope="col">{t('admin.balance.col_done')}</th>
              <th scope="col">{t('admin.balance.col_rate')}</th>
            </tr>
          </thead>
          <tbody>
            {#each report.missions.filter((m) => m.offered > 0) as mission (mission.id)}
              <tr>
                <th scope="row">{missionLabel(mission.id)}</th>
                <td>{mission.offered}</td>
                <td>{mission.done}</td>
                <td class:flag={skipped(mission)}>
                  {mission.rate === null ? '–' : percent.format(mission.rate)}
                </td>
              </tr>
            {:else}
              <tr><td colspan="4">{t('admin.balance.no_missions')}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="muted small">{t('admin.balance.missions_hint')}</p>
    </section>
  </div>
{:else}
  <p class="muted">{t('common.loading')}</p>
{/if}

<style>
  h2 {
    margin: 0 0 0.3rem;
  }
  h3 {
    margin: 0 0 0.6rem;
    font-size: 1rem;
  }
  section,
  .tiles {
    margin-bottom: 1rem;
  }
  .small {
    font-size: 0.85rem;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
    gap: 0.6rem;
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
  dd.alert {
    color: var(--bad);
  }
  .insights {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    gap: 0.8rem;
  }
  .insight {
    margin: 0;
    border-left: 5px solid var(--border);
  }
  .insight.good {
    border-left-color: var(--good);
  }
  .insight.watch {
    border-left-color: var(--warn);
  }
  .insight.bad {
    border-left-color: var(--bad);
  }
  .insight header {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
  }
  .insight h3 {
    margin: 0;
    font-size: 0.95rem;
  }
  .insight p {
    margin: 0.3rem 0 0;
  }
  .value {
    font-size: 1.6rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .lever {
    padding: 0.4rem 0.6rem;
    border-radius: var(--radius-md);
    background: var(--surface-2);
  }
  .daily {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
    gap: 1.2rem;
  }
  .two {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
    gap: 0 1rem;
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
  tbody th {
    white-space: normal;
  }
  td.flag {
    background: rgb(var(--accent-3-rgb) / 0.18);
    color: var(--accent-3);
    font-weight: 700;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
</style>
