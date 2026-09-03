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
  'reactions',
  'media',
] as const;

function pull(db: DB, since: number, viewerId: string) {
  const rows = Object.fromEntries(
    PULLED_TABLES.map((table) => [
      table,
      db.prepare(`SELECT * FROM ${table} WHERE server_seq > ? ORDER BY server_seq`).all(since),
    ]),
  ) as Record<string, Record<string, unknown>[]>;

  /*
   * §10 says to sync the metadata row — the bytes are what stay out of the
   * payload. Without this the client's media table is always empty, so the rolling
   * "Photo 0/1" never moved even after an upload.
   *
   * §9.2 still holds: another member's private row must not transmit at all,
   * not even its id or storage path. `storage_path` is dropped from every row,
   * owner included, because no client has any use for it.
   */
  rows.media = rows.media
    .filter((row) => !row.deleted_at)
    .filter((row) => row.user_id === viewerId || row.visibility === 'shared')
    .map(({ storage_path: _path, thumb_path: _thumb, ...rest }) => rest);

  /*
   * §9.3: the "photo taken ✓" stays visible to everyone regardless of the
   * photo's visibility — they see the habit was kept, and the image only if it
   * was shared. Dates alone carry that, with no id and nothing fetchable.
   */
  const photoDays = db
    .prepare(
      'SELECT DISTINCT user_id, taken_on FROM media WHERE deleted_at IS NULL ORDER BY taken_on',
    )
    .all();

  /*
   * A reaction on a private photo would otherwise disclose that the photo
   * exists — the one thing §9.2 says must never reach the partner.
   */
  rows.reactions = rows.reactions.filter((reaction) => {
    if (reaction.target_kind !== 'photo' || !reaction.target_media_id) return true;
    const media = db
      .prepare('SELECT user_id, visibility FROM media WHERE id = ?')
      .get(reaction.target_media_id) as { user_id: string; visibility: string } | undefined;
    return !!media && (media.user_id === viewerId || media.visibility === 'shared');
  });

  return { cursor: currentSeq(db), server_date: today(), rows, photo_days: photoDays };
}

export function registerSyncRoutes(app: FastifyInstance, db: DB) {
  const requireAuth = authenticate(db);

  app.get<{ Querystring: { since?: string } }>(
    '/api/v1/sync',
    { preHandler: requireAuth },
    async (request) => ({
      ...pull(db, Number(request.query.since ?? 0), request.user!.id),
      rejected: [],
    }),
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

      return { ...pull(db, Number(request.body?.since ?? 0), request.user!.id), rejected };
    },
  );
}
