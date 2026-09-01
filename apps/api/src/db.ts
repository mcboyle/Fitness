import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from './migrations';

const here = dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = process.env.DATA_DIR
  ? resolve(process.env.DATA_DIR)
  : resolve(here, '../../../data');

export function openDatabase(file = resolve(DATA_DIR, 'lifestyle.db')) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });

  const db = new Database(file);
  db.exec(readFileSync(resolve(here, 'schema.sql'), 'utf8'));

  // schema.sql only creates what is missing; migrations alter what exists.
  migrate(db, (message) => console.log(message));

  return db;
}

export type DB = ReturnType<typeof openDatabase>;

/**
 * The sync cursor.
 *
 * BUILDSPEC §10 describes `?since=<timestamp>`. A monotonic counter is used
 * instead of a wall clock for the same job: two rows written in the same
 * millisecond are distinguishable, and a clock that steps backwards (NTP, DST
 * on a naive implementation) cannot make a change invisible to a client
 * forever. `since` stays the query parameter name; its value is an opaque
 * cursor the server issued.
 *
 * Client clocks never feed this — only the server allocates.
 */
export function nextSeq(db: DB): number {
  db.prepare('UPDATE sync_seq SET n = n + 1 WHERE id = 1').run();
  return (db.prepare('SELECT n FROM sync_seq WHERE id = 1').get() as { n: number }).n;
}

export function currentSeq(db: DB): number {
  return (db.prepare('SELECT n FROM sync_seq WHERE id = 1').get() as { n: number }).n;
}

export function newId(): string {
  return randomUUID();
}

/**
 * Invite codes are read aloud or typed by hand, so the alphabet omits
 * characters that get confused: no O/0, no I/1/L.
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newInviteCode(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
