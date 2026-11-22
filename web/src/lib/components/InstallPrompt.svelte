<script lang="ts">
  import { game } from '#lib/game.svelte.ts';
  import { t } from '#lib/i18n/index.svelte.ts';
  import { push } from '#lib/push.svelte.ts';
  import { toasts } from '#lib/toasts.svelte.ts';

  /**
   * Invites the player to keep their companion on their phone: install the app (the browser's own
   * prompt on Android and desktop, the steps on iOS), then turn on the notifications. Dismissing it
   * hides it for two weeks, in this browser only.
   */
  interface InstallEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  }

  const DISMISS_KEY = 'tamago_install_dismissed';
  const DISMISS_MS = 14 * 24 * 3_600_000;

  let installEvent = $state<InstallEvent | null>(null);
  let standalone = $state(false);
  let ios = $state(false);
  let dismissed = $state(true);

  function readDismissed(): boolean {
    try {
      return Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < DISMISS_MS;
    } catch {
      return false;
    }
  }

  function dismiss() {
    dismissed = true;
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Storage blocked: it stays hidden until the next visit.
    }
  }

  $effect(() => {
    standalone =
      matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    // iPhone and iPad (which may claim to be a Mac, but has a touch screen).
    ios =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    dismissed = readDismissed();
    void push.refresh().catch(() => {});

    const onPrompt = (event: Event) => {
      // Shown by our own button, at a better moment than the browser's mini-bar.
      event.preventDefault();
      installEvent = event as InstallEvent;
    };
    const onInstalled = () => {
      installEvent = null;
      standalone = true;
    };
    addEventListener('beforeinstallprompt', onPrompt);
    addEventListener('appinstalled', onInstalled);
    return () => {
      removeEventListener('beforeinstallprompt', onPrompt);
      removeEventListener('appinstalled', onInstalled);
    };
  });

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    installEvent = null;
    if (outcome === 'dismissed') dismiss();
  }

  async function enableNotifications() {
    try {
      if (await push.enable()) toasts.push(t('push.enabled_toast'));
    } catch (error) {
      toasts.push(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  let name = $derived(game.pet?.name ?? '');
  /** What to offer: installing first, then the notifications once it is installed. */
  let offer = $derived.by(() => {
    if (dismissed || !game.pet || game.pet.status !== 'alive') return null;
    if (!standalone && installEvent) return 'install';
    if (!standalone && ios) return 'ios';
    if (standalone && push.status === 'off') return 'notify';
    return null;
  });
</script>

{#if offer}
  <aside class="card install">
    <span class="icon" aria-hidden="true">{offer === 'notify' ? '🔔' : '📲'}</span>
    <div class="text">
      {#if offer === 'notify'}
        <strong>{t('push.install_notify_title', { name })}</strong>
        <p class="muted">{t('push.install_notify_hint', { name })}</p>
      {:else}
        <strong>{t('push.install_title', { name })}</strong>
        <p class="muted">
          {offer === 'ios' ? t('push.install_ios_hint') : t('push.install_hint', { name })}
        </p>
      {/if}
    </div>
    <div class="buttons">
      {#if offer === 'install'}
        <button class="primary" onclick={install}>{t('push.install_button')}</button>
      {:else if offer === 'notify'}
        <button class="primary" disabled={push.busy} onclick={enableNotifications}>
          {t('push.enable')}
        </button>
      {/if}
      <button class="link" onclick={dismiss}>{t('push.install_later')}</button>
    </div>
  </aside>
{/if}

<style>
  .install {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem 1rem;
    margin-bottom: 1rem;
    border: 2px solid var(--accent);
  }
  .icon {
    font-size: 2rem;
  }
  .text {
    flex: 1;
    min-width: 12rem;
  }
  .text p {
    margin: 0.2rem 0 0;
  }
  .buttons {
    display: flex;
    gap: 0.6rem;
    align-items: center;
  }
</style>
