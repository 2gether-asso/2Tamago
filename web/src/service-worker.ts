/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { version } from '$app/env';
import { assets, immutable } from '$app/manifest';
import type { PushPayload } from '@2tamago/core/contracts';
import { translate, type MessageKey } from '#lib/i18n/translate.ts';

/**
 * Shows the push notifications, and keeps the app shell (scripts, styles, icons, the fallback
 * page) in a cache so that the installed app opens at once, even on a weak connection. The API is
 * never cached: the companion always comes fresh from the server. The API sends a code and the
 * pet's name; the text is written here, from the same messages as the rest of the app.
 */
const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `tamago-${version}`;
/** The single-page app shell: every route renders from it (see the static adapter's fallback). */
const SHELL = '404.html';
const url = (path: string) => new URL(path, sw.registration.scope).href;
const PRECACHE = [...immutable, ...assets]
  // Browsers that run service workers take the .woff2 fonts: the old .woff ones would be dead weight.
  .filter(({ path }) => !path.endsWith('.woff'))
  .map(({ path }) => url(path))
  .concat(url(SHELL));
const IMMUTABLE = new Set(immutable.map(({ path }) => url(path)));

sw.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // One by one: a file missing from the deployment must not stop the update.
      await Promise.all(PRECACHE.map((file) => cache.add(file).catch(() => {})));
      await sw.skipWaiting();
    })(),
  );
});

sw.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await sw.clients.claim();
    })(),
  ),
);

sw.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const target = new URL(request.url);
  // Only our own files; the API (same origin or not) always goes to the network.
  if (target.origin !== sw.location.origin || target.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    // Pages: the network first (a new version shows at once), the cached shell when offline.
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(url(SHELL))) ?? Response.error()),
    );
    return;
  }
  if (IMMUTABLE.has(request.url) || PRECACHE.includes(request.url)) {
    // Hashed or static files: the cache, falling back to the network.
    event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
  }
});

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
  // A dot on the app icon until the app is opened (it then shows the real count).
  const badge = sw.navigator as WorkerNavigator & { setAppBadge?: () => Promise<void> };
  if (payload.kind !== 'test') void badge.setAppBadge?.().catch(() => {});
  event.waitUntil(
    sw.registration.showNotification('2Tamago', {
      body,
      icon: url('icons/icon-192.png'),
      badge: url('icons/favicon-32.png'),
      lang: payload.locale,
      // A newer alert of the same kind replaces the one still on screen.
      tag: payload.kind,
      data: {
        url: payload.kind === 'daycare_invite' || payload.kind === 'trade_offer' ? '/village' : '/',
      },
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
