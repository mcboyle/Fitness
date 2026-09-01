import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hashToken, mintToken } from '../auth';
import { type DB, newId } from '../db';

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
