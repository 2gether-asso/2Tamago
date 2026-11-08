import { expect, test } from '@playwright/test';

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

test('coming back from Discord, the token in the URL fragment signs the player in without a cookie', async ({
  page,
}) => {
  const { token } = await (
    await page.request.post('/api/auth/dev-login', { data: { name: 'Fragment' } })
  ).json();
  await page.context().clearCookies();
  await page.goto(`/login#token=${token}`);
  await expect(page.getByRole('link', { name: /Village/ })).toBeVisible();
  expect(page.url()).not.toContain('token');
});
