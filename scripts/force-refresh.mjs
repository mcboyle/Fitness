/**
 * Bumps the cache epoch, which makes every client drop its caches, unregister
 * its service worker and reload the next time it is opened.
 *
 * Separate from the build hash on purpose: the hash only moves when the client
 * bundle does, so a server-only change has nothing for a client to notice. This
 * is the lever for "I want everyone on a clean slate regardless".
 *
 * It does NOT reach a device running a build from before this mechanism
 * existed — that client has no code to check the epoch. Those need one manual
 * reload first.
 *
 * Run: npm run force-refresh
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : resolve(root, 'data');
const file = resolve(dataDir, 'cache-epoch');

if (!existsSync(dataDir)) {
  console.error(`no data directory at ${dataDir}`);
  process.exit(1);
}

const current = existsSync(file) ? Number(readFileSync(file, 'utf8').trim()) || 0 : 0;
const next = current + 1;
writeFileSync(file, String(next));

console.log(`\n  cache epoch ${current} -> ${next}`);
console.log('  Every client drops its caches and reloads on next open.');
console.log('  Served live — no restart needed, the endpoint reads the file per request.\n');
