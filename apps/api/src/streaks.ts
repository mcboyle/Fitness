import {
  applyPauses,
  bestStreak,
  computeStreak,
  isDayComplete,
  pausedDates,
  today,
  type DailyLog,
  type UserSettings,
} from '@lifestyle/shared';
import { type DB, nextSeq } from './db';

/**
 * Recomputes a member's challenge counters from the logs.
 *
 * Uses the same shared functions the client renders from, so the number on the
 * phone and the number in the database can't disagree. Cheap enough to do on
 * every push at this scale — two people and a few hundred rows.
 */
export function recomputeMemberStats(db: DB, userId: string) {
  const settings = db
    .prepare('SELECT * FROM user_settings WHERE user_id = ?')
    .get(userId) as UserSettings | undefined;
  if (!settings) return;

  const memberships = db
    .prepare(
      `SELECT cm.challenge_id, c.start_date
         FROM challenge_members cm
         JOIN challenges c ON c.id = cm.challenge_id
        WHERE cm.user_id = ? AND c.status = 'active'`,
    )
    .all(userId) as { challenge_id: string; start_date: string }[];
  if (memberships.length === 0) return;

  const pauses = db.prepare('SELECT * FROM pauses WHERE user_id = ?').all(userId) as {
    user_id: string;
    start_date: string;
    end_date: string;
    status: string;
    created_at: string;
  }[];
  const paused = pausedDates(pauses, userId);
  const now = today();

  for (const membership of memberships) {
    const logs = db
      .prepare('SELECT * FROM daily_log WHERE user_id = ? AND date >= ?')
      .all(userId, membership.start_date) as DailyLog[];

    const byDate = applyPauses(
      new Map(logs.map((log) => [log.date, { ...log, paused: !!log.paused }])),
      paused,
    );

    let completed = 0;
    let missed = 0;
    for (const [date, log] of byDate) {
      if (date > now) continue;
      if (log.paused) continue;
      if (isDayComplete(log, settings)) completed += 1;
      else if (date < now) missed += 1; // today is still in progress
    }

    db.prepare(
      `UPDATE challenge_members
          SET days_completed = ?, days_missed = ?, current_streak = ?,
              best_streak = MAX(best_streak, ?), updated_at = ?, server_seq = ?
        WHERE challenge_id = ? AND user_id = ?`,
    ).run(
      completed,
      missed,
      computeStreak(byDate, settings, now),
      bestStreak(byDate, settings),
      new Date().toISOString(),
      nextSeq(db),
      membership.challenge_id,
      userId,
    );
  }
}
