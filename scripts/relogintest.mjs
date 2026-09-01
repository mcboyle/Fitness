import { chromium } from 'playwright';
const URL = process.argv[2] ?? 'https://fitness.themfboyles.org';
const CODE = process.argv[3];
const b = await chromium.launch(); const errs = [];

async function ctx(label) {
  const c = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await c.newPage();
  p.on('pageerror', e => errs.push(`${label}: ${e}`.slice(0,140)));
  p.on('console', m => m.type()==='error' && errs.push(`${label}: ${m.text()}`.slice(0,140)));
  await p.goto(URL, { waitUntil: 'networkidle' });
  return { c, p };
}

// Safari: signs in with the reusable code.
const safari = await ctx('safari');
await safari.p.getByLabel('Code').fill(CODE);
await safari.p.getByRole('button', { name: 'Continue' }).click();
await safari.p.waitForSelector('[data-testid=day-header]', { timeout: 20000 });
console.log('1 sign in with reusable code :', 'PASS');

// Log something so we can prove the second sign-in doesn't wipe it.
await safari.p.getByRole('button', { name: '+8 oz' }).click();
await safari.p.waitForTimeout(2000);
// Target the page body, not the first <ul> — that is the reaction inbox.
const waterOf = async (p) => (await p.locator('body').innerText()).replace(/\s+/g,' ').match(/(\d+) \/ 80 oz/)?.[1] ?? null;
const before = await waterOf(safari.p);
console.log('2 logged something           :', before !== null ? `PASS - water ${before}` : '*** FAIL ***');

// The installed PWA: a separate storage jar, i.e. a fresh context.
const installed = await ctx('installed');
const sawLogin = await installed.p.getByLabel('Code').isVisible().catch(() => false);
console.log('3 installed app asks to sign in:', sawLogin ? 'PASS (expected - separate storage)' : 'FAIL');
await installed.p.getByLabel('Code').fill(CODE);
await installed.p.getByRole('button', { name: 'Continue' }).click();
await installed.p.waitForSelector('[data-testid=day-header]', { timeout: 20000 });
console.log('4 same code works AGAIN      :', 'PASS - not single-use');
await installed.p.waitForTimeout(2500);
const synced = await waterOf(installed.p);
console.log('5 data present after re-login:', synced === before ? `PASS - water ${synced} matches` : `*** FAIL: ${synced} vs ${before} ***`);

// Reload the original context: its local data must be untouched.
await safari.p.reload({ waitUntil: 'networkidle' });
await safari.p.waitForSelector('[data-testid=day-header]', { timeout: 20000 });
await safari.p.waitForTimeout(1500);
const after = await waterOf(safari.p);
console.log('6 first device not wiped     :', after === before ? `PASS - water still ${after}` : `*** FAIL: ${after} vs ${before} ***`);
console.log(errs.length ? 'ERRORS:\n ' + errs.join('\n ') : 'no console errors');
await b.close();
