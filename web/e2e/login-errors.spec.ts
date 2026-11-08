import { expect, test } from '@playwright/test';
import { forgetSession } from './helpers.ts';

test('the sign-in page explains why a Discord sign-in failed', async ({ page }) => {
  for (const [code, message] of [
    ['not_member', 'Il faut être membre du Discord de 2GETHER pour jouer.'],
    ['denied', 'Connexion annulée.'],
    ['discord', 'Discord ne répond pas pour le moment'],
    ['state', 'La connexion a expiré'],
  ]) {
    await page.goto(`/login?error=${code}`);
    await expect(page.getByText(message)).toBeVisible();
  }
  // An unknown code shows nothing alarming.
  await page.goto('/login?error=whatever');
  await expect(page.locator('.error')).toHaveCount(0);
});

async function signIn(page: import('@playwright/test').Page, name: string) {
  await page.goto('/login');
  await page.getByPlaceholder('Pseudo').fill(name);
  await page.getByRole('button', { name: 'Entrer' }).click();
  await expect(page.getByRole('heading', { name: 'Adopter un compagnon' })).toBeVisible();
}

test('the session needs no cookie, and survives a reload by renewing its token', async ({
  page,
  context,
}) => {
  const requests: { cookie?: string; auth?: string; credentials?: string }[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/me')) {
      const headers = request.headers();
      requests.push({ cookie: headers.cookie, auth: headers.authorization });
    }
  });
  await signIn(page, 'Reload');
  expect(await context.cookies()).toEqual([]);

  // A reload loses the access token (memory only): the app renews it from the refresh token
  // and the key kept in the browser, and the player does not notice.
  const refreshed = page.waitForResponse((r) => r.url().endsWith('/api/auth/refresh'));
  await page.reload();
  expect((await refreshed).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Adopter un compagnon' })).toBeVisible();
  expect(await context.cookies()).toEqual([]);
  expect(requests.every((r) => !r.cookie && r.auth?.startsWith('Bearer '))).toBe(true);
});

test('signing out ends the session for good', async ({ page }) => {
  await signIn(page, 'Leaver');
  const loggedOut = page.waitForResponse((r) => r.url().endsWith('/api/auth/logout'));
  await page.getByRole('button', { name: 'Déconnexion' }).click();
  expect((await loggedOut).status()).toBe(204);
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
});

test('a browser that forgot its key is back at the sign-in page', async ({ page }) => {
  await signIn(page, 'Forgetful');
  await forgetSession(page);
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
});

test('a session the API ended explains why', async ({ page }) => {
  await signIn(page, 'Ended');
  // The API refuses the next renewal (as it does after a network change or a week of absence).
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ statusCode: 401, code: 'session_roaming' }),
    }),
  );
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText('Tu as changé de réseau')).toBeVisible();
});
