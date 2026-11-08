<script lang="ts">
  /** A bar per day for one metric, oldest first. The tooltip of a bar gives its day and value. */
  interface Props {
    label: string;
    days: string[];
    values: number[];
  }
  let { label, days, values }: Props = $props();
  let top = $derived(Math.max(1, ...values));
  let total = $derived(values.reduce((sum, value) => sum + value, 0));
</script>

<figure>
  <figcaption>
    <span>{label}</span>
    <strong>{total}</strong>
  </figcaption>
  <div class="chart" role="img" aria-label="{label}: {total}">
    {#each values as value, i (days[i])}
      <span
        class="bar"
        class:zero={value === 0}
        style:height="{Math.max(4, (value / top) * 100)}%"
        title="{days[i]} : {value}"
      ></span>
    {/each}
  </div>
</figure>

<style>
  figure {
    margin: 0;
  }
  figcaption {
    display: flex;
    justify-content: space-between;
    font-size: 0.9rem;
    margin-bottom: 0.3rem;
  }
  .chart {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 3.5rem;
  }
  .bar {
    flex: 1;
    border-radius: 3px 3px 0 0;
    background: linear-gradient(var(--accent), var(--accent-3));
  }
  .bar.zero {
    background: var(--surface-2);
  }
</style>
