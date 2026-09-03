import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DATA_DIR } from './db';

/**
 * Photos are stored outside anything Fastify serves statically (§9): the static
 * root is apps/web/dist, this is DATA_DIR/media. Names are random, so a path is
 * never guessable even if the directory leaked.
 */
export const MEDIA_DIR = resolve(DATA_DIR, 'media');

/**
 * Recently deleted photos. Kept out of MEDIA_DIR so nothing that walks the
 * live store can serve them by accident.
 */
export const TRASH_DIR = resolve(DATA_DIR, 'trash');

/**
 * How long a deleted photo is recoverable. Long enough that "I deleted the
 * wrong one" is fixable days later; short enough that it isn't an archive
 * nobody consented to.
 */
export const TRASH_RETENTION_DAYS = 30;

/**
 * Signing key for media URLs. Persisted so that a restart doesn't invalidate
 * every outstanding URL, and kept out of the database so a database copy alone
 * cannot mint links.
 */
function loadSecret(): Buffer {
  const file = resolve(DATA_DIR, 'media-secret');
  if (existsSync(file)) return Buffer.from(readFileSync(file, 'utf8').trim(), 'hex');

  mkdirSync(DATA_DIR, { recursive: true });
  const secret = randomBytes(32);
  writeFileSync(file, secret.toString('hex'), { mode: 0o600 });
  return secret;
}

let secret: Buffer | null = null;

function key(): Buffer {
  secret ??= loadSecret();
  return secret;
}

/** Five minutes is long enough to render a gallery, short enough that a leaked
 * URL is close to worthless. Unsharing is enforced at request time regardless. */
export const URL_TTL_SECONDS = 300;

export function signMediaUrl(mediaId: string, viewerId: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + URL_TTL_SECONDS;
  return `/api/v1/media/${mediaId}/file?exp=${exp}&v=${viewerId}&sig=${sign(mediaId, viewerId, exp)}`;
}

function sign(mediaId: string, viewerId: string, exp: number): string {
  return createHmac('sha256', key()).update(`${mediaId}.${viewerId}.${exp}`).digest('hex');
}

export function verifyMediaUrl(
  mediaId: string,
  viewerId: string,
  exp: number,
  sig: string,
  now = Date.now(),
): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < now) return false;

  const expected = Buffer.from(sign(mediaId, viewerId, exp));
  const given = Buffer.from(sig);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

export function extensionFor(mimetype: string): string | null {
  return EXTENSIONS[mimetype] ?? null;
}

export function mimeFor(path: string): string {
  const ext = path.split('.').pop() ?? '';
  const found = Object.entries(EXTENSIONS).find(([, e]) => e === ext);
  return found?.[0] ?? 'application/octet-stream';
}
