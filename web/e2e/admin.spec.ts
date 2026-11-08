import { expect, test } from '@playwright/test';
import { apiRequest, forgetSession } from './helpers.ts';

async function signIn(page: import('@playwright/test').Page, name: string) {
  await page.goto('/login');
  await page.getByPlaceholder('Pseudo').fill(name);
  await page.getByRole('button', { name: 'Entrer' }).click();
  await expect(page.getByRole('heading', { name: 'Adopter un compagnon' })).toBeVisible();
}

test('only admins see the admin screen and can save game settings', async ({ page }) => {
  await signIn(page, 'Simple');
  await expect(page.getByRole('link', { name: /Admin/ })).toHaveCount(0);
  await page.goto('/admin');
  await expect(page.getByText('réservée aux administrateurs')).toBeVisible();

  await forgetSession(page);
  await page.goto('/login');
  await signIn(page, 'Root');
  await page.getByRole('link', { name: /Admin/ }).click();
  const editor = page.getByLabel('Modifications (JSON)');
  await editor.fill('{ "caressCooldownSeconds": 3 }');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Réglages enregistrés')).toBeVisible();

  const rules = await apiRequest(page, 'GET', '/api/game/rules');
  expect((await rules.json()).caressCooldownSeconds).toBe(3);

  await editor.fill('{ "timeScale": 60 }');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.error')).toBeVisible();
});
