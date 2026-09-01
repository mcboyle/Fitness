import type { DB } from './db';

/**
 * Numbered schema migrations, applied in order.
 *
 * `schema.sql` is CREATE TABLE IF NOT EXISTS, which means it creates a database
 * that doesn't exist and does nothing at all to one that does. Adding a column
 * to a live database therefore needs this. There is real data in production, so
 * every step runs inside a transaction and the version only advances if it
 * committed.
 *
 * Never edit a migration that has shipped — add another one.
 */
interface Migration {
  version: number;
  name: string;
  up: (db: DB) => void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'eating-healthy meals + reusable sign-in codes',
    up: (db) => {
      for (const meal of ['breakfast', 'lunch', 'dinner']) {
        db.exec(`ALTER TABLE daily_log ADD COLUMN ${meal} TEXT`);
      }
      db.exec('ALTER TABLE users ADD COLUMN sign_in_code TEXT');

      /*
       * Backfill: a day marked both whole-food and no-junk-food is the closest
       * thing the old two-toggle model had to "three healthy meals". Anything
       * less is left unlogged rather than guessed at — inventing meals nobody
       * recorded would be worse than an empty ring.
       */
      db.exec(`
        UPDATE daily_log
           SET breakfast = 'healthy', lunch = 'healthy', dinner = 'healthy'
         WHERE whole_food = 1 AND no_junk_food = 1
      `);
    },
  },
  {
    version: 2,
    name: 'backfill sign-in codes for existing members',
    up: (db) => {
      /*
       * Anyone who claimed before sign_in_code existed has none, and they are
       * exactly the people locked out after Add to Home Screen. Codes are
       * generated per row rather than in SQL so they use the same
       * confusable-free alphabet as everything else.
       */
      const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
      const code = () =>
        [...crypto.getRandomValues(new Uint8Array(10))]
          .map((b) => alphabet[b % alphabet.length])
          .join('');

      const rows = db
        .prepare('SELECT id FROM users WHERE invite_code IS NULL AND sign_in_code IS NULL')
        .all() as { id: string }[];

      for (const row of rows) {
        db.prepare('UPDATE users SET sign_in_code = ? WHERE id = ?').run(code(), row.id);
      }
    },
  },
  {
    version: 3,
    name: 'soft-delete for documentaries',
    up: (db) => {
      /*
       * A tombstone, not a DELETE. Deleting the row outright removes it from
       * the server but nothing tells the other device, which keeps its copy and
       * keeps counting it toward the rolling goal forever.
       */
      db.exec('ALTER TABLE documentaries ADD COLUMN deleted_at TEXT');
    },
  },
  {
    version: 4,
    name: 'soft-delete for measurements',
    up: (db) => {
      db.exec('ALTER TABLE measurements ADD COLUMN deleted_at TEXT');
    },
  },
];

export function migrate(db: DB, log: (message: string) => void = () => {}): number {
  const current = (db.pragma('user_version', { simple: true }) as number) ?? 0;
  const pending = MIGRATIONS.filter((m) => m.version > current);
  if (pending.length === 0) return current;

  for (const migration of pending) {
    // better-sqlite3 wraps this in a transaction; a throw rolls the whole step
    // back, leaving user_version untouched so it is retried next boot.
    db.transaction(() => {
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
    })();
    log(`migration ${migration.version} applied: ${migration.name}`);
  }

  return pending[pending.length - 1].version;
}
