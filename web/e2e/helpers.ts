import type { Page } from '@playwright/test';

/**
 * Calls the API as the player signed in on this page. The access token is only in the page's
 * memory (no cookie), so the app hands it over through a hook that exists in development builds.
 */
export async function apiRequest(page: Page, method: string, path: string, data?: unknown) {
  const token = await page.evaluate(() =>
    (
      window as unknown as { __tamago: { accessToken(): Promise<string | null> } }
    ).__tamago.accessToken(),
  );
  return page.request.fetch(path, {
    method,
    data,
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** Wipes what the browser keeps of the session (refresh token and key), as if it was a new browser. */
export async function forgetSession(page: Page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const request = indexedDB.deleteDatabase('tamago-auth');
        request.onsuccess = request.onerror = request.onblocked = () => resolve(null);
      }),
  );
}
