/**
 * Screenshots every screen, against a throwaway copy of the live database so
 * the real invite codes stay unclaimed.
 *
 * Spawns its own API and preview server on unused ports, claims both codes on
 * the copy, seeds a realistic history, then walks the whole app in both themes.
 *
 * Run: npm run tour [outDir]
 */
import { spawn } from 'node:child_process';
import Database from 'better-sqlite3';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] ?? resolve(root, 'screenshots');
const API_PORT = 8801;
const WEB_PORT = 4187;
const URL = `http://localhost:${WEB_PORT}`;

mkdirSync(OUT, { recursive: true });
const dataDir = mkdtempSync(join(tmpdir(), 'lt-tour-'));

// Copy via the backup API, not cp: in WAL mode the newest writes live in the
// -wal file and a plain copy silently restores an older state.
const live = new Database(resolve(root, 'data/lifestyle.db'), { readonly: true });
await live.backup(join(dataDir, 'lifestyle.db'));
live.close();

const children = [];
const spawnChild = (cmd, args, opts) => {
  const child = spawn(cmd, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  children.push(child);
  return child;
};

function cleanup() {
  for (const child of children) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  }
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

spawnChild('npx', ['tsx', 'src/index.ts'], {
  cwd: resolve(root, 'apps/api'),
  env: { ...process.env, PORT: String(API_PORT), DATA_DIR: dataDir },
});
spawnChild('npx', ['vite', 'preview', '--port', String(WEB_PORT)], {
  cwd: resolve(root, 'apps/web'),
  env: { ...process.env, API_URL: `http://localhost:${API_PORT}` },
});

const waitFor = async (url) => {
  for (let i = 0; i < 90; i += 1) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`never came up: ${url}`);
};
await waitFor(`http://localhost:${API_PORT}/api/v1/health`);
await waitFor(URL);

const db = new Database(join(dataDir, 'lifestyle.db'));

/*
 * Both invite codes have already been claimed by real people, and codes are
 * single-use by design. So rather than signing in, mint a bearer token
 * directly on the copy for each existing user and inject the session. The
 * live database is never touched.
 */
const users = db.prepare('SELECT id, display_name FROM users ORDER BY created_at').all();
if (users.length < 2) throw new Error('the copy has fewer than two users');

const sessions = users.map((user) => {
  const token = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const hash = createHash('sha256').update(token).digest('hex');
  db.prepare(
    'INSERT INTO tokens (id, user_id, hash, label, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(crypto.randomUUID(), user.id, hash, 'tour', new Date().toISOString());
  return {
    token,
    user_id: user.id,
    display_name: user.display_name,
    avatar_color: 'var(--pink-hot)',
  };
});

const browser = await chromium.launch();
const errs = [];
const shots = [];

async function phone(label, session) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  if (session) {
    await ctx.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      ['lt.session', JSON.stringify(session)],
    );
  }
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${label}: ${e}`.slice(0, 160)));
  page.on('console', (m) => m.type() === 'error' && errs.push(`${label}: ${m.text()}`.slice(0, 160)));
  await page.goto(URL, { waitUntil: 'networkidle' });
  return page;
}

/**
 * Clicks if present. The tour runs against a copy of live data whose state
 * varies — sleep may already be logged, a bucket already chosen — and none of
 * these steps matter beyond making the screenshots look inhabited.
 */
async function maybeClick(page, name, exact = false) {
  const button = page.getByRole('button', { name, ...(exact ? { exact } : {}) });
  if ((await button.count()) === 0) return false;
  await button.first().click();
  return true;
}

async function shot(page, name) {
  const file = join(OUT, `${name}.png`);
  // The tab bar is sticky, so in a full-page capture it lands mid-content.
  // Pin it for the shot only; the running app is unaffected.
  await page.addStyleTag({
    content: 'nav[aria-label="Sections"]{position:static !important}',
  });
  await page.screenshot({ path: file, fullPage: true });
  shots.push(name);
  console.log('  ', name);
}

// A session-less context, purely to capture the login screen.
const anon = await phone('anon', null);
await shot(anon, '01-login');
await anon.context().close();

const me = sessions[0].user_id;

/*
 * Normalise the tour user's own settings on the copy so the screenshots show
 * the standard configuration. Real accounts drift — one of these two had
 * step_entry_mode 'exact', which hides the bucket chips entirely.
 */
db.prepare(
  "UPDATE user_settings SET theme='dark', ring_layout='concentric', step_entry_mode='both' WHERE user_id = ?",
).run(me);

// A challenge that started a fortnight ago, with a believable history, so the
// calendar and streak show something other than a blank grid.
const iso = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const nowIso = new Date().toISOString();
const chId = crypto.randomUUID();
const seq = () => { db.prepare('UPDATE sync_seq SET n = n + 1').run(); return db.prepare('SELECT n FROM sync_seq').get().n; };
db.prepare(`INSERT INTO challenges (id,name,target_days,start_date,is_shared,status,created_at,updated_at,server_seq)
            VALUES (?,'75 Days',75,?,1,'active',?,?,?)`).run(chId, iso(13), nowIso, nowIso, seq());
for (const u of db.prepare('SELECT id FROM users').all()) {
  db.prepare(`INSERT OR IGNORE INTO challenge_members (challenge_id,user_id,projected_end_date,updated_at,server_seq)
              VALUES (?,?,?,?,?)`).run(chId, u.id, iso(-61), nowIso, seq());
}
const full = [80, 20, 480, 1, 1, 12000];
const partial = [40, 10, 400, 0, 0, 6000];
for (let n = 13; n >= 1; n -= 1) {
  const [w, p, s, sc, jr, st] = n === 9 || n === 4 ? partial : full;
  db.prepare(`INSERT OR REPLACE INTO daily_log
    (user_id,date,challenge_id,water_oz,pages_read,sleep_minutes,self_care,journaled,steps,workout_minutes,workout_type,whole_food,no_alcohol,updated_at,server_seq)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(me, iso(n), chId, w, p, s, sc, jr, st, n % 3 === 0 ? 45 : 0, n % 3 === 0 ? 'strength' : null, 1, 1, nowIso, seq());
}
for (const [i, title] of ['Free Solo', 'My Octopus Teacher', 'The Last Dance'].entries()) {
  db.prepare(`INSERT INTO documentaries (id,user_id,watched_on,title,notes,created_at,updated_at,server_seq)
              VALUES (?,?,?,?,NULL,?,?,?)`).run(crypto.randomUUID(), me, iso(i + 1), title, nowIso, nowIso, seq());
}
for (const [i, w] of [186.2, 184.8, 183.1, 182.4].entries()) {
  db.prepare(`INSERT INTO measurements (id,user_id,taken_on,weight_lb,waist_in,hip_in,arm_in,thigh_in,notes,created_at,updated_at,server_seq)
              VALUES (?,?,?,?,?,NULL,?,NULL,NULL,?,?,?)`)
    .run(crypto.randomUUID(), me, iso(12 - i * 4), w, 35 - i * 0.5, 14 + i * 0.1, nowIso, nowIso, seq());
}

