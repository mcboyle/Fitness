/**
 * Purges archived photos past the retention window.
 *
 * The API also sweeps lazily when someone deletes a photo, but that means the
 * window is a floor rather than a promise: if nobody deletes anything for a
 * year, a photo someone binned a year ago is still on disk. Retention has to
 * hold in *both* directions — recoverable for thirty days, and actually gone
 * after them.
 *
 * Runs from the hourly lifestyle-snapshot timer. That is operational
 * housekeeping, not the application scheduling itself, so it does not breach
 * the no-cron rule in BUILDSPEC §7 — nothing about the streak, a pause or a
 * rollover depends on it firing.
 *
 * Run: npm run purge-trash
 */
import Database from 'better-sqlite3';
import { existsSync, rmSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RETENTION_DAYS = 30;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : resolve(root, 'data');
const dbPath = resolve(dataDir, 'lifestyle.db');

if (!existsSync(dbPath)) {
  console.log(`no database at ${dbPath} — nothing to purge`);
  process.exit(0);
}

const db = new Database(dbPath);
const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();

const expired = db
  .prepare(
    'SELECT id, user_id, storage_path, deleted_at FROM media WHERE deleted_at IS NOT NULL AND deleted_at < ?',
  )
  .all(cutoff);

if (expired.length === 0) {
  const waiting = db
    .prepare('SELECT COUNT(*) c FROM media WHERE deleted_at IS NOT NULL')
    .get().c;
  console.log(`nothing past ${RETENTION_DAYS} days; ${waiting} still recoverable`);
  db.close();
  process.exit(0);
}

for (const row of expired) {
  // The row goes whether or not the file is still there — a media row pointing
  // at nothing is worse than no row.
  if (existsSync(row.storage_path)) {
    try {
      rmSync(row.storage_path);
    } catch (error) {
      console.error(`could not remove ${row.storage_path}: ${error.message}`);
      continue;
    }
  }
  db.prepare('DELETE FROM media WHERE id = ?').run(row.id);
  console.log(`purged ${row.id} (binned ${row.deleted_at.slice(0, 10)})`);
}

const remaining = db
  .prepare('SELECT COUNT(*) c FROM media WHERE deleted_at IS NOT NULL')
  .get().c;
console.log(`purged ${expired.length}; ${remaining} still recoverable`);

/*
 * Note what a snapshot does NOT cover: it copies the database, not the image
 * files. A lost disk loses the photos even though the rows survive.
 */
const mediaDir = resolve(dataDir, 'media');
if (existsSync(mediaDir)) {
  const size = db.prepare('SELECT COUNT(*) c FROM media WHERE deleted_at IS NULL').get().c;
  console.log(`${size} live photos on disk (${statSync(mediaDir).isDirectory() ? mediaDir : ''})`);
}

db.close();
