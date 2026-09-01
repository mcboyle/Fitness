import { useMemo, useState } from 'react';
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
import { Icon } from './Icon';
import { Card } from './ui';

interface PauseRow {
  user_id: string;
  start_date: IsoDate;
  end_date: IsoDate;
  status: string;
  created_at: string;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Paused days must never look like success (§7) — grey, not green. */
const COLOURS: Record<string, string> = {
  complete: 'var(--ok)',
  missed: 'var(--ring-workout)',
  paused: 'var(--paused)',
  'in-progress': 'var(--ring-track)',
  future: 'transparent',
  outside: 'transparent',
};

const LABELS: Record<string, string> = {
  complete: 'complete',
  missed: 'missed',
  paused: 'paused',
  'in-progress': 'today',
};

function parts(date: IsoDate) {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Both streaks on one grid — the thing that makes this different from two
 * people using separate trackers (§11).
 *
 * Laid out as an actual calendar: weekday columns, month headings, and the day
 * of the month in every cell. As a bare run of coloured squares there was no
 * way to tell which end was the start, which is exactly what got asked about.
 * It reads the way a calendar does — earliest at the top left.
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
}) {
  const now = today();
  const [month, setMonth] = useState(() => now.slice(0, 7)); // YYYY-MM

  /**
   * One month, whole weeks. A rolling 35-day window spanned three months and
   * started on an arbitrary weekday, which is why it never read as a calendar:
   * the top-left cell was some random Sunday rather than the 1st.
   */
  const weeks = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const firstOfMonth = `${month}-01`;
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const lastOfMonth = `${month}-${String(daysInMonth).padStart(2, '0')}`;

    const gridStart = addDays(firstOfMonth, -parts(firstOfMonth).weekday);
    const gridEnd = addDays(lastOfMonth, 6 - parts(lastOfMonth).weekday);

    const out: IsoDate[][] = [];
    for (let cursor = gridStart; cursor <= gridEnd; cursor = addDays(cursor, 7)) {
      out.push(Array.from({ length: 7 }, (_, i) => addDays(cursor, i)));
    }
    return out;
  }, [month]);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const shifted = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(shifted.toISOString().slice(0, 7));
  };

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

  const people = [
    { id: myUserId, name: myName },
    ...(partnerId ? [{ id: partnerId, name: partnerName }] : []),
    ...[...rows.keys()]
      .filter((id) => id !== myUserId && id !== partnerId)
      .map((id) => ({ id, name: 'Someone' })),
  ];

  const [year, monthNumber] = month.split('-').map(Number);
  const atCurrentMonth = month >= now.slice(0, 7);

  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => shiftMonth(-1)}
          className="text-muted bg-sunken border-line grid size-8 shrink-0 place-items-center rounded-full border"
        >
          <Icon name="prev" size={15} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <h2 className="text-ink text-sm font-bold tracking-wide uppercase">
            {MONTHS[monthNumber - 1]} {year}
          </h2>
          <p className="text-faint text-xs">Both streaks, one grid.</p>
        </div>
        <button
          type="button"
          aria-label="Next month"
          disabled={atCurrentMonth}
          onClick={() => shiftMonth(1)}
          className="text-muted bg-sunken border-line grid size-8 shrink-0 place-items-center rounded-full border disabled:opacity-30"
        >
          <Icon name="next" size={15} />
        </button>
      </div>

      <div className="grid gap-5">
        {people.map((person) => (
          <div key={person.id}>
            <div className="text-muted mb-2 text-xs font-semibold">{person.name}</div>

            <div className="mb-1 grid grid-cols-7 gap-1">
              {WEEKDAYS.map((initial, i) => (
                <div key={i} className="text-faint text-center text-[10px] font-semibold">
                  {initial}
                </div>
              ))}
            </div>

            <div className="grid gap-1">
              {weeks.map((week) => (
                <div key={week[0]} className="grid grid-cols-7 gap-1">
                  {week.map((date) => {
                    const outsideMonth = !date.startsWith(month);
                    const log = rows.get(person.id)?.get(date);
                    const beforeChallenge = startDate ? date < startDate : false;

                    /*
                     * Before the challenge started, an empty day is not a miss —
                     * it was not a day yet. But a day that was actually logged
                     * and completed still earned its colour, so it shows. Hiding
                     * it would blank out every logged day whenever a new
                     * challenge begins.
                     */
                    const state =
                      outsideMonth
                        ? 'outside'
                        : date > now
                        ? 'future'
                        : beforeChallenge
                          ? log && dayState(log, settings, date, now) === 'complete'
                            ? 'complete'
                            : 'outside'
                          : dayState(log, settings, date, now);
                    const { d } = parts(date);
                    const filled = state === 'complete' || state === 'missed' || state === 'paused';

                    return (
                      <div
                        key={date}
                        title={`${date} — ${state === 'outside' ? 'before the challenge' : state}`}
                        aria-label={`${date}: ${state}`}
                        className="grid aspect-square place-items-center rounded-md text-[10px] font-bold tabular-nums"
                        style={{
                          background: COLOURS[state],
                          // The number has to stay readable on a filled cell and
                          // on an empty one, which are opposite backgrounds.
                          color: filled ? 'var(--surface)' : 'var(--text-faint)',
                          border:
                            filled || outsideMonth ? undefined : '1px solid var(--border)',
                          // Only mark today inside its own month; the padding
                          // cells belong to the neighbouring month.
                          outline:
                            date === now && !outsideMonth
                              ? '2px solid var(--accent)'
                              : undefined,
                          outlineOffset: '1px',
                          opacity: state === 'future' ? 0.4 : 1,
                        }}
                      >
                        {/* The 1st names its month, so a grid spanning two is readable. */}
                        {outsideMonth ? '' : d}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <ul className="text-faint mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {(['complete', 'missed', 'paused', 'in-progress'] as const).map((state) => (
          <li key={state} className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-sm"
              style={{
                background: COLOURS[state],
                border: state === 'in-progress' ? '1px solid var(--border)' : undefined,
              }}
            />
            {LABELS[state]}
          </li>
        ))}
      </ul>
    </Card>
  );
}
