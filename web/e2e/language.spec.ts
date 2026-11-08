import { expect, test } from '@playwright/test';
import { apiRequest } from './helpers.ts';

test.describe('with an English browser', () => {
  test.use({ locale: 'en-GB' });

  test('starts in English, switches to French and remembers the choice', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Enter' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.getByRole('button', { name: /Language/ }).click();
    await expect(page.getByRole('button', { name: 'Entrer' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

    await page.reload();
    await expect(page.getByRole('button', { name: 'Entrer' })).toBeVisible();
  });
});

test.describe('with a French browser', () => {
  test.use({ locale: 'fr-FR' });

  test('translates game texts and API errors as they are shown', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Pseudo').fill('Bilingue');
    await page.getByRole('button', { name: 'Entrer' }).click();
    await expect(page.getByRole('heading', { name: 'Adopter un compagnon' })).toBeVisible();

    await page.getByRole('button', { name: /Langue/ }).click();
    await expect(page.getByRole('heading', { name: 'Adopt a companion' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Shop/ })).toBeVisible();

    // An engine refusal comes with a code, written in the current language.
    await page.getByPlaceholder('Pompon').fill('Poly');
    await page.getByRole('button', { name: /Get my egg/ }).click();
    await expect(page.getByRole('heading', { name: 'Poly' })).toBeVisible();
    const response = await apiRequest(page, 'POST', '/api/pet/actions', { type: 'feed' });
    expect((await response.json()).code).toBe('still_an_egg');
    await page.getByRole('link', { name: /Shop/ }).click();
    await expect(page.getByRole('heading', { name: 'Shop' })).toBeVisible();
  });
});
