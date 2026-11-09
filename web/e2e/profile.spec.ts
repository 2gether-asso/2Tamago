import { expect, test, type Browser } from '@playwright/test';

async function signIn(browser: Browser, name: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await page.getByPlaceholder('Pseudo').fill(name);
  await page.getByRole('button', { name: 'Entrer' }).click();
  await expect(page.getByRole('heading', { name: 'Adopter un compagnon' })).toBeVisible();
  return page;
}

test('players have a profile with a player card and a companion card', async ({ browser }) => {
  const alice = await signIn(browser, 'Profilia');
  await alice.getByPlaceholder('Pompon').fill('Sesame');
  await alice.getByRole('button', { name: /Recevoir mon œuf/ }).click();
  await expect(alice.getByRole('heading', { name: 'Sesame' })).toBeVisible();

  // Own profile, from the name in the header.
  await alice.getByRole('link', { name: 'Profilia' }).click();
  await expect(alice.getByRole('heading', { name: 'Profilia', level: 1 })).toBeVisible();
  await expect(alice.getByText('C’est toi')).toBeVisible();
  await expect(alice.getByText('Compagnons élevés')).toBeVisible();
  await expect(alice.getByRole('heading', { name: 'Sesame', level: 2, exact: true })).toBeVisible();

  // Another player finds it from the pet's visit page, and can go and visit the companion.
  const bob = await signIn(browser, 'Curieux');
  await bob.getByRole('link', { name: /Village/ }).click();
  await bob.getByRole('link', { name: /Sesame/ }).click();
  await bob.getByRole('link', { name: 'Voir le profil de Profilia' }).click();
  await expect(bob.getByRole('heading', { name: 'Profilia', level: 1 })).toBeVisible();
  await expect(bob.getByText('C’est toi')).toHaveCount(0);
  await expect(bob.getByRole('link', { name: 'Rendre visite' })).toBeVisible();
});
