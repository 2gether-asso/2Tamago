<script lang="ts">
  import { toasts } from '../toasts.svelte.ts';
</script>

<div class="toasts" aria-live="polite">
  {#each toasts.items as toast (toast.id)}
    <button class="toast {toast.kind}" onclick={() => toasts.dismiss(toast.id)}>{toast.text}</button
    >
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    /* Above the bottom navigation bar. */
    bottom: 5rem;
    left: 50%;
    translate: -50% 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    z-index: 10;
    width: min(26rem, calc(100vw - 2rem));
  }
  .toast {
    padding: 0.7rem 1rem;
    border-radius: var(--radius);
    background: var(--text);
    color: var(--bg);
    border: none;
    text-align: left;
    box-shadow: var(--shadow);
    animation: pop 0.25s ease-out;
  }
  .toast.error {
    background: var(--bad);
    color: white;
  }
  @keyframes pop {
    from {
      opacity: 0;
      translate: 0 10px;
    }
  }
</style>
