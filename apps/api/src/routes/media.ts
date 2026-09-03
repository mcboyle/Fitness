import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth';
import { type DB, newId, nextSeq } from '../db';
import {
  MEDIA_DIR,
  TRASH_DIR,
  TRASH_RETENTION_DAYS,
  extensionFor,
  mimeFor,
  signMediaUrl,
  verifyMediaUrl,
} from '../media';

interface MediaRow {
  id: string;
  user_id: string;
  taken_on: string;
  kind: string;
  storage_path: string;
  visibility: 'private' | 'shared';
  shared_at: string | null;
  created_at: string;
  deleted_at: string | null;
}

/**
 * Authorises a viewer against one photo.
 *
 * §9.2: the partner receives nothing at all for a private photo — not
 * metadata, not a thumbnail, not a path. Checked on the endpoint rather than
 * folded into a query, because an id supplied by a client is a request, not a
 * permission.
 */
function visibleTo(row: MediaRow | undefined, viewerId: string): boolean {
  if (!row) return false;
  // A photo in the trash is not visible to anyone, its owner included. It is
  // recoverable, which is not the same as available.
  if (row.deleted_at) return false;
  if (row.user_id === viewerId) return true;
  return row.visibility === 'shared';
}

function expiryOf(deletedAt: string): string {
  return new Date(
    new Date(deletedAt).getTime() + TRASH_RETENTION_DAYS * 86_400_000,
  ).toISOString();
}

/** Drops trashed photos past the retention window, file and row together. */
export async function purgeExpiredTrash(db: DB): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 86_400_000).toISOString();
  const expired = db
    .prepare('SELECT id, storage_path FROM media WHERE deleted_at IS NOT NULL AND deleted_at < ?')
    .all(cutoff) as { id: string; storage_path: string }[];

  for (const row of expired) {
    await unlink(row.storage_path).catch(() => {});
    db.prepare('DELETE FROM media WHERE id = ?').run(row.id);
  }
  return expired.length;
}

