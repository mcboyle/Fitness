import { chromium } from 'playwright';

const OUT = process.argv[2];
const URL = 'http://localhost:5173';

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});

const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle' });

// The app opens on the login screen now; pass an invite code as argv[3].
const inviteCode = process.argv[3];
if (await page.getByLabel('Invite code').isVisible().catch(() => false)) {
  if (!inviteCode) {
    console.error('usage: node scripts/screenshot.mjs <outDir> <inviteCode>');
    console.error('start the API with `npm run api` and use the code it logs.');
    await browser.close();
    process.exit(2);
  }
  await page.getByLabel('Invite code').fill(inviteCode);
  await page.getByLabel('Your name').fill('Matthew');
  await page.getByRole('button', { name: 'Join' }).click();
}
await page.waitForSelector('text=streak', { timeout: 15000 });

// Log a realistic day so the rings have something to draw.
for (let i = 0; i < 7; i++) await page.getByRole('button', { name: '+8 oz' }).click();
for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '+5', exact: true }).click();
await page.getByRole('button', { name: '5–10k' }).click();
for (let i = 0; i < 2; i++) await page.getByRole('button', { name: '+15' }).click();
await page.getByRole('button', { name: 'cardio' }).click();
await page.getByRole('button', { name: /Self-care/ }).click();
await page.getByRole('button', { name: /Journaled/ }).click();
await page.getByRole('button', { name: /Whole food/ }).click();
await page.getByRole('button', { name: 'log sleep' }).click();
await page.waitForTimeout(800);

async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log('shot', name);
}

await shot('01-dark-concentric');

async function setting(label) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.waitForTimeout(700);
}

await setting('2×2 grid');
await shot('02-dark-grid');

await setting('Light');
await shot('03-light-grid');

await setting('Concentric');
await shot('04-light-concentric');

// Settings sheet itself, and a locked past day.
await page.getByRole('button', { name: 'Settings' }).click();
await page.waitForTimeout(400);
await shot('05-settings');
await page.getByRole('button', { name: 'Close settings' }).click();

for (let i = 0; i < 3; i++) {
  await page.getByRole('button', { name: 'Previous day' }).click();
  await page.waitForTimeout(150);
}
await page.waitForTimeout(500);
await shot('06-locked-day');

console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.join('\n') : 'no console errors');
await browser.close();
