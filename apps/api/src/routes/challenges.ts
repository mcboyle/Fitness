import { addDays, effectivePauseStatus, today } from '@lifestyle/shared';
import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth';
import { type DB, newId, nextSeq } from '../db';

export function registerChallengeRoutes(app: FastifyInstance, db: DB) {
  const requireAuth = authenticate(db);

  /**
   * Start a challenge. Shared by default (§5): both users become members with
   * one start date, and each carries their own projected_end_date because a
   * pause shifts one finish and not the other's.
   */
  app.post<{ Body: { name?: string; start_date?: string; is_shared?: boolean } }>(
    '/api/v1/challenges',
    { preHandler: requireAuth },
    async (request, reply) => {
      const active = db.prepare("SELECT id FROM challenges WHERE status = 'active'").get();
      if (active) return reply.code(409).send({ error: 'a challenge is already active' });

      const startDate = request.body?.start_date ?? today();
      const isShared = request.body?.is_shared !== false;
      const targetDays = 75;
      const now = new Date().toISOString();
      const id = newId();

      const memberIds = isShared
        ? (db.prepare('SELECT id FROM users WHERE invite_code IS NULL').all() as { id: string }[]).map((u) => u.id)
        : [request.user!.id];

      db.transaction(() => {
        db.prepare(
          `INSERT INTO challenges (id, name, target_days, start_date, is_shared, status, created_at, updated_at, server_seq)
           VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
        ).run(id, request.body?.name ?? '75 Days', targetDays, startDate, isShared ? 1 : 0, now, now, nextSeq(db));

        for (const memberId of memberIds) {
          db.prepare(
            `INSERT INTO challenge_members
               (challenge_id, user_id, projected_end_date, updated_at, server_seq)
             VALUES (?, ?, ?, ?, ?)`,
          ).run(id, memberId, addDays(startDate, targetDays - 1), now, nextSeq(db));
        }
      })();

      return { id, start_date: startDate, members: memberIds };
    },
  );

  /**
   * Request a pause. A pause is a request, not a setting (§7).
   *
   * Never retroactive: pausing last week after seeing a broken streak is an
   * undo button and defeats the edit window.
   */
  app.post<{ Body: { start_date?: string; end_date?: string; reason?: string } }>(
    '/api/v1/pauses',
    { preHandler: requireAuth },
    async (request, reply) => {
      const serverDate = today();
      const startDate = request.body?.start_date ?? serverDate;
      const endDate = request.body?.end_date ?? startDate;

      if (startDate < serverDate) {
        return reply.code(422).send({
          error: 'a pause cannot start in the past',
          server_date: serverDate,
        });
      }
      if (endDate < startDate) {
        return reply.code(422).send({ error: 'end_date is before start_date' });
      }

      const challenge = db.prepare("SELECT id FROM challenges WHERE status = 'active'").get() as
        | { id: string }
        | undefined;

      const id = newId();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO pauses (id, user_id, challenge_id, start_date, end_date, reason, status, created_at, updated_at, server_seq)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      ).run(id, request.user!.id, challenge?.id ?? null, startDate, endDate, request.body?.reason ?? null, now, now, nextSeq(db));

      return { id, status: 'pending', start_date: startDate, end_date: endDate };
    },
  );

  /**
   * The partner approves or declines. The veto is real; it just can't be
   * exercised by inattention, so an unanswered request auto-approves after 24
   * hours — evaluated lazily at read time, never by a scheduler (§7).
   */
  app.post<{ Params: { id: string }; Body: { decision?: 'approve' | 'decline' } }>(
    '/api/v1/pauses/:id/resolve',
    { preHandler: requireAuth },
    async (request, reply) => {
      const pause = db.prepare('SELECT * FROM pauses WHERE id = ?').get(request.params.id) as
        | { id: string; user_id: string; status: string; created_at: string }
        | undefined;

      if (!pause) return reply.code(404).send({ error: 'no such pause' });
      if (pause.user_id === request.user!.id) {
        return reply.code(403).send({ error: 'a pause is approved by the partner, not its author' });
      }

      const effective = effectivePauseStatus(pause);
      if (effective !== 'pending') {
        return reply.code(409).send({ error: `already ${effective}`, status: effective });
      }

      const decision = request.body?.decision === 'decline' ? 'declined' : 'approved';
      const now = new Date().toISOString();
      db.prepare(
        'UPDATE pauses SET status = ?, approved_by = ?, resolved_at = ?, updated_at = ?, server_seq = ? WHERE id = ?',
      ).run(decision, request.user!.id, now, now, nextSeq(db), pause.id);

      return { id: pause.id, status: decision };
    },
  );

  /** Pending requests sit at the top of the partner's home screen (§7). */
  app.get('/api/v1/pauses', { preHandler: requireAuth }, async () => {
    const rows = db.prepare('SELECT * FROM pauses ORDER BY created_at DESC').all() as {
      status: string;
      created_at: string;
    }[];
    return {
      pauses: rows.map((row) => ({ ...row, effective_status: effectivePauseStatus(row) })),
    };
  });
}
