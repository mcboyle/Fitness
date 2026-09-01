/**
 * Boots the production build, loads it in a real browser, and fails on
 * anything the type checker and unit tests structurally cannot see: a runtime
 * crash, a blank render, a console error.
 *
 * This exists because two separate bugs shipped past `tsc`, `oxlint` and
 * `vitest` clean — both were writes to Dexie from inside `useLiveQuery`, which
 * runs read-only and throws ReadOnlyError at runtime. The build was green and
 * the page was blank. See MISTAKES.md.
 *
 * Run: npm run smoke
 */
import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { chromium } from 'playwright';

const PORT = 4178;

/**
 * Both origins are tested on purpose. `localhost` is a secure context and the
 * LAN IP is not, and APIs like `crypto.randomUUID` exist only on the former —
 * so a localhost-only smoke test reported green while the app was a blank page
 * on every phone. See MISTAKES.md #7.
 */
const LAN_IP = Object.values(networkInterfaces())
  .flat()
  .find((n) => n && n.family === 'IPv4' && !n.internal)?.address;

const ORIGINS = [`http://localhost:${PORT}`];
if (LAN_IP) ORIGINS.push(`http://${LAN_IP}:${PORT}`);

// `detached` puts vite in its own process group. Killing the npx wrapper alone
// orphans the vite child, which then keeps serving the build to the whole LAN
// — that happened four times before anyone noticed. See MISTAKES.md #6.
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT)], {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});

const failures = [];
let browser;

let shuttingDown = false;

/**
 * Kills the whole process group (note the negated pid), never a name pattern.
 * Killing `server.pid` alone leaves the vite child listening forever.
 */
function stopServer() {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    // already gone
  }
}

async function shutdown(code) {
  await browser?.close().catch(() => {});
  stopServer();
  process.exit(code);
}

// Fires on ctrl-c and on an unhandled throw, not just the happy path.
process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));
process.on('exit', stopServer);

try {
  await waitForServer();
  browser = await chromium.launch();

  for (const origin of ORIGINS) {
    await checkOrigin(origin);
  }
} catch (error) {
  failures.push(`threw: ${error}`);
}

if (failures.length) {
  console.error(`smoke FAILED (${failures.length})`);
  for (const f of failures) console.error(`  - ${f}`);
  await shutdown(1);
}

console.log('smoke passed');
await shutdown(0);

async function checkOrigin(origin) {
  const fail = (msg) => failures.push(`[${origin}] ${msg}`);
  // A fresh context per origin, so IndexedDB never carries over between them.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  page.on('pageerror', (e) => fail(`pageerror: ${e}`));
  page.on('console', (m) => {
    if (m.type() === 'error') fail(`console error: ${m.text()}`);
  });
  page.on('requestfailed', (r) =>
    fail(`request failed: ${r.url()} — ${r.failure()?.errorText}`),
  );

  await page.goto(origin, { waitUntil: 'networkidle' });

  // The app renders from IndexedDB, so give the first bootstrap a beat.
  await page.waitForSelector('text=streak', { timeout: 15_000 }).catch(() => {
    fail('the day header never rendered — the app is blank');
  });

  const body = await page.locator('body').innerText();
  for (const expected of ['streak', 'WATER', 'READING', 'STEPS', 'WORKOUT', 'SLEEP']) {
    if (!body.includes(expected)) fail(`missing from the page: ${expected}`);
  }

  // A write has to survive a reload, or the local store isn't really the store.
  await page.getByRole('button', { name: '+8 oz' }).click();
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('text=streak', { timeout: 15_000 }).catch(() => {
    fail('blank after reload');
  });
  const afterReload = await page.locator('body').innerText();
  if (!/\b8\s*\/\s*80 oz/.test(afterReload.replace(/\s+/g, ' '))) {
    fail('water did not persist across a reload');
  }

  /*
   * Typed one key at a time on purpose. Playwright's fill() sets the value in
   * a single event, which is exactly what hid a controlled input dropping
   * keystrokes while its value round-tripped through IndexedDB — "8432"
   * landed as "2". See MISTAKES.md #8.
   */
  await page.getByRole('button', { name: 'enter exact' }).click();
  const stepsField = page.getByLabel('Exact step count');
  if (!(await stepsField.evaluate((el) => el === document.activeElement))) {
    fail('tapping "enter exact" did not focus the field — no keyboard on iOS');
  }
  await page.keyboard.type('8432');
  await page.waitForTimeout(400);
  const typed = await stepsField.inputValue();
  if (typed !== '8432') fail(`steps field dropped keystrokes: typed 8432, got "${typed}"`);

  const pagesField = page.getByLabel('Pages read');
  await pagesField.click();
  await pagesField.press('End');
  await page.keyboard.type('147');
  await page.waitForTimeout(400);
  const pages = await pagesField.inputValue();
  if (!pages.endsWith('147')) fail(`pages field dropped keystrokes: got "${pages}"`);

  const secure = await page.evaluate(() => window.isSecureContext);
  console.log(`  ${origin} ok (secureContext=${secure})`);
  await context.close();
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://localhost:${PORT}`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server never came up');
}
