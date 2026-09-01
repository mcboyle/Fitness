import { useMemo } from 'react';
import {
  addDays,
  applyPauses,
  dayState,
  pausedDates,
  today,
  type DailyLog,
  type IsoDate,
  type UserSettings,
} from '@lifestyle/shared';
import { Card } from './ui';

interface PauseRow {
  user_id: string;
  start_date: IsoDate;
  end_date: IsoDate;
  status: string;
  created_at: string;
}

/**
 * Both streaks on one grid — the thing that makes this different from two
 * people using separate trackers (§11), which is why the spec says build it
 * rather than defer it.
 */
export function CalendarView({
  myUserId,
  myName,
  partnerId,
  partnerName,
  logs,
  pauses,
  settings,
  startDate,
  days = 35,
}: {
  myUserId: string;
  myName: string;
  partnerId: string | null;
  partnerName: string;
  logs: DailyLog[];
  pauses: PauseRow[];
  settings: UserSettings;
  /** Days before the challenge began are not misses — they are not days yet. */
  startDate?: IsoDate;
  days?: number;
}) {
  const now = today();
  const dates = useMemo(
    () => Array.from({ length: days }, (_, i) => addDays(now, i - (days - 1))),
    [days, now],
  );

  const rows = useMemo(() => {
    const byUser = new Map<string, Map<IsoDate, DailyLog>>();
    for (const log of logs) {
      if (!byUser.has(log.user_id)) byUser.set(log.user_id, new Map());
      byUser.get(log.user_id)!.set(log.date, log);
    }
    for (const [userId, map] of byUser) {
      byUser.set(userId, applyPauses(map, pausedDates(pauses, userId)));
    }
    return byUser;
  }, [logs, pauses]);

  // The partner's row renders even when she has logged nothing — otherwise
  // "both streaks on one grid" is a single row until she happens to log,
  // which reads as the feature being broken.
  const userIds = [
    myUserId,
    ...new Set([
      ...(partnerId ? [partnerId] : []),
      ...[...rows.keys()].filter((id) => id !== myUserId),
    ]),
  ];

  return (
    <Card>
      <h2 className="text-ink mb-1 text-sm font-bold tracking-wide uppercase">
        Last {days} days
      </h2>
      <p className="text-faint mb-4 text-xs">Both streaks, one grid.</p>

      <div className="grid gap-4">
        {userIds.map((userId) => (
          <div key={userId}>
            <div className="text-muted mb-2 text-xs font-semibold">
              {userId === myUserId ? myName : partnerName}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {dates.map((date) => {
                const before = startDate ? date < startDate : false;
                const state = before
                  ? 'outside'
                  : dayState(rows.get(userId)?.get(date), settings, date, now);
                return (
                  <div
                    key={date}
                    title={`${date} — ${state === 'outside' ? 'before the challenge' : state}`}
                    aria-label={`${date}: ${state === 'outside' ? 'before the challenge' : state}`}
                    className="aspect-square rounded-md"
                    style={{
                      background: COLOURS[state],
                      opacity: state === 'future' || state === 'outside' ? 0.35 : 1,
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <ul className="text-faint mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {(['complete', 'missed', 'paused', 'in-progress'] as const).map((state) => (
          <li key={state} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: COLOURS[state] }} />
            {LABELS[state]}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* Paused days must never look like success (§7) — grey, not green. */
const COLOURS: Record<string, string> = {
  complete: 'var(--ok)',
  missed: 'var(--ring-workout)',
  paused: 'var(--paused)',
  'in-progress': 'var(--ring-track)',
  future: 'var(--ring-track)',
  outside: 'var(--ring-track)',
};

const LABELS: Record<string, string> = {
  complete: 'complete',
  missed: 'missed',
  paused: 'paused',
  'in-progress': 'today',
};
