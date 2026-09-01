import Dexie, { type Table } from 'dexie';
import type { SyncOp } from '@lifestyle/shared';
import type {
  Challenge,
  ChallengeMember,
  DailyLog,
  Documentary,
  Measurement,
  Media,
  Pause,
  Reaction,
  SyncState,
  User,
  UserSettings,
} from '@lifestyle/shared';

/**
 * The local store is the app's source of truth. Every mutation writes here
 * first and the UI reads only from here, so nothing ever blocks on the network
 * (spec §10). Phase 2 adds the push/pull queue on top of exactly this schema.
 *
 * All ten tables are declared now even though Phase 1 only writes four — the
 * schema is frozen, and declaring them up front avoids a migration reshuffle
 * when Phases 2 and 3 land.
 */
class LifestyleDB extends Dexie {
  users!: Table<User, string>;
  user_settings!: Table<UserSettings, string>;
  challenges!: Table<Challenge, string>;
  challenge_members!: Table<ChallengeMember, [string, string]>;
  daily_log!: Table<DailyLog, [string, string]>;
  pauses!: Table<Pause, string>;
  media!: Table<Media, string>;
  measurements!: Table<Measurement, string>;
  documentaries!: Table<Documentary, string>;
  reactions!: Table<Reaction, string>;
  sync_state!: Table<SyncState, string>;
  /** Pending writes, oldest first. Drained by the sync engine. */
  outbox!: Table<OutboxOp, number>;

  constructor() {
    super('lifestyle-tracker');
    this.version(1).stores({
      users: 'id',
      user_settings: 'user_id',
      challenges: 'id, status, start_date',
      challenge_members: '[challenge_id+user_id], user_id',
      daily_log: '[user_id+date], date, challenge_id, updated_at',
      pauses: 'id, user_id, status, start_date',
      media: 'id, user_id, taken_on, visibility',
      measurements: 'id, user_id, taken_on',
      documentaries: 'id, user_id, watched_on',
      reactions: 'id, from_user_id, target_date, seen_at',
      sync_state: 'device_id, user_id',
    });

    /*
     * The default completion threshold moved from 3 to 4 after device testing.
     * A default only applies to fresh installs, so nudge stores that still
     * hold the old seeded value — anyone who deliberately picked something
     * else keeps it.
     */
    this.version(2).upgrade(async (tx) =>
      tx
        .table('user_settings')
        .toCollection()
        .modify((row: { completion_threshold: number }) => {
          if (row.completion_threshold === 3) row.completion_threshold = 4;
        }),
    );

    // Phase 2: the pending-write queue. Every mutation lands locally first and
    // enqueues here, so the UI never blocks on the network (§10).
    this.version(3).stores({ outbox: '++id, table, created_at' });
  }
}

export interface OutboxOp extends SyncOp {
  id?: number;
  created_at: string;
}

export const db = new LifestyleDB();
