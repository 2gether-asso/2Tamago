import { expect, test } from '@playwright/test';

test('a day with a companion: bowl, wish and missions', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('Pseudo').fill('Gamelle');
  await page.getByRole('button', { name: 'Entrer' }).click();
  await page.getByPlaceholder('Pompon').fill('Bento');
  await page.getByRole('button', { name: /Recevoir mon œuf/ }).click();

  // Hatched (time runs 120x faster here): fill the bowl before leaving.
  const bowl = page.getByRole('button', { name: /Remplir la gamelle/ });
  await expect(bowl).toHaveText(/\(0\/2\)/, { timeout: 20_000 });
  await bowl.click();
  await expect(bowl).toHaveText(/\(2\/2\)/);
  await expect(bowl).toBeDisabled();

  await expect(page.getByRole('heading', { name: 'Missions du jour' })).toBeVisible();

  // The first wish comes half a game hour after hatching (15 s here).
  await expect(page.locator('p.wish')).toBeVisible({ timeout: 30_000 });

  if (process.env.SCREENSHOT_DIR) {
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/home.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/home-phone.png`, fullPage: true });
  }
});
