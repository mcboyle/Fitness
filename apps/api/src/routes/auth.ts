import { DEFAULT_SETTINGS } from '@lifestyle/shared';
import type { FastifyInstance } from 'fastify';
import { authenticate, mintToken, hashToken } from '../auth';
import { type DB, newId, newInviteCode, nextSeq } from '../db';

/**
 * BUILDSPEC §2 and §15 make this a two-person app and rule out multi-tenancy.
 * Raised to 20 on request. Only *provisioned* users — those who have claimed a
 * code — are ever listed; unclaimed placeholders stay invisible.
 */
export const MAX_USERS = 20;

const AVATAR_COLORS = [
  'var(--ring-workout)', 'var(--ring-water)', 'var(--ring-reading)',
  'var(--ring-steps)', 'var(--ring-sleep)', 'var(--ring-eating)',
  'var(--ring-journal)', 'var(--ring-alcohol)', 'var(--ring-selfcare)',
];

interface CodeBody {
  invite_code?: string;
  code?: string;
  display_name?: string;
}

/** A user who has actually joined. `invite_code IS NULL` means claimed. */
const PROVISIONED = 'invite_code IS NULL';

export function registerAuthRoutes(app: FastifyInstance, db: DB) {
  const requireAuth = authenticate(db);

  /**
   * Redeem an invite code. Single-use: the code is cleared on success, so a
   * shared screenshot can't be replayed.
   *
   * A reusable `sign_in_code` is issued at the same time. That is what makes
   * signing in again possible — iOS gives an installed web app its own storage,
   * separate from Safari, so the session does not survive Add to Home Screen and
   * a single-use code would strand whoever installed after signing in.
   */
  app.post<{ Body: CodeBody }>('/api/v1/claim', async (request, reply) => {
    const code = request.body?.invite_code?.trim().toUpperCase();
    const displayName = request.body?.display_name?.trim();

    if (!code) return reply.code(400).send({ error: 'invite_code is required' });
    if (!displayName) return reply.code(400).send({ error: 'display_name is required' });

    const user = db
      .prepare('SELECT id FROM users WHERE invite_code = ?')
      .get(code) as { id: string } | undefined;

    if (!user) return reply.code(404).send({ error: 'unknown or already-used invite code' });

    const token = mintToken();
    const signInCode = newInviteCode(10);
    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare(
        'UPDATE users SET display_name = ?, invite_code = NULL, sign_in_code = ? WHERE id = ?',
      ).run(displayName, signInCode, user.id);
      db.prepare(
        'INSERT INTO tokens (id, user_id, hash, label, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(newId(), user.id, hashToken(token), 'claim', now);
      db.prepare(
        `INSERT OR IGNORE INTO user_settings
           (user_id, goal_water_oz, goal_pages, goal_steps, goal_workout_minutes,
            goal_sleep_minutes, completion_threshold, step_entry_mode, theme,
            ring_layout, updated_at, server_seq)
         VALUES (@user_id, @goal_water_oz, @goal_pages, @goal_steps,
                 @goal_workout_minutes, @goal_sleep_minutes, @completion_threshold,
                 @step_entry_mode, @theme, @ring_layout, @updated_at, @server_seq)`,
      ).run({ user_id: user.id, ...DEFAULT_SETTINGS, updated_at: now, server_seq: nextSeq(db) });
    })();

    const claimed = db
      .prepare('SELECT id, display_name, avatar_color, sign_in_code FROM users WHERE id = ?')
      .get(user.id);

    return { token, user: claimed };
  });

  /**
   * Sign in again with the reusable code. Unlike claiming, this changes nothing
   * about the account — it only mints another token, so the client must not
   * treat it as a fresh start and wipe local data.
   */
  app.post<{ Body: CodeBody }>('/api/v1/signin', async (request, reply) => {
    const code = request.body?.code?.trim().toUpperCase();
    if (!code) return reply.code(400).send({ error: 'code is required' });

    const user = db
      .prepare(`SELECT id, display_name, avatar_color FROM users WHERE sign_in_code = ? AND ${PROVISIONED}`)
      .get(code) as { id: string; display_name: string; avatar_color: string } | undefined;

    if (!user) return reply.code(404).send({ error: 'unknown sign-in code' });

    const token = mintToken();
    db.prepare(
      'INSERT INTO tokens (id, user_id, hash, label, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(newId(), user.id, hashToken(token), 'signin', new Date().toISOString());

    return { token, user };
  });

  app.get('/api/v1/me', { preHandler: requireAuth }, async (request) => {
    const self = db
      .prepare('SELECT id, display_name, avatar_color, sign_in_code FROM users WHERE id = ?')
      .get(request.user!.id);

    // Only provisioned users are listed. An unclaimed placeholder must not leak
    // that a seat exists, and it has nothing to show anyway.
    const members = db
      .prepare(
        `SELECT id, display_name, avatar_color FROM users
          WHERE ${PROVISIONED} AND id != ? ORDER BY created_at`,
      )
      .all(request.user!.id) as { id: string; display_name: string }[];

    return {
      user: self,
      members,
      // Kept for the existing two-person UI; null once there is more than one.
      partner: members.length === 1 ? members[0] : null,
      seats: { used: db.prepare('SELECT COUNT(*) c FROM users').get() as { c: number }, max: MAX_USERS },
    };
  });

  /** Mint an invite for a new member, up to MAX_USERS. */
  app.post('/api/v1/invite', { preHandler: requireAuth }, async (_request, reply) => {
    const outstanding = db
      .prepare('SELECT id, invite_code FROM users WHERE invite_code IS NOT NULL')
      .get() as { id: string; invite_code: string } | undefined;

    // Idempotent: an unclaimed invite already exists, so hand back the same one
    // rather than burning a seat every time someone taps the button.
    if (outstanding) return { invite_code: outstanding.invite_code };

    const total = (db.prepare('SELECT COUNT(*) c FROM users').get() as { c: number }).c;
    if (total >= MAX_USERS) {
      return reply.code(409).send({ error: `all ${MAX_USERS} seats are taken` });
    }

    const code = newInviteCode();
    db.prepare(
      'INSERT INTO users (id, display_name, avatar_color, invite_code, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(newId(), 'Invited', AVATAR_COLORS[total % AVATAR_COLORS.length], code, new Date().toISOString());

    return { invite_code: code };
  });
}

/**
 * On an empty database there is nobody to authenticate, so the first invite
 * code is printed at boot. Only useful to whoever can read the server's log.
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
