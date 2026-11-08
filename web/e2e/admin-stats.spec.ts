import { expect, test, type Browser } from '@playwright/test';

async function signIn(browser: Browser, name: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await page.getByPlaceholder('Pseudo').fill(name);
  await page.getByRole('button', { name: 'Entrer' }).click();
  await expect(page.getByRole('heading', { name: 'Adopter un compagnon' })).toBeVisible();
  return page;
}

test('admins follow the game from the statistics tab, other players cannot', async ({
  browser,
}) => {
  // A companion in the game, owned by someone else: Root's account is shared with other tests.
  const player = await signIn(browser, 'Compteur');
  await player.getByPlaceholder('Pompon').fill('Chiffre');
  await player.getByRole('button', { name: /Recevoir mon œuf/ }).click();
  await expect(player.getByRole('heading', { name: 'Chiffre' })).toBeVisible();
  // Eggs are left out of the balance figures: wait for it to hatch.
  await expect(player.getByRole('button', { name: /Nourrir/ })).toBeEnabled({ timeout: 20_000 });

  const root = await signIn(browser, 'Root');
  await root.getByRole('link', { name: /Admin/ }).click();
  await root.getByRole('link', { name: 'Statistiques' }).click();
  await expect(root.getByRole('heading', { name: 'Joueurs', level: 2 })).toBeVisible();
  await expect(root.getByRole('heading', { name: 'Équilibrage', level: 2 })).toBeVisible();
  await expect(root.getByText('Inscrits')).toBeVisible();
  await expect(root.getByRole('heading', { name: 'Par tempérament' })).toBeVisible();
  await expect(root.getByRole('heading', { name: /Par espèce/ })).toBeVisible();

  await player.goto('/admin/stats');
  await expect(player.getByText('réservée aux administrateurs')).toBeVisible();
  await expect(player.getByRole('link', { name: 'Statistiques' })).toHaveCount(0);
});
