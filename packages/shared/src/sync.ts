import type { DailyLog, Measurement, Documentary, UserSettings } from './types';
import type { IsoDate } from './time';

/** Tables a client may write through the generic sync endpoint. */
export const SYNCED_TABLES = [
  'daily_log',
  'user_settings',
  'measurements',
  'documentaries',
] as const;

export type SyncedTable = (typeof SYNCED_TABLES)[number];

export interface SyncOp {
  /** Client-generated, so a retried push is idempotent. */
  op_id: string;
  table: SyncedTable;
  /** `daily_log` is keyed by date; the rest by id. `user_settings` by user_id. */
  key: string;
  patch: Record<string, unknown>;
  /** The client's clock, used only to order writes — never as a cursor. */
  updated_at: string;
}

export interface SyncRejection {
  op_id: string;
  reason: 'edit_window' | 'not_owner' | 'unknown_table' | 'invalid';
  message: string;
  /** Present for edit_window, so the client can grey out locked days. */
  server_date?: IsoDate;
}

export interface SyncPayload {
  cursor: number;
  server_date: IsoDate;
  rows: {
    daily_log: DailyLog[];
    user_settings: UserSettings[];
    measurements: Measurement[];
    documentaries: Documentary[];
    challenges: unknown[];
    challenge_members: unknown[];
    pauses: unknown[];
    media: unknown[];
  };
  /** Dates only: the completion signal without the artifact (§9.3). */
  photo_days: { user_id: string; taken_on: IsoDate }[];
  rejected: SyncRejection[];
}

/**
 * Counters only climb during a day, so a write that arrives *late* may still
 * carry taps the server never saw. For these fields a stale op raises the
 * stored value but can never lower it.
 *
 * A *newer* op always wins outright, including lowering — otherwise the "−8 oz"
 * button and any genuine correction downward would be silently ignored.
 */
export const COUNTER_FIELDS = new Set([
  'water_oz',
  'pages_read',
  'steps',
  'workout_minutes',
]);