const A = await phone('A', sessions[0]);
await A.waitForSelector('text=streak', { timeout: 20000 });

const B = await phone('B', sessions[1]);
await B.waitForSelector('text=streak', { timeout: 20000 });
for (let i = 0; i < 6; i += 1) await maybeClick(B, '+8 oz');
await maybeClick(B, /Self-Care/);
await B.waitForTimeout(1500);

await A.reload({ waitUntil: 'networkidle' });
await A.waitForSelector('text=streak');
for (let i = 0; i < 9; i += 1) { await maybeClick(A, '+8 oz'); await A.waitForTimeout(60); }
await maybeClick(A, 'over 10k');
for (let i = 0; i < 3; i += 1) await maybeClick(A, '+15');
await maybeClick(A, 'cardio');
for (const pill of [/Whole food/, /No alcohol/, /Self-Care/, /Daily Journal/]) {
  await maybeClick(A, pill);
}
await maybeClick(A, 'log sleep');
await maybeClick(A, 'Half an hour more');
await maybeClick(A, '+5', true);
await A.waitForTimeout(2500);

// B reacts so A's inbox has something in it.
await B.reload({ waitUntil: 'networkidle' });
await B.waitForSelector('text=streak');
await B.waitForTimeout(2000);
const react = B.getByRole('button', { name: /React .* day/ });
if (await react.count()) {
  await react.first().click();
  await B.waitForTimeout(800);
  await B.getByLabel('Note').fill('proud of you');
  await maybeClick(B, 'Send');
  await B.waitForTimeout(1500);
}

// A photo, shared, so the gallery isn't empty.
const png = Buffer.from('89504e470d0a1a0a0000000d494844520000000c0000001008060000005c9d0a4d0000004b4944415428cf63fccfc0f09f81e13fc3ff8c19fe33c37cc0c8c0c8c0f0bf61e0cf60f8cf00c3ff0c0c8c0c8c0c8ff1930fc67603843a37edc7801a3b1a3d1a3f1f79c3800a70043e10a5ba90000000049454e44ae426082', 'hex');
await A.getByRole('button', { name: 'Photos', exact: true }).click();
await A.waitForTimeout(600);
await A.setInputFiles('input[type=file]', { name: 'day1.png', mimeType: 'image/png', buffer: png });
await A.waitForTimeout(2500);
await maybeClick(A, 'Share', true);
await A.waitForTimeout(1500);

async function walk(prefix) {
  await A.getByRole('button', { name: 'Today', exact: true }).click();
  await A.waitForTimeout(900);
  await shot(A, `${prefix}-today`);
  await A.getByRole('button', { name: 'Calendar', exact: true }).click(); await A.waitForTimeout(700);
  await shot(A, `${prefix}-calendar`);
  await A.getByRole('button', { name: 'Photos', exact: true }).click(); await A.waitForTimeout(1600);
  await shot(A, `${prefix}-photos`);
  await A.getByRole('button', { name: 'Body', exact: true }).click(); await A.waitForTimeout(700);
  await shot(A, `${prefix}-body`);
}

await walk('02-dark');

await A.getByRole('button', { name: 'Today', exact: true }).click(); await A.waitForTimeout(400);
await A.getByRole('button', { name: 'Settings' }).click(); await A.waitForTimeout(600);
await shot(A, '03-settings-dark');
await maybeClick(A, 'Light', true); await A.waitForTimeout(600);
await shot(A, '04-settings-light');
await maybeClick(A, '2×2 grid', true); await A.waitForTimeout(400);
await A.getByRole('button', { name: 'Close settings' }).click(); await A.waitForTimeout(700);

await walk('05-light-grid');

// A locked day: outside the today/yesterday edit window.
await A.getByRole('button', { name: 'Today', exact: true }).click(); await A.waitForTimeout(400);
for (let i = 0; i < 3; i += 1) { await A.getByRole('button', { name: 'Previous day' }).click(); await A.waitForTimeout(200); }
await A.waitForTimeout(800);
await shot(A, '06-locked-day');

// The partner's view, for contrast.
await shot(B, '07-partner-view');

console.log(`\n  ${shots.length} screenshots -> ${OUT}`);
console.log(errs.length ? `  console errors:\n   ${errs.join('\n   ')}` : '  no console errors');
await browser.close();
cleanup();
process.exit(0);
