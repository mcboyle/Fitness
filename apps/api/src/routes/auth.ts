import { DEFAULT_SETTINGS } from '@lifestyle/shared';
import type { FastifyInstance } from 'fastify';
import { authenticate, mintToken, hashToken } from '../auth';
import { type DB, newId, newInviteCode, nextSeq } from '../db';

const AVATAR_COLORS = ['var(--pink-hot)', 'var(--blue-water)'];

interface ClaimBody {
  invite_code?: string;
  display_name?: string;
}

export function registerAuthRoutes(app: FastifyInstance, db: DB) {
  const requireAuth = authenticate(db);

  /**
   * Redeem an invite code for a bearer token. Single-use: the code is cleared
   * on success, so a shared screenshot can't be replayed.
   *
   * There is no email and no password reset (§12). Losing the token means
   * being re-invited, which for two people is a conversation, not a flow.
   */
  app.post<{ Body: ClaimBody }>('/api/v1/claim', async (request, reply) => {
    const code = request.body?.invite_code?.trim().toUpperCase();
    const displayName = request.body?.display_name?.trim();

    if (!code) return reply.code(400).send({ error: 'invite_code is required' });
    if (!displayName) return reply.code(400).send({ error: 'display_name is required' });

    const user = db
      .prepare('SELECT id FROM users WHERE invite_code = ?')
      .get(code) as { id: string } | undefined;

    if (!user) return reply.code(404).send({ error: 'unknown or already-used invite code' });

    const token = mintToken();
    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare('UPDATE users SET display_name = ?, invite_code = NULL WHERE id = ?').run(
        displayName,
        user.id,
      );
      db.prepare(
        'INSERT INTO tokens (id, user_id, hash, label, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(newId(), user.id, hashToken(token), 'claim', now);

      // Seed settings from the same defaults the client uses, so the two can't
      // disagree about the completion threshold and therefore about the streak.
      db.prepare(
        `INSERT OR IGNORE INTO user_settings
           (user_id, goal_water_oz, goal_pages, goal_steps, goal_workout_minutes,
            goal_sleep_minutes, completion_threshold, step_entry_mode, theme,
            ring_layout, updated_at, server_seq)
         VALUES (@user_id, @goal_water_oz, @goal_pages, @goal_steps,
                 @goal_workout_minutes, @goal_sleep_minutes, @completion_threshold,
                 @step_entry_mode, @theme, @ring_layout, @updated_at, @server_seq)`,
      ).run({
        user_id: user.id,
        ...DEFAULT_SETTINGS,
        updated_at: now,
        server_seq: nextSeq(db),
      });
    })();

    const claimed = db
      .prepare('SELECT id, display_name, avatar_color FROM users WHERE id = ?')
      .get(user.id);

    return { token, user: claimed };
  });

  app.get('/api/v1/me', { preHandler: requireAuth }, async (request) => {
    const partner = db
      .prepare(
        'SELECT id, display_name, avatar_color, invite_code IS NOT NULL AS pending FROM users WHERE id != ?',
      )
      .get(request.user!.id) as
      | { id: string; display_name: string; avatar_color: string; pending: number }
      | undefined;

    return {
      user: request.user,
      partner: partner ? { ...partner, pending: partner.pending === 1 } : null,
    };
  });

  /**
   * Mint the partner's invite code on demand. Idempotent: calling it again
   * returns the existing unclaimed code rather than inventing a second user —
   * this app is for exactly two people (§2).
   */
  app.post('/api/v1/invite', { preHandler: requireAuth }, async (request, reply) => {
    const others = db
      .prepare('SELECT id, invite_code FROM users WHERE id != ?')
      .all(request.user!.id) as { id: string; invite_code: string | null }[];

    if (others.length > 1) {
      return reply.code(409).send({ error: 'this app is for two people' });
    }

    const existing = others[0];
    if (existing?.invite_code) return { invite_code: existing.invite_code };
    if (existing) return reply.code(409).send({ error: 'partner has already joined' });

    const code = newInviteCode();
    db.prepare(
      'INSERT INTO users (id, display_name, avatar_color, invite_code, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(newId(), 'Partner', AVATAR_COLORS[1], code, new Date().toISOString());

    return { invite_code: code };
  });
}

/**
 * On an empty database there is nobody to authenticate, so the first invite
 * code is printed to the log at boot. Nothing is exposed by this — the code is
 * only useful to whoever can read the server's output.
 */
export function ensureBootstrapUser(db: DB, log: (msg: string) => void) {
  const count = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  if (count > 0) return;

  const code = newInviteCode();
  db.prepare(
    'INSERT INTO users (id, display_name, avatar_color, invite_code, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(newId(), 'You', AVATAR_COLORS[0], code, new Date().toISOString());

  log(`no users yet — claim this app with invite code: ${code}`);
}
