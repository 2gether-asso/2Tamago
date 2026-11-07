<script lang="ts">
  interface Props {
    label: string;
    icon: string;
    value: number;
  }
  let { label, icon, value }: Props = $props();
  let level = $derived(value < 25 ? 'low' : value < 50 ? 'mid' : 'high');
</script>

<div class="stat" title="{label} : {Math.round(value)} / 100">
  <span class="icon" aria-hidden="true">{icon}</span>
  <span class="label">{label}</span>
  <div
    class="track"
    role="meter"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(value)}
  >
    <div class="fill {level}" style:width="{value}%"></div>
  </div>
</div>

<style>
  .stat {
    display: grid;
    grid-template-columns: 1.5rem 6.5rem 1fr;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.9rem;
  }
  .track {
    height: 0.7rem;
    border-radius: 999px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    border-radius: inherit;
    transition: width 0.6s ease;
  }
  .high {
    background: var(--good);
  }
  .mid {
    background: var(--warn);
  }
  .low {
    background: var(--bad);
  }
</style>
