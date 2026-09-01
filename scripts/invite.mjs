/**
 * Prints the outstanding invite codes, creating the partner's user row if it
 * doesn't exist yet.
 *
 * Normally the second code is minted from inside the app (POST /api/v1/invite)
 * once the first user has claimed theirs. This does the same thing directly,
 * so both codes can be handed out before anyone has signed in — useful when
 * setting up two phones at once, or after resetting the database.
 *
 * Run: npm run invite
 */
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = process.env.DATA_DIR
  ? resolve(process.env.DATA_DIR, 'lifestyle.db')
  : resolve(root, 'data/lifestyle.db');

if (!existsSync(dbPath)) {
  console.error(`no database at ${dbPath} — start the API once with \`npm run api\``);
  process.exit(1);
}

// Same alphabet the server uses: no O/0, no I/1/L, because these get read aloud.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = (n = 8) =>
  [...crypto.getRandomValues(new Uint8Array(n))]
    .map((b) => ALPHABET[b % ALPHABET.length])
    .join('');

const db = new Database(dbPath);
const users = db.prepare('SELECT id, display_name, invite_code FROM users ORDER BY created_at').all();

// This app is for exactly two people (§2); never create a third.
if (users.length < 2) {
  const code = newCode();
  db.prepare(
    'INSERT INTO users (id, display_name, avatar_color, invite_code, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(randomUUID(), 'Partner', 'var(--blue-water)', code, new Date().toISOString());
  users.push({ display_name: 'Partner', invite_code: code });
}

console.log('');
for (const [i, user] of users.entries()) {
  const label = `User ${i + 1}`;
  if (user.invite_code) {
    console.log(`  ${label}  code: ${user.invite_code}    (unclaimed)`);
  } else {
    console.log(`  ${label}  ${user.display_name}    (already claimed — codes are single-use)`);
  }
}
console.log('\n  Open https://fitness.themfboyles.org on each phone and enter one code each.');
console.log('  Each code works once. Signing in clears whatever that device had locally.\n');
db.close();
