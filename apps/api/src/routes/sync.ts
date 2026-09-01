import { today, type SyncOp } from '@lifestyle/shared';
import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth';
import { currentSeq, type DB } from '../db';
import { applyOps } from '../sync';
import { recomputeMemberStats } from '../streaks';

/** Everything is mutually visible (§1); private photos are the Phase 3 exception. */
const PULLED_TABLES = [
  'user_settings',
  'daily_log',
  'measurements',
  'documentaries',
  'challenges',
  'challenge_members',
  'pauses',
] as const;

function pull(db: DB, since: number) {
  const rows = Object.fromEntries(
    PULLED_TABLES.map((table) => [
      table,
      db.prepare(`SELECT * FROM ${table} WHERE server_seq > ? ORDER BY server_seq`).all(since),
    ]),
  );

  return { cursor: currentSeq(db), server_date: today(), rows };
}

export function registerSyncRoutes(app: FastifyInstance, db: DB) {
  const requireAuth = authenticate(db);

  app.get<{ Querystring: { since?: string } }>(
    '/api/v1/sync',
    { preHandler: requireAuth },
    async (request) => ({ ...pull(db, Number(request.query.since ?? 0)), rejected: [] }),
  );

  app.post<{ Body: { since?: number; ops?: SyncOp[] } }>(
    '/api/v1/sync',
    { preHandler: requireAuth },
    async (request, reply) => {
      const ops = request.body?.ops ?? [];
      if (!Array.isArray(ops)) return reply.code(400).send({ error: 'ops must be an array' });

      const rejected = applyOps(db, request.user!.id, ops);

      // The streak is derived, never client-supplied — otherwise it's a number
      // the phone asserts rather than one the data supports.
      if (ops.some((op) => op.table === 'daily_log' || op.table === 'user_settings')) {
        recomputeMemberStats(db, request.user!.id);
      }

      return { ...pull(db, Number(request.body?.since ?? 0)), rejected };
    },
  );
}
