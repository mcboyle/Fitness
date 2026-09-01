/**
 * Prints the outstanding invite codes, creating the partner's user row if it
 * doesn't exist yet.
 *
 * Normally the second code is minted from inside the app (POST /api/v1/invite)
 * once the first user has claimed theirs. This does the same thing directly,
 * so both codes can be handed out before anyone has signed in — useful when
 * setting up two phones at once, or after resetting the database.
 *
 * Run: npm run invite              show outstanding codes, provision a second seat
 *      npm run invite -- --new [name]   mint an ADDITIONAL seat
 *
 * The plain form is deliberately idempotent — it hands back an outstanding code
 * rather than burning a seat every time someone runs it. --new is the escape
 * hatch for adding another person while an invite is still unclaimed.
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

const MAX_USERS = 20;
const args = process.argv.slice(2);
const wantsNew = args.includes('--new');
const requestedName = args.find((a) => !a.startsWith('--'));

const db = new Database(dbPath);
const users = db.prepare('SELECT id, display_name, invite_code FROM users ORDER BY created_at').all();

const addSeat = (name) => {
  if (users.length >= MAX_USERS) {
    console.error(`\n  all ${MAX_USERS} seats are taken\n`);
    process.exit(1);
  }
  const code = newCode();
  db.prepare(
    'INSERT INTO users (id, display_name, avatar_color, invite_code, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(randomUUID(), name, 'var(--ring-water)', code, new Date().toISOString());
  users.push({ display_name: name, invite_code: code });
  return code;
};

if (wantsNew) {
  // The placeholder name only labels the seat until it is claimed; whoever
  // redeems the code types their own.
  addSeat(requestedName ?? 'Invited');
} else if (users.length < 2) {
  addSeat('Partner');
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
console.log(`\n  ${users.length} of ${MAX_USERS} seats used.`);
console.log('  Open https://fitness.themfboyles.org and enter a code, then pick a name.');
console.log('  Invite codes work once; the sign-in code in Settings works forever.\n');
db.close();
