import { expect, test } from '@playwright/test';

test('a player picks their own name, then goes back to the Discord one', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('Pseudo').fill('Nomade');
  await page.getByRole('button', { name: 'Entrer' }).click();
  await expect(page.getByRole('heading', { name: 'Adopter un compagnon' })).toBeVisible();

  await page.getByRole('link', { name: 'Compte' }).click();
  // Nothing to go back to while the name is the Discord one.
  await expect(page.getByRole('button', { name: /Revenir au nom Discord/ })).toHaveCount(0);

  await page.getByRole('textbox', { name: 'Nom affiché', exact: true }).fill('Ada Nomade');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Nom enregistré.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ada Nomade' })).toBeVisible();

  await page.getByRole('button', { name: 'Revenir au nom Discord (Nomade)' }).click();
  await expect(page.getByText('Tu as retrouvé ton nom Discord.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Nom affiché', exact: true })).toHaveValue(
    'Nomade',
  );
  await expect(page.getByRole('link', { name: 'Nomade' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Revenir au nom Discord/ })).toHaveCount(0);
});
