import { timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hashToken, mintToken } from '../auth';
import { MEDIA_DIR, TRASH_RETENTION_DAYS } from '../media';
import { type DB, newId, nextSeq } from '../db';

/**
 * Development impersonation. **This is a master key to every account.**
 *
 * It mints a genuine bearer token for any user, so a session opened with it is
 * byte-for-byte theirs — including progress photos they marked private, which
 * is the one consent decision BUILDSPEC §9 exists to protect. Anyone the app is
 * shared with should be told this exists while it does.
 *
 * Entirely absent unless DEV_TOKEN is set: the routes 404 rather than 403, so
 * an unconfigured server does not admit the endpoint exists. Remove DEV_TOKEN
 * from the systemd unit and restart to switch it off for good.
 */
export function registerDevRoutes(app: FastifyInstance, db: DB) {
  const secret = process.env.DEV_TOKEN;
  if (!secret) return false;

  const authorised = (request: FastifyRequest, reply: FastifyReply): boolean => {
    const given = request.headers['x-dev-token'];
    const supplied = Buffer.from(typeof given === 'string' ? given : '');
    const expected = Buffer.from(secret);

    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      // 404, not 403 — same shape as a server with the feature disabled.
      reply.code(404).send({ error: 'not found' });
      return false;
    }
    return true;
  };

  /** Every user, provisioned or not, so a seat can be impersonated before use. */
  app.get('/api/v1/dev/users', async (request, reply) => {
    if (!authorised(request, reply)) return;
    return {
      users: db
        .prepare(
          `SELECT id, display_name, avatar_color, created_at,
                  invite_code IS NULL AS provisioned, sign_in_code
             FROM users ORDER BY created_at`,
        )
        .all()
        .map((u) => ({ ...(u as object), provisioned: (u as { provisioned: number }).provisioned === 1 })),
    };
  });

  /**
   * A real token row, labelled `dev` so it is visible and revocable alongside
   * every other session rather than being a hidden back door.
   */
  app.post<{ Body: { user_id?: string } }>('/api/v1/dev/token', async (request, reply) => {
    if (!authorised(request, reply)) return;

    const userId = request.body?.user_id;
    if (!userId) return reply.code(400).send({ error: 'user_id is required' });

    const user = db
      .prepare('SELECT id, display_name, avatar_color FROM users WHERE id = ?')
      .get(userId) as { id: string; display_name: string; avatar_color: string } | undefined;
    if (!user) return reply.code(404).send({ error: 'no such user' });

    const token = mintToken();
    db.prepare(
      'INSERT INTO tokens (id, user_id, hash, label, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(newId(), user.id, hashToken(token), 'dev', new Date().toISOString());

    app.log.warn(`dev impersonation token issued for ${user.display_name}`);
    return { token, user };
  });

  /**
   * Recently deleted photos, so a mis-tap can be undone.
   *
   * Deliberately behind the dev token rather than exposed in the app: putting a
   * trash bin in the UI means one tap can resurrect an image someone chose to
   * get rid of, and the person who deleted it may have meant it. Restoring is a
   * request someone makes out loud.
   */
  app.get('/api/v1/dev/media/trash', async (request, reply) => {
    if (!authorised(request, reply)) return;

    const rows = db
      .prepare(
        `SELECT m.id, m.taken_on, m.deleted_at, m.storage_path, u.display_name
           FROM media m JOIN users u ON u.id = m.user_id
          WHERE m.deleted_at IS NOT NULL
          ORDER BY m.deleted_at DESC`,
      )
      .all() as {
      id: string;
      taken_on: string;
      deleted_at: string;
      storage_path: string;
      display_name: string;
    }[];

    return {
      retention_days: TRASH_RETENTION_DAYS,
      trash: rows.map((row) => ({
        id: row.id,
        owner: row.display_name,
        taken_on: row.taken_on,
        deleted_at: row.deleted_at,
        expires_at: new Date(
          new Date(row.deleted_at).getTime() + TRASH_RETENTION_DAYS * 86_400_000,
        ).toISOString(),
        file_present: existsSync(row.storage_path),
      })),
    };
  });

  /** Put a photo back. It returns private, whatever it was before. */
  app.post<{ Params: { id: string } }>(
    '/api/v1/dev/media/:id/restore',
    async (request, reply) => {
      if (!authorised(request, reply)) return;

      const row = db
        .prepare('SELECT * FROM media WHERE id = ? AND deleted_at IS NOT NULL')
        .get(request.params.id) as
        | { id: string; user_id: string; storage_path: string }
        | undefined;
      if (!row) return reply.code(404).send({ error: 'nothing in the trash with that id' });

      const restoredPath = resolve(MEDIA_DIR, row.user_id, row.storage_path.split('/').pop()!);
      await mkdir(dirname(restoredPath), { recursive: true });
      try {
        await rename(row.storage_path, restoredPath);
      } catch {
        return reply.code(409).send({ error: 'the file is gone; only the row remains' });
      }

      const now = new Date().toISOString();
      db.prepare(
        'UPDATE media SET deleted_at = NULL, storage_path = ?, updated_at = ?, server_seq = ? WHERE id = ?',
      ).run(restoredPath, now, nextSeq(db), row.id);

      // Private on the way back: sharing was a deliberate act and consent does
      // not survive a round trip through the bin (§9.1).
      db.prepare("UPDATE media SET visibility = 'private', shared_at = NULL WHERE id = ?").run(row.id);

      app.log.warn(`restored photo ${row.id} from trash`);
      return { restored: row.id, visibility: 'private' };
    },
  );

  /** Drop every dev token without touching anyone's real sessions. */
  app.post('/api/v1/dev/revoke', async (request, reply) => {
    if (!authorised(request, reply)) return;
    const result = db
      .prepare("UPDATE tokens SET revoked_at = ? WHERE label = 'dev' AND revoked_at IS NULL")
      .run(new Date().toISOString());
    return { revoked: result.changes };
  });

  return true;
}
