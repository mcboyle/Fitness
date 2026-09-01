import type { DailyLog, UserSettings } from '../db/types';
import { addDays, type IsoDate } from './time';

/**
 * Spec §4. Six items score toward daily completion. Workout, whole food,
 * no alcohol and no junk food are tracked, charted and visible — they just
 * don't gate the streak.
 */
export const SCORED_ITEMS = [
  'steps',
  'water',
  'reading',
  'sleep',
  'self_care',
  'journaled',
] as const;

export type ScoredItem = (typeof SCORED_ITEMS)[number];

export const SCORED_LABELS: Record<ScoredItem, string> = {
  steps: 'Steps',
  water: 'Water',
  reading: 'Reading',
  sleep: 'Sleep',
  self_care: 'Self-care',
  journaled: 'Journaled',
};

/** Buckets fill the steps ring in thirds when no exact count was given. */
const BUCKET_FRACTION = { low: 1 / 3, mid: 2 / 3, high: 1 } as const;

export interface RingValues {
  water: number;
  reading: number;
  steps: number;
  workout: number;
}

function ratio(value: number, goal: number): number {
  if (goal <= 0) return value > 0 ? 1 : 0;
  return value / goal;
}

/** Uncapped ratios — the caller clamps for display but may want to show >100%. */
export function ringValues(log: DailyLog, settings: UserSettings): RingValues {
  return {
    water: ratio(log.water_oz, settings.goal_water_oz),
    reading: ratio(log.pages_read, settings.goal_pages),
    steps: stepsProgress(log, settings),
    workout: ratio(log.workout_minutes, settings.goal_workout_minutes),
  };
}

/** Exact count wins when present; otherwise the bucket fills in thirds. */
export function stepsProgress(log: DailyLog, settings: UserSettings): number {
  if (log.steps != null) return ratio(log.steps, settings.goal_steps);
  if (log.steps_bucket) return BUCKET_FRACTION[log.steps_bucket];
  return 0;
}

export function scoredStatus(
  log: DailyLog,
  settings: UserSettings,
): Record<ScoredItem, boolean> {
  return {
    steps: stepsProgress(log, settings) >= 1,
    water: log.water_oz >= settings.goal_water_oz,
    reading: log.pages_read >= settings.goal_pages,
    sleep: (log.sleep_minutes ?? 0) >= settings.goal_sleep_minutes,
    self_care: log.self_care,
    journaled: log.journaled,
  };
}

export function scoreCount(log: DailyLog, settings: UserSettings): number {
  return Object.values(scoredStatus(log, settings)).filter(Boolean).length;
}

export function isDayComplete(log: DailyLog, settings: UserSettings): boolean {
  return scoreCount(log, settings) >= settings.completion_threshold;
}

export type DayState = 'complete' | 'missed' | 'paused' | 'future' | 'in-progress';

export function dayState(
  log: DailyLog | undefined,
  settings: UserSettings,
  date: IsoDate,
  now: IsoDate,
): DayState {
  if (date > now) return 'future';
  if (log?.paused) return 'paused';
  if (log && isDayComplete(log, settings)) return 'complete';
  // Today is still in progress — an incomplete today is not yet a miss.
  return date === now ? 'in-progress' : 'missed';
}

/**
 * A missed day resets the streak to zero; there are no grace days (spec §4).
 * Paused days freeze it — they neither extend nor break the run (spec §7).
 * Today counts only once it is complete, so an unfinished today never reads as
 * a broken streak.
 */
export function computeStreak(
  logsByDate: Map<IsoDate, DailyLog>,
  settings: UserSettings,
  now: IsoDate,
): number {
  let streak = 0;
  let cursor = now;

  if (!isCompleteOn(logsByDate, settings, now)) {
    cursor = addDays(now, -1);
  }

  // Bounded so a corrupt store can never spin the render loop.
  for (let guard = 0; guard < 3650; guard += 1) {
    const log = logsByDate.get(cursor);
    if (log?.paused) {
      cursor = addDays(cursor, -1);
      continue;
    }
    if (log && isDayComplete(log, settings)) {
      streak += 1;
      cursor = addDays(cursor, -1);
      continue;
    }
    break;
  }

  return streak;
}

export function bestStreak(
  logsByDate: Map<IsoDate, DailyLog>,
  settings: UserSettings,
): number {
  const dates = [...logsByDate.keys()].sort();
  if (dates.length === 0) return 0;

  let best = 0;
  let run = 0;
  let cursor = dates[0];
  const last = dates[dates.length - 1];

  while (cursor <= last) {
    const log = logsByDate.get(cursor);
    if (log?.paused) {
      // Frozen: carries the run across without extending it.
    } else if (log && isDayComplete(log, settings)) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
    cursor = addDays(cursor, 1);
  }

  return best;
}

function isCompleteOn(
  logsByDate: Map<IsoDate, DailyLog>,
  settings: UserSettings,
  date: IsoDate,
): boolean {
  const log = logsByDate.get(date);
  return !!log && isDayComplete(log, settings);
}
