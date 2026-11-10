// Signs in as a fresh player, adopts a companion of the given species and screenshots the adoption
// form and the pet page. Usage: node driver.mjs <species-label> <out-dir>
//   node .claude/skills/run-2tamago/driver.mjs Kame /tmp/shots
import { chromium } from '../../../web/node_modules/@playwright/test/index.mjs';

const [species = 'Mochi', out = '.'] = process.argv.slice(2);
const player = `Run${Date.now() % 1e7}`; // players are unique per run: the API keeps one pet each

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await (
  await browser.newContext({ locale: 'fr-FR', viewport: { width: 1000, height: 900 } })
).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('http://localhost:4322/login');
await page.getByPlaceholder('Pseudo').fill(player);
await page.getByRole('button', { name: 'Entrer' }).click();
await page.getByRole('heading', { name: 'Adopter un compagnon' }).waitFor();
await page.getByRole('button', { name: new RegExp(species) }).click();
await page.screenshot({ path: `${out}/adopt.png` });

await page.getByPlaceholder('Pompon').fill('Testy');
await page.getByRole('button', { name: /Recevoir mon œuf/ }).click();
await page.getByRole('heading', { name: 'Testy' }).waitFor();
await page.waitForTimeout(6000); // the clock runs 120x: the egg hatches in ~3 s
await page.screenshot({ path: `${out}/pet.png` });

console.log(`screenshots in ${out}; page errors: ${JSON.stringify(errors)}`);
await browser.close();
