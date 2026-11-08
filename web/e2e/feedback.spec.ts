import { expect, test } from '@playwright/test';

test('a player sends feedback from the modal', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('Pseudo').fill('Avis');
  await page.getByRole('button', { name: 'Entrer' }).click();
  await expect(page.getByRole('heading', { name: 'Adopter un compagnon' })).toBeVisible();

  await page.getByRole('button', { name: 'Donner un avis' }).click();
  const dialog = page.getByRole('dialog', { name: 'Donner un avis' });
  await expect(dialog).toBeVisible();

  const send = dialog.getByRole('button', { name: 'Envoyer' });
  await expect(send).toBeDisabled();
  await dialog.getByText('Bug').click();
  await dialog.getByRole('textbox').fill('Le bouton ne fait rien sur le village');
  await expect(send).toBeEnabled();

  const request = page.waitForRequest((r) => r.url().endsWith('/api/feedback'));
  await send.click();
  expect((await request).postDataJSON()).toEqual({
    type: 'bug',
    message: 'Le bouton ne fait rien sur le village',
    page: '/',
  });
  await expect(page.getByText('Merci pour ton retour')).toBeVisible();
  await expect(dialog).toBeHidden();
});
