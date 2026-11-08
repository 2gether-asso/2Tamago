<script lang="ts">
  /** Horizontal bars, one per row, scaled to the largest value (or to `max`). */
  interface Props {
    rows: { label: string; value: number }[];
    max?: number;
  }
  let { rows, max }: Props = $props();
  let top = $derived(max ?? Math.max(1, ...rows.map((row) => row.value)));
</script>

<ul class="bars">
  {#each rows as row (row.label)}
    <li>
      <span class="label">{row.label}</span>
      <span class="track" aria-hidden="true">
        <span class="fill" style:width="{Math.min(100, (row.value / top) * 100)}%"></span>
      </span>
      <span class="value">{row.value}</span>
    </li>
  {/each}
</ul>

<style>
  .bars {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }
  li {
    display: grid;
    grid-template-columns: 7rem 1fr 3rem;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.9rem;
  }
  .track {
    height: 0.7rem;
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--accent), var(--accent-3));
  }
  .value {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
</style>
