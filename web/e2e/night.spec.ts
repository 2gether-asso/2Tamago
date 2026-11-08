import { dayHour, type GameRules } from '@2tamago/core';
import { expect, test } from '@playwright/test';
import { apiRequest } from './helpers.ts';

test('at night the owner switches the lights off and the pet goes to sleep', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('Pseudo').fill('Root');
  await page.getByRole('button', { name: 'Entrer' }).click();
  await expect(page.getByRole('heading', { name: 'Adopter un compagnon' })).toBeVisible();

  // Time runs fast in this stack: open a night window of a few game hours around "now", then
  // restore the previous settings whatever happens.
  const rules: GameRules = await (await apiRequest(page, 'GET', '/api/game/rules')).json();
  const before = (await (await apiRequest(page, 'GET', '/api/admin/rules')).json()).overrides;
  const hour = Math.floor(dayHour(rules, Date.now()));
  await apiRequest(page, 'PUT', '/api/admin/rules', {
    ...before,
    night: {
      // The pet is a baby: it follows the bedtime of its stage, not the general one.
      stages: { baby: { startHour: (hour + 23) % 24, endHour: (hour + 3) % 24 } },
    },
  });

  try {
    await page.reload();
    await page.getByPlaceholder('Pompon').fill('Lune');
    await page.getByRole('button', { name: /Recevoir mon œuf/ }).click();
    await expect(page.getByText('C’est l’heure du coucher : éteins la lumière')).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole('button', { name: 'Éteindre la lumière' }).click();
    await expect(page.getByRole('button', { name: 'Rallumer la lumière' })).toBeVisible();
    await expect(page.getByText('Dort', { exact: true })).toBeVisible({ timeout: 10_000 });
  } finally {
    await apiRequest(page, 'PUT', '/api/admin/rules', before);
  }
});
