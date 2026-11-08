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
