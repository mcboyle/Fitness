import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { db } from '../db/db';
import { LOCAL_USER_ID } from '../db/defaults';
import {
  ensureChallenge,
  getActiveChallenge,
  getSettings,
  logsBetween,
} from '../db/repo';
import type { DailyLog, UserSettings } from '../db/types';
import { computeStreak } from '../lib/scoring';
import { addDays, type IsoDate, today } from '../lib/time';

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
  return useLiveQuery(() => getSettings(), []);
}

export function useChallenge() {
  useEffect(() => {
    void ensureChallenge();
  }, []);

  return useLiveQuery(() => getActiveChallenge(), []);
}

export function useLog(date: IsoDate): DailyLog | undefined {
  return useLiveQuery(() => db.daily_log.get([LOCAL_USER_ID, date]), [date]);
}

/** Trailing window of logs, keyed by date, for the streak and the 7-day strip. */
export function useLogHistory(end: IsoDate, days: number) {
  const from = addDays(end, -(days - 1));
  const logs = useLiveQuery(() => logsBetween(from, end), [from, end]);

  return useMemo(() => {
    const byDate = new Map<IsoDate, DailyLog>();
    for (const log of logs ?? []) byDate.set(log.date, log);
    return { logs: logs ?? [], byDate, loading: logs === undefined };
  }, [logs]);
}

export function useStreak(settings: UserSettings | undefined, now: IsoDate): number {
  // A streak can only be as long as the history we hold; two years is plenty
  // and keeps the live query bounded.
  const { byDate } = useLogHistory(now, 730);
  return useMemo(
    () => (settings ? computeStreak(byDate, settings, now) : 0),
    [byDate, settings, now],
  );
}

export function useDocumentaries(from: IsoDate, to: IsoDate) {
  return (
    useLiveQuery(
      () => db.documentaries.where('watched_on').between(from, to, true, true).toArray(),
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
