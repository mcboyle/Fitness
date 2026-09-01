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
import { chromium } from 'playwright';

const PORT = 4178;
const URL = `http://localhost:${PORT}`;

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT)], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

const failures = [];
let browser;

/** Owns the child, so it kills by PID — never by process-name pattern. */
function shutdown(code) {
  browser?.close().catch(() => {});
  server.kill('SIGTERM');
  process.exit(code);
}

try {
  await waitForServer();

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  page.on('pageerror', (e) => failures.push(`pageerror: ${e}`));
  page.on('console', (m) => {
    if (m.type() === 'error') failures.push(`console error: ${m.text()}`);
  });
  page.on('requestfailed', (r) =>
    failures.push(`request failed: ${r.url()} — ${r.failure()?.errorText}`),
  );

  await page.goto(URL, { waitUntil: 'networkidle' });

  // The app renders from IndexedDB, so give the first bootstrap a beat.
  await page.waitForSelector('text=streak', { timeout: 15_000 }).catch(() => {
    failures.push('the day header never rendered — the app is blank');
  });

  const body = await page.locator('body').innerText();
  for (const expected of ['streak', 'WATER', 'READING', 'STEPS', 'WORKOUT', 'SLEEP']) {
    if (!body.includes(expected)) failures.push(`missing from the page: ${expected}`);
  }

  // A write has to survive a reload, or the local store isn't really the store.
  await page.getByRole('button', { name: '+8 oz' }).click();
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('text=streak', { timeout: 15_000 });
  const afterReload = await page.locator('body').innerText();
  if (!/\b8\s*\/\s*80 oz/.test(afterReload.replace(/\s+/g, ' '))) {
    failures.push('water did not persist across a reload');
  }
} catch (error) {
  failures.push(`threw: ${error}`);
}

if (failures.length) {
  console.error(`smoke FAILED (${failures.length})`);
  for (const f of failures) console.error(`  - ${f}`);
  shutdown(1);
}

console.log('smoke passed');
shutdown(0);

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(URL);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server never came up');
}
