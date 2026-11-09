import { expect, test, type Browser } from '@playwright/test';

/** Signs in through the dev login form in its own browser context (own cookies). */
async function signIn(browser: Browser, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByPlaceholder('Pseudo').fill(name);
  await page.getByRole('button', { name: 'Entrer' }).click();
  await expect(page.getByRole('heading', { name: 'Adopter un compagnon' })).toBeVisible();
  return page;
}

async function adopt(page: Awaited<ReturnType<typeof signIn>>, name: string) {
  await page.getByPlaceholder('Pompon').fill(name);
  await page.getByRole('button', { name: /Recevoir mon œuf/ }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

test('two players adopt a pet, care for it and visit each other', async ({ browser }) => {
  const alice = await signIn(browser, 'Alice');
  await adopt(alice, 'Pompon');

  const bob = await signIn(browser, 'Bob');
  await adopt(bob, 'Mochi');

  // Alice is not blocked by an unexpected error after a care action (regression: structuredClone
  // on a deep $state proxy made every action fail).
  const feed = alice.getByRole('button', { name: /Nourrir/ });
  await expect(feed).toBeEnabled({ timeout: 20_000 }); // the egg hatches
  await feed.click();
  await alice.getByRole('button', { name: /Ration simple/ }).click();
  await expect(alice.getByRole('heading', { name: 'Pompon' })).toBeVisible();
  await expect(alice.getByText(/structuredClone|could not be cloned/i)).toHaveCount(0);

  // Eggs cannot be caressed: wait until Bob's pet has hatched.
  await expect(bob.getByRole('button', { name: /Nourrir/ })).toBeEnabled({ timeout: 20_000 });

  // Alice finds Bob's pet in the village and caresses it.
  await alice.getByRole('link', { name: /Village/ }).click();
  await alice.getByRole('link', { name: /Mochi/ }).click();
  await alice.getByRole('button', { name: /Caresser/ }).click();
  await expect(alice.getByRole('button', { name: /Déjà caressé/ })).toBeVisible();

  // Bob sees it in his journal.
  await bob.getByRole('link', { name: /Journal/ }).click();
  await expect(bob.getByText(/Alice/).first()).toBeVisible();
});
