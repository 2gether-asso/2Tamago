import { api } from './api.ts';
import { clientConfig } from './client-config.svelte.ts';
import { i18n } from './i18n/index.svelte.ts';

export type PushStatus =
  | 'loading'
  /** No service worker or push in this browser. */
  | 'unsupported'
  /** The server has no VAPID keys. */
  | 'unavailable'
  | 'denied'
  | 'off'
  | 'on';

/** The key as the push manager wants it (the server gives it in URL-safe base64). */
function applicationServerKey(key: string): Uint8Array<ArrayBuffer> {
  const base64 = key
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(key.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

const supported = () =>
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  typeof window !== 'undefined' &&
  'PushManager' in window &&
  'Notification' in window;

/** Notifications of this browser: whether they are on, and turning them on and off. */
class PushStore {
  status = $state<PushStatus>('loading');
  busy = $state(false);

  /** Works out the status, and tells the server about this browser if it is subscribed. */
  async refresh(): Promise<void> {
    await clientConfig.load();
    if (!supported()) {
      this.status = 'unsupported';
      return;
    }
    if (!clientConfig.value?.pushPublicKey) {
      this.status = 'unavailable';
      return;
    }
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      // Also covers a browser shared by two players: the server moves it to the current one.
      await this.#register(subscription).catch(() => {});
      this.status = 'on';
    } else {
      this.status = Notification.permission === 'denied' ? 'denied' : 'off';
    }
  }

  /** Asks permission, subscribes this browser and registers it. Throws on an API error. */
  async enable(): Promise<boolean> {
    const key = clientConfig.value?.pushPublicKey;
    if (!key || !supported()) return false;
    this.busy = true;
    try {
      if ((await Notification.requestPermission()) !== 'granted') {
        this.status = 'denied';
        return false;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(key),
        }));
      await this.#register(subscription);
      this.status = 'on';
      return true;
    } finally {
      this.busy = false;
    }
  }

  async disable(): Promise<void> {
    this.busy = true;
    try {
      const subscription = await this.#current();
      if (subscription) {
        await api.pushUnsubscribe(subscription.endpoint);
        await subscription.unsubscribe();
      }
      this.status = 'off';
    } finally {
      this.busy = false;
    }
  }

  /** Tells the server the language changed (the service worker writes in it). */
  async syncLocale(): Promise<void> {
    if (this.status !== 'on') return;
    const subscription = await this.#current();
    if (subscription) await this.#register(subscription).catch(() => {});
  }

  /** On sign-out: this browser stops receiving this player's alerts, but stays subscribed. */
  async forget(): Promise<void> {
    const subscription = await this.#current().catch(() => null);
    if (subscription) await api.pushUnsubscribe(subscription.endpoint).catch(() => {});
    this.status = 'loading';
  }

  async #current(): Promise<PushSubscription | null> {
    if (!supported()) return null;
    const registration = await navigator.serviceWorker.getRegistration();
    return (await registration?.pushManager.getSubscription()) ?? null;
  }

  async #register(subscription: PushSubscription): Promise<void> {
    const { endpoint, keys } = subscription.toJSON();
    if (!endpoint || !keys?.p256dh || !keys.auth) return;
    await api.pushSubscribe({
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
      locale: i18n.locale,
    });
  }
}

export const push = new PushStore();
