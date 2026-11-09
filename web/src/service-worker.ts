/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import type { PushPayload } from '@2tamago/core/contracts';
import { translate, type MessageKey } from '#lib/i18n/translate.ts';

/**
 * Only there to show the push notifications (no offline cache). The API sends a code and the
 * pet's name; the text is written here, from the same messages as the rest of the app.
 */
const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', () => void sw.skipWaiting());
sw.addEventListener('activate', (event) => event.waitUntil(sw.clients.claim()));

function readPayload(event: PushEvent): PushPayload | null {
  try {
    const data = event.data?.json() as Partial<PushPayload> | undefined;
    if (!data?.kind || (data.locale !== 'fr' && data.locale !== 'en')) return null;
    return {
      kind: data.kind,
      petName: data.petName ?? '',
      playerName: data.playerName ?? '',
      locale: data.locale,
    };
  } catch {
    return null;
  }
}

sw.addEventListener('push', (event) => {
  const payload = readPayload(event);
  if (!payload) return;
  const body = translate(payload.locale, `push.msg.${payload.kind}` as MessageKey, {
    petName: payload.petName,
    playerName: payload.playerName ?? '',
  });
  event.waitUntil(
    sw.registration.showNotification('2Tamago', {
      body,
      lang: payload.locale,
      // A newer alert of the same kind replaces the one still on screen.
      tag: payload.kind,
      data: { url: payload.kind === 'daycare_invite' ? '/village' : '/' },
    }),
  );
});

sw.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === sw.location.origin);
      const url = (event.notification.data as { url?: string } | null)?.url ?? '/';
      if (open) {
        await open.focus();
        // Only a page that is already open is told where to go: opening one starts there.
        if (url !== '/' && 'navigate' in open) await (open as WindowClient).navigate(url);
      } else {
        await sw.clients.openWindow(url);
      }
    })(),
  );
});
