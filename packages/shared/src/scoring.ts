import { MEALS, type DailyLog, type MealState, type UserSettings } from './types';
import { addDays, type IsoDate } from './time';

/**
 * Six items score toward daily completion.
 *
 * Changed from §4 on request after a week of use: sleep left the scored set and
 * workout joined it. The spec deliberately left workout unscored so a rest day
 * never reads as failure, its goal being 4-in-7 — so a rest day now costs one
 * of six. The threshold is what absorbs that, and it is user-editable.
 *
 * Sleep, Eating Healthy and no-alcohol are tracked, charted, given rings and
 * visible to everyone — they just don't gate the streak.
 */
export const SCORED_ITEMS = [
  'steps',
  'water',
  'reading',
  'workout',
  'self_care',
  'journaled',
] as const;

export type ScoredItem = (typeof SCORED_ITEMS)[number];

export const SCORED_LABELS: Record<ScoredItem, string> = {
  steps: 'Steps',
  water: 'Water',
  reading: 'Reading',
  workout: 'Workout',
  self_care: 'Self-Care',
  journaled: 'Daily Journal',
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

/**
 * Eating Healthy: three meals, each healthy or not.
 *
 * The ring fills a third per *logged* meal, so a full ring means three meals
 * were recorded — the unhealthy ones simply render in the warning colour. An
 * unlogged meal and an unhealthy one are different states and must not look
 * alike.
 */
export function mealSegments(log: DailyLog): MealState[] {
  return MEALS.map((meal) => log[meal]);
}

export function eatingProgress(log: DailyLog): number {
  return mealSegments(log).filter((meal) => meal != null).length / MEALS.length;
}

export function healthyMeals(log: DailyLog): number {
  return mealSegments(log).filter((meal) => meal === 'healthy').length;
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
    workout: log.workout_minutes >= settings.goal_workout_minutes,
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

/**
 * A pause left unanswered for 24 hours reads as approved (§7). Evaluated
 * lazily at read time on both client and server — there is no cron job
 * anywhere in this system, and this is the reason there doesn't need to be.
 */
export function effectivePauseStatus(
  pause: { status: string; created_at: string },
  now: Date = new Date(),
): 'pending' | 'approved' | 'declined' {
  if (pause.status !== 'pending') {
    return pause.status as 'approved' | 'declined';
  }
  const age = now.getTime() - new Date(pause.created_at).getTime();
  return age >= 24 * 60 * 60 * 1000 ? 'approved' : 'pending';
}

/**
 * Dates covered by an effectively-approved pause, for one user.
 *
 * Approval backdates to the declared start date whether it was granted by tap
 * or by the 24-hour timer, so a day boundary falling inside the pending window
 * doesn't matter — the streak is made whole retroactively (§7).
 */
export function pausedDates(
  pauses: { user_id: string; start_date: IsoDate; end_date: IsoDate; status: string; created_at: string }[],
  userId: string,
  now: Date = new Date(),
): Set<IsoDate> {
  const dates = new Set<IsoDate>();

  for (const pause of pauses) {
    if (pause.user_id !== userId) continue;
    if (effectivePauseStatus(pause, now) !== 'approved') continue;

    let cursor = pause.start_date;
    for (let guard = 0; cursor <= pause.end_date && guard < 400; guard += 1) {
      dates.add(cursor);
      cursor = addDays(cursor, 1);
    }
  }

  return dates;
}

/** Marks paused days on a history so the streak can freeze across them. */
export function applyPauses(
  logsByDate: Map<IsoDate, DailyLog>,
  paused: Set<IsoDate>,
): Map<IsoDate, DailyLog> {
  if (paused.size === 0) return logsByDate;

  const merged = new Map(logsByDate);
  for (const date of paused) {
    const existing = merged.get(date);
    merged.set(date, { ...(existing ?? ({ date } as DailyLog)), paused: true });
  }
  return merged;
}
