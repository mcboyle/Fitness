import type { SyncOp, SyncPayload, SyncRejection } from '@lifestyle/shared';
import { db, type OutboxOp } from '../db/db';
import { api, ApiError } from './client';
import { getSession } from './session';

const CURSOR_KEY = 'lt.sync_cursor';

function cursor(): number {
  return Number(localStorage.getItem(CURSOR_KEY) ?? 0);
}

function setCursor(value: number) {
  localStorage.setItem(CURSOR_KEY, String(value));
}

export type SyncListener = (state: {
  status: 'idle' | 'syncing' | 'offline' | 'error';
  pending: number;
  rejections: SyncRejection[];
}) => void;

let listener: SyncListener | null = null;
export function onSync(fn: SyncListener | null) {
  listener = fn;
}

let running = false;

/** Enqueue a write. Called after the local row has already been updated. */
export async function enqueue(op: Omit<SyncOp, 'op_id'>) {
  const entry: OutboxOp = {
    ...op,
    op_id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    created_at: new Date().toISOString(),
  };
  await db.outbox.add(entry);
  void sync();
}

/**
 * Push everything queued, then adopt whatever the server returns.
 *
 * The queue is drained in one request and only deleted once the server has
 * accepted it, so a failed push leaves the ops in place to retry. Ops are
 * idempotent by `op_id`, which makes a retry after an ambiguous failure safe.
 */
export async function sync(): Promise<void> {
  if (running || !getSession()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    listener?.({ status: 'offline', pending: await db.outbox.count(), rejections: [] });
    return;
  }

  running = true;
  try {
    const pending = await db.outbox.orderBy('id').toArray();
    listener?.({ status: 'syncing', pending: pending.length, rejections: [] });

    const ops: SyncOp[] = pending.map(({ id: _id, created_at: _created, ...op }) => op);
    const payload =
      ops.length > 0
        ? await api<SyncPayload>('/sync', {
            method: 'POST',
            body: JSON.stringify({ since: cursor(), ops }),
          })
        : await api<SyncPayload>(`/sync?since=${cursor()}`);

    await applyServerRows(payload);

    if (pending.length > 0) {
      await db.outbox.bulkDelete(pending.map((op) => op.id!).filter((id) => id != null));
    }
    setCursor(payload.cursor);

    listener?.({
      status: 'idle',
      pending: await db.outbox.count(),
      rejections: payload.rejected ?? [],
    });
  } catch (error) {
    const offline = !(error instanceof ApiError);
    listener?.({
      status: offline ? 'offline' : 'error',
      pending: await db.outbox.count(),
      rejections: [],
    });
  } finally {
    running = false;
  }
}

/**
 * Server rows are written straight to the local tables and deliberately do NOT
 * go through repo, which would enqueue them again and loop.
 *
 * A rejected op is already absent from these rows in its old form, so adopting
 * the server's version is what reverts a locked-day edit.
 */
async function applyServerRows(payload: SyncPayload) {
  const rows = payload.rows as unknown as Record<string, Record<string, unknown>[]>;

  await db.transaction(
    'rw',
    [
      db.daily_log,
      db.user_settings,
      db.measurements,
      db.documentaries,
      db.challenges,
      db.challenge_members,
      db.pauses,
    ],
    async () => {
      for (const [table, list] of Object.entries(rows)) {
        if (!Array.isArray(list) || list.length === 0) continue;
        const target = (db as unknown as Record<string, { bulkPut: (r: unknown[]) => Promise<unknown> }>)[table];
        if (!target?.bulkPut) continue;
        await target.bulkPut(list.map(normalise));
      }
    },
  );
}

/** SQLite has no boolean type, so integers come back where the client wants bools. */
const BOOLEAN_FIELDS = new Set([
  'whole_food', 'no_alcohol', 'no_junk_food', 'self_care', 'journaled',
  'logged_late', 'paused', 'is_shared',
]);

function normalise(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = BOOLEAN_FIELDS.has(key) ? value === 1 || value === true : value;
  }
  return out;
}

/** Foreground and a slow poll while open — pull, not push (§10). */
export function startSyncLoop(): () => void {
  const tick = () => void sync();
  const interval = window.setInterval(tick, 60_000);
  window.addEventListener('focus', tick);
  window.addEventListener('online', tick);
  document.addEventListener('visibilitychange', tick);
  tick();

  return () => {
    window.clearInterval(interval);
    window.removeEventListener('focus', tick);
    window.removeEventListener('online', tick);
    document.removeEventListener('visibilitychange', tick);
  };
}
