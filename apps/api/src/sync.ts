import {
  COUNTER_FIELDS,
  isEditable,
  today,
  type SyncOp,
  type SyncRejection,
} from '@lifestyle/shared';
import { type DB, nextSeq } from './db';

/** Columns a client may set, per table. Anything else is ignored, not trusted. */
const WRITABLE: Record<string, string[]> = {
  daily_log: [
    'challenge_id', 'steps', 'steps_bucket', 'sleep_minutes', 'water_oz',
    'pages_read', 'workout_minutes', 'workout_type', 'whole_food', 'no_alcohol',
    'no_junk_food', 'self_care', 'journaled', 'logged_late', 'device_id',
    'breakfast', 'lunch', 'dinner',
  ],
  user_settings: [
    'goal_water_oz', 'goal_pages', 'goal_steps', 'goal_workout_minutes',
    'goal_sleep_minutes', 'completion_threshold', 'step_entry_mode', 'theme',
    'ring_layout',
  ],
  measurements: [
    'taken_on', 'weight_lb', 'waist_in', 'hip_in', 'arm_in', 'thigh_in', 'notes',
    'deleted_at',
  ],
  documentaries: ['watched_on', 'title', 'notes', 'deleted_at'],
};

/**
 * Columns the server fills on insert that a client never sends. Without these
 * an INSERT violates NOT NULL and the whole push 500s — and because writes are
 * local-first, the UI shows success while the op retries in the outbox
 * forever. See MISTAKES.md #9.
 */
const INSERT_DEFAULTS: Record<string, () => Record<string, unknown>> = {
  measurements: () => ({ created_at: new Date().toISOString() }),
  documentaries: () => ({ created_at: new Date().toISOString() }),
};

const KEY_COLUMN: Record<string, string> = {
  daily_log: 'date',
  user_settings: 'user_id',
  measurements: 'id',
  documentaries: 'id',
};

function toSqlValue(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || typeof value === 'string') return value;
  return null;
}

/**
 * Merge one op into the stored row.
 *
 * Newer than what's stored → the op wins for every field it names, including
 * lowering a counter, so the "−8 oz" button and any deliberate correction work.
 *
 * Older than what's stored → normally discarded, but counters take the max.
 * Water, pages, steps and workout minutes only climb during a day, so a write
 * that arrives late may still carry taps the server never saw; raising is safe
 * and losing them is not.
 */
export function mergeRow(
  stored: Record<string, unknown> | undefined,
  patch: Record<string, unknown>,
  opUpdatedAt: string,
  allowed: string[],
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  const isNewer = !stored || opUpdatedAt > String(stored.updated_at ?? '');

  for (const [field, value] of Object.entries(patch)) {
    if (!allowed.includes(field)) continue;

    if (isNewer) {
      next[field] = value;
      continue;
    }

    if (COUNTER_FIELDS.has(field) && typeof value === 'number') {
      const current = typeof stored[field] === 'number' ? (stored[field] as number) : 0;
      if (value > current) next[field] = value;
    }
  }

  return next;
}

export function applyOps(db: DB, userId: string, ops: SyncOp[]): SyncRejection[] {
  const rejected: SyncRejection[] = [];
  const serverDate = today();

  const apply = db.transaction(() => {
    for (const op of ops) {
      const allowed = WRITABLE[op.table];
      const keyColumn = KEY_COLUMN[op.table];

      if (!allowed || !keyColumn) {
        rejected.push({ op_id: op.op_id, reason: 'unknown_table', message: `unknown table ${op.table}` });
        continue;
      }

      /*
       * §6: only today and yesterday are editable, enforced here because a
       * client that permits editing any past date turns the streak into
       * decoration regardless of what its UI shows. The server's own date goes
       * back so the client can grey out locked days rather than failing
       * silently.
       */
      if (op.table === 'daily_log' && !isEditable(op.key, serverDate)) {
        rejected.push({
          op_id: op.op_id,
          reason: 'edit_window',
          message: `${op.key} is outside the edit window`,
          server_date: serverDate,
        });
        continue;
      }

      const keyValue = op.table === 'user_settings' ? userId : op.key;
      const stored = db
        .prepare(
          op.table === 'daily_log'
            ? `SELECT * FROM daily_log WHERE user_id = ? AND date = ?`
            : `SELECT * FROM ${op.table} WHERE ${keyColumn} = ?`,
        )
        .get(...(op.table === 'daily_log' ? [userId, keyValue] : [keyValue])) as
        | Record<string, unknown>
        | undefined;

      // Each user writes only their own rows (§10); that is what removes the
      // whole class of concurrent-edit conflicts, so it has to be true.
      if (stored && stored.user_id !== userId) {
        rejected.push({ op_id: op.op_id, reason: 'not_owner', message: 'row belongs to the partner' });
        continue;
      }

      const merged = mergeRow(stored, op.patch, op.updated_at, allowed);
      const seq = nextSeq(db);
      const updatedAt = stored && op.updated_at <= String(stored.updated_at)
        ? String(stored.updated_at)
        : op.updated_at;

      if (stored) {
        if (Object.keys(merged).length === 0) {
          // Nothing survived the merge; still bump the cursor so the client
          // learns the authoritative row and stops retrying.
          db.prepare(`UPDATE ${op.table} SET server_seq = ? WHERE ${op.table === 'daily_log' ? 'user_id = ? AND date = ?' : keyColumn + ' = ?'}`)
            .run(...(op.table === 'daily_log' ? [seq, userId, keyValue] : [seq, keyValue]));
          continue;
        }
        const sets = Object.keys(merged).map((f) => `${f} = ?`).join(', ');
        const values = Object.values(merged).map(toSqlValue);
        db.prepare(
          `UPDATE ${op.table} SET ${sets}, updated_at = ?, server_seq = ? WHERE ${
            op.table === 'daily_log' ? 'user_id = ? AND date = ?' : `${keyColumn} = ?`
          }`,
        ).run(...values, updatedAt, seq, ...(op.table === 'daily_log' ? [userId, keyValue] : [keyValue]));
      } else {
        const defaults = INSERT_DEFAULTS[op.table]?.() ?? {};
        const columns = [
          'user_id', keyColumn, ...Object.keys(merged), ...Object.keys(defaults),
          'updated_at', 'server_seq',
        ];
        const values = [
          userId, keyValue, ...Object.values(merged).map(toSqlValue),
          ...Object.values(defaults).map(toSqlValue), updatedAt, seq,
        ];
        const unique = columns.filter((c, i) => columns.indexOf(c) === i);
        const uniqueValues = unique.map((c) => values[columns.indexOf(c)]);
        db.prepare(
          `INSERT INTO ${op.table} (${unique.join(', ')}) VALUES (${unique.map(() => '?').join(', ')})`,
        ).run(...uniqueValues);
      }
    }
  });

  apply();
  return rejected;
}