export function registerMediaRoutes(app: FastifyInstance, db: DB) {
  const requireAuth = authenticate(db);

  /** Upload. Private at the moment of creation — sharing is a second, deliberate act (§9.1). */
  app.post('/api/v1/media', { preHandler: requireAuth }, async (request, reply) => {
    const file = await request.file({ limits: { fileSize: 25 * 1024 * 1024 } });
    if (!file) return reply.code(400).send({ error: 'expected a file' });

    const extension = extensionFor(file.mimetype);
    if (!extension) {
      return reply.code(415).send({ error: `unsupported image type ${file.mimetype}` });
    }

    const takenOn =
      typeof file.fields?.taken_on === 'object' && file.fields.taken_on
        ? String((file.fields.taken_on as { value?: unknown }).value ?? '')
        : '';

    const userId = request.user!.id;
    const id = newId();
    const dir = resolve(MEDIA_DIR, userId);
    await mkdir(dir, { recursive: true });

    // Random name: never derived from the user, the date or the original
    // filename, so a path can't be guessed from anything a client knows.
    const storagePath = resolve(dir, `${id}.${extension}`);

    try {
      await pipeline(file.file, createWriteStream(storagePath));
    } catch {
      await unlink(storagePath).catch(() => {});
      return reply.code(500).send({ error: 'could not store the file' });
    }

    if (file.file.truncated) {
      await unlink(storagePath).catch(() => {});
      return reply.code(413).send({ error: 'file too large (25MB limit)' });
    }

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO media (id, user_id, taken_on, kind, storage_path, thumb_path,
                          visibility, shared_at, created_at, updated_at, server_seq)
       VALUES (?, ?, ?, 'progress_photo', ?, NULL, 'private', NULL, ?, ?, ?)`,
    ).run(id, userId, takenOn || now.slice(0, 10), storagePath, now, now, nextSeq(db));

    return { id, visibility: 'private', taken_on: takenOn || now.slice(0, 10) };
  });

  /**
   * Share or unshare. Owner only.
   *
   * §9.4: unsharing revokes future access. It cannot recall a copy already
   * downloaded, and the UI says so rather than overpromising.
   */
  app.post<{ Params: { id: string }; Body: { visibility?: string } }>(
    '/api/v1/media/:id/visibility',
    { preHandler: requireAuth },
    async (request, reply) => {
      const row = db.prepare('SELECT * FROM media WHERE id = ?').get(request.params.id) as
        | MediaRow
        | undefined;

      // A non-owner gets 404, not 403: confirming a photo exists is itself a leak.
      if (!row || row.user_id !== request.user!.id) {
        return reply.code(404).send({ error: 'no such photo' });
      }

      const next = request.body?.visibility === 'shared' ? 'shared' : 'private';
      const now = new Date().toISOString();
      db.prepare(
        'UPDATE media SET visibility = ?, shared_at = ?, updated_at = ?, server_seq = ? WHERE id = ?',
      ).run(next, next === 'shared' ? now : null, now, nextSeq(db), row.id);

      return { id: row.id, visibility: next };
    },
  );

  /** Mint a short-lived signed URL. Authorisation happens here, not at render. */
  app.get<{ Params: { id: string } }>(
    '/api/v1/media/:id/url',
    { preHandler: requireAuth },
    async (request, reply) => {
      const row = db.prepare('SELECT * FROM media WHERE id = ?').get(request.params.id) as
        | MediaRow
        | undefined;

      if (!visibleTo(row, request.user!.id)) {
        return reply.code(404).send({ error: 'no such photo' });
      }

      return { url: signMediaUrl(row!.id, request.user!.id), expires_in: 300 };
    },
  );

  /**
   * Serve the bytes. Deliberately not behind `requireAuth` — an <img> tag
   * cannot send an Authorization header — but the signature names the viewer,
   * and visibility is re-checked here. An unshared photo stops being served
   * immediately, even if a signed URL is still within its window.
   */
  app.get<{ Params: { id: string }; Querystring: { exp?: string; v?: string; sig?: string } }>(
    '/api/v1/media/:id/file',
    async (request, reply) => {
      const { exp, v, sig } = request.query;
      if (!exp || !v || !sig) return reply.code(400).send({ error: 'unsigned request' });

      if (!verifyMediaUrl(request.params.id, v, Number(exp), sig)) {
        return reply.code(403).send({ error: 'expired or invalid signature' });
      }

      const row = db.prepare('SELECT * FROM media WHERE id = ?').get(request.params.id) as
        | MediaRow
        | undefined;

      // Re-check now, not at signing time: this is what makes unsharing bite.
      if (!visibleTo(row, v)) return reply.code(404).send({ error: 'no such photo' });

      /*
       * A row whose file is missing is a 404, not a 500. It happens for real:
       * a restore that has not finished, or a photo store lost while the rows
       * survived — and an unhandled stream error there took the request down
       * with a server error instead of saying the photo is not there.
       */
      if (!existsSync(row!.storage_path)) {
        request.log.warn(`media ${row!.id} has no file at ${row!.storage_path}`);
        return reply.code(404).send({ error: 'the image file is missing' });
      }

      return reply
        .header('content-type', mimeFor(row!.storage_path))
        .header('cache-control', 'private, no-store')
        .send(createReadStream(row!.storage_path));
    },
  );

  /** Own photos in full; the partner's only when shared (§9.2). */
  app.get('/api/v1/media', { preHandler: requireAuth }, async (request) => {
    const rows = db
      .prepare(
        `SELECT id, user_id, taken_on, kind, visibility, shared_at, created_at
           FROM media
          WHERE deleted_at IS NULL AND (user_id = ? OR visibility = 'shared')
          ORDER BY taken_on DESC`,
      )
      .all(request.user!.id) as Omit<MediaRow, 'storage_path'>[];

    // storage_path is never serialised to any client, owner included.
    return { media: rows };
  });

  /**
   * Delete moves the file to the trash and stamps the row rather than removing
   * either. A mis-tap on a progress photo is otherwise unrecoverable, and these
   * are the one thing in the app nobody can retake.
   */
  app.delete<{ Params: { id: string } }>(
    '/api/v1/media/:id',
    { preHandler: requireAuth },
    async (request, reply) => {
      const row = db.prepare('SELECT * FROM media WHERE id = ?').get(request.params.id) as
        | MediaRow
        | undefined;
      if (!row || row.user_id !== request.user!.id || row.deleted_at) {
        return reply.code(404).send({ error: 'no such photo' });
      }

      const trashDir = resolve(TRASH_DIR, row.user_id);
      await mkdir(trashDir, { recursive: true });
      const trashed = resolve(trashDir, row.storage_path.split('/').pop()!);

      try {
        await rename(row.storage_path, trashed);
      } catch {
        // Nothing on disk to move — still stamp the row so the state is honest.
      }

      const now = new Date().toISOString();
      db.prepare(
        'UPDATE media SET deleted_at = ?, storage_path = ?, visibility = ?, updated_at = ?, server_seq = ? WHERE id = ?',
      ).run(now, trashed, 'private', now, nextSeq(db), row.id);

      // Lazy retention sweep: no scheduler anywhere in this system (§7), so the
      // purge rides on the next delete rather than a timer.
      await purgeExpiredTrash(db);

      return { deleted: row.id, recoverable_until: expiryOf(now) };
    },
  );
}
