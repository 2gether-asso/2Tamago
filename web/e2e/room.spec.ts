import { expect, test, type Browser } from '@playwright/test';
import { apiRequest } from './helpers.ts';

async function signIn(browser: Browser, name: string, admin = false) {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await page.getByPlaceholder('Pseudo').fill(name);
  await page.getByRole('button', { name: 'Entrer' }).click();
  // The admin may have a companion already (other tests share the API): wait for the menu instead.
  if (admin) await expect(page.getByRole('link', { name: /Admin/ })).toBeVisible();
  else await expect(page.getByRole('heading', { name: 'Adopter un compagnon' })).toBeVisible();
  return page;
}

test('a player decorates the room, and visitors see it', async ({ browser }) => {
  // The decoration costs more than the starting purse: an admin hands out a code.
  const code = `ROOM-${Date.now()}`;
  const root = await signIn(browser, 'Root', true);
  const made = await apiRequest(root, 'POST', '/api/admin/codes', {
    code,
    coins: 500,
    maxUses: 5,
  });
  expect(made.status()).toBe(201);

  const alice = await signIn(browser, 'Decora');
  await alice.getByPlaceholder('Pompon').fill('Coussin');
  await alice.getByRole('button', { name: /Recevoir mon œuf/ }).click();
  await expect(alice.getByRole('heading', { name: 'Coussin' })).toBeVisible();
  expect((await apiRequest(alice, 'POST', '/api/codes/redeem', { code })).status()).toBe(200);
  for (const item of ['wall_stars', 'floor_wood', 'plant', 'lamp']) {
    const bought = await apiRequest(alice, 'POST', '/api/shop/buy', { item, quantity: 1 });
    expect(bought.status()).toBe(200);
  }

  // The shop sells it, and the editor offers what is owned.
  await alice.getByRole('link', { name: /Boutique/ }).click();
  await expect(alice.getByRole('heading', { name: 'Décoration de la chambre' })).toBeVisible();
  await alice.getByRole('link', { name: /Maison/ }).click();
  await alice.getByRole('link', { name: /Décorer la chambre/ }).click();
  await expect(alice.getByRole('heading', { name: 'Ma chambre', level: 1 })).toBeVisible();
  await alice.getByRole('button', { name: /Papier peint étoilé/ }).click();
  await alice.getByRole('button', { name: /Parquet/ }).click();
  await alice.getByRole('button', { name: /Plante verte/ }).click();
  await alice.getByRole('button', { name: /Lampe/ }).click();
  await expect(alice.getByRole('heading', { name: 'Objets (2/3)' })).toBeVisible();
  await alice.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(alice.getByText('Chambre enregistrée.')).toBeVisible();

  // Back home, the room is there.
  await alice.getByRole('link', { name: /Maison/ }).click();
  await expect(alice.locator('.wall[data-decor="wall_stars"]')).toHaveCount(1);
  await expect(alice.locator('.floor[data-decor="floor_wood"]')).toHaveCount(1);
  await expect(alice.locator('.prop[data-prop="plant"]')).toHaveCount(1);
  await expect(alice.locator('.prop[data-prop="lamp"]')).toHaveCount(1);

  // A visitor sees the same room.
  const bob = await signIn(browser, 'Visiteur');
  await bob.getByRole('link', { name: /Village/ }).click();
  await bob.getByRole('link', { name: /Coussin/ }).click();
  await expect(bob.locator('.wall[data-decor="wall_stars"]')).toHaveCount(1);
  await expect(bob.locator('.prop[data-prop="lamp"]')).toHaveCount(1);
});
