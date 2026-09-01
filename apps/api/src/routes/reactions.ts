import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth';
import { type DB, newId, nextSeq } from '../db';

interface Body {
  target_kind?: 'day' | 'photo' | 'measurement';
  target_date?: string;
  target_media_id?: string;
  emoji?: string;
  body?: string;
}

export function registerReactionRoutes(app: FastifyInstance, db: DB) {
  const requireAuth = authenticate(db);

  /**
   * §9.5: you can only react to what you can see. A private photo generates no
   * reaction affordance for the partner, and this is the server-side half of
   * that — a hand-rolled request must fail the same way the missing button does.
   */
  app.post<{ Body: Body }>('/api/v1/reactions', { preHandler: requireAuth }, async (request, reply) => {
    const { target_kind, target_date, target_media_id, emoji, body } = request.body ?? {};
    if (!target_kind || !emoji) {
      return reply.code(400).send({ error: 'target_kind and emoji are required' });
    }

    if (target_kind === 'photo') {
      if (!target_media_id) return reply.code(400).send({ error: 'target_media_id is required' });

      const media = db
        .prepare('SELECT user_id, visibility FROM media WHERE id = ?')
        .get(target_media_id) as { user_id: string; visibility: string } | undefined;

      const canSee =
        media && (media.user_id === request.user!.id || media.visibility === 'shared');
      if (!canSee) return reply.code(404).send({ error: 'no such photo' });
    }

    const id = newId();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO reactions (id, from_user_id, target_kind, target_date, target_media_id,
                              emoji, body, seen_at, created_at, updated_at, server_seq)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
    ).run(
      id, request.user!.id, target_kind, target_date ?? null, target_media_id ?? null,
      emoji, body ?? null, now, now, nextSeq(db),
    );

    return { id };
  });

  /** Unseen reactions surface as an in-app badge on next open — pull, not push. */
  app.post<{ Params: { id: string } }>(
    '/api/v1/reactions/:id/seen',
    { preHandler: requireAuth },
    async (request, reply) => {
      const row = db
        .prepare('SELECT from_user_id FROM reactions WHERE id = ?')
        .get(request.params.id) as { from_user_id: string } | undefined;
      if (!row) return reply.code(404).send({ error: 'no such reaction' });

      // Only the recipient marks it seen; the author never can.
      if (row.from_user_id === request.user!.id) {
        return reply.code(403).send({ error: 'you cannot mark your own reaction seen' });
      }

      const now = new Date().toISOString();
      db.prepare(
        'UPDATE reactions SET seen_at = ?, updated_at = ?, server_seq = ? WHERE id = ?',
      ).run(now, now, nextSeq(db), request.params.id);
      return { id: request.params.id, seen_at: now };
    },
  );
}
