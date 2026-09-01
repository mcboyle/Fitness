import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { db } from '../db/db';
import { currentUserId } from '../api/session';
import {
  ensureChallenge,
  ensureSettings,
  getActiveChallenge,
  logsBetween,
  readSettings,
} from '../db/repo';
import type { DailyLog, UserSettings } from '@lifestyle/shared';
import { computeStreak } from '@lifestyle/shared';
import { addDays, type IsoDate, today } from '@lifestyle/shared';

/** Re-reads the clock on focus so a day rollover doesn't leave a stale "today". */
export function useToday(): IsoDate {
  const [date, setDate] = useState(today);

  useEffect(() => {
    const refresh = () => setDate(today());
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  return date;
}

export function useSettings(): UserSettings | undefined {
  useEffect(() => {
    void ensureSettings();
  }, []);

  return useLiveQuery(() => readSettings(), []);
}

export function useChallenge() {
  useEffect(() => {
    void ensureChallenge();
  }, []);

  return useLiveQuery(() => getActiveChallenge(), []);
}

export function useLog(date: IsoDate): DailyLog | undefined {
  return useLiveQuery(() => db.daily_log.get([currentUserId(), date]), [date]);
}

/**
 * Trailing window of one person's logs, keyed by date.
 *
 * The user filter is load-bearing: `logsBetween` returns every member's rows,
 * and a map keyed only by date silently keeps whichever came last. That made
 * the streak, the x/9 counter and the sleep trend liable to read the partner's
 * data instead of your own.
 */
export function useLogHistory(end: IsoDate, days: number, userId?: string) {
  const from = addDays(end, -(days - 1));
  const who = userId ?? currentUserId();
  const logs = useLiveQuery(
    async () => (await logsBetween(from, end)).filter((log) => log.user_id === who),
    [from, end, who],
  );

  return useMemo(() => {
    const byDate = new Map<IsoDate, DailyLog>();
    for (const log of logs ?? []) byDate.set(log.date, log);
    return { logs: logs ?? [], byDate, loading: logs === undefined };
  }, [logs]);
}

export function useStreak(
  settings: UserSettings | undefined,
  now: IsoDate,
  userId?: string,
): number {
  // A streak can only be as long as the history we hold; two years is plenty
  // and keeps the live query bounded.
  const { byDate } = useLogHistory(now, 730, userId);
  return useMemo(
    () => (settings ? computeStreak(byDate, settings, now) : 0),
    [byDate, settings, now],
  );
}

export function useDocumentaries(from: IsoDate, to: IsoDate) {
  return (
    useLiveQuery(
      async () =>
        (await db.documentaries.where('watched_on').between(from, to, true, true).toArray())
          .filter((row) => !row.deleted_at),
      [from, to],
    ) ?? []
  );
}

export function useMedia(from: IsoDate, to: IsoDate) {
  return (
    useLiveQuery(
      () => db.media.where('taken_on').between(from, to, true, true).toArray(),
      [from, to],
    ) ?? []
  );
}

export function useThemeAttribute(theme: string | undefined) {
  useEffect(() => {
    if (!theme) return;
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const surface = getComputedStyle(document.documentElement)
        .getPropertyValue('--surface')
        .trim();
      meta.setAttribute('content', surface);
    }
  }, [theme]);
}
