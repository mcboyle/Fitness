import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, emptyDailyLog } from '../defaults';
import type { DailyLog, UserSettings } from '../types';
import {
  bestStreak,
  computeStreak,
  isDayComplete,
  scoreCount,
  stepsProgress,
} from '../scoring';
import { addDays, isEditable, lastSevenDays } from '../time';

const LOCAL_USER_ID = 'test-user';

const settings: UserSettings = {
  user_id: LOCAL_USER_ID,
  ...DEFAULT_SETTINGS,
  updated_at: '',
};

function log(date: string, patch: Partial<DailyLog> = {}): DailyLog {
  const base = emptyDailyLog({
    userId: LOCAL_USER_ID,
    date,
    challengeId: null,
    deviceId: 'test-device',
  });
  return { ...base, ...patch };
}

/** Four of the six scored items — the default threshold. */
const complete = {
  water_oz: 80,
  pages_read: 20,
  self_care: true,
  journaled: true,
} satisfies Partial<DailyLog>;

function history(entries: DailyLog[]) {
  return new Map(entries.map((e) => [e.date, e]));
}

describe('scoring', () => {
  it('counts only the six scored items', () => {
    // Every unscored item set, nothing scored: still zero.
    const unscored = log('2026-09-01', {
      workout_minutes: 90,
      whole_food: true,
      no_alcohol: true,
      no_junk_food: true,
    });
    expect(scoreCount(unscored, settings)).toBe(0);
    expect(isDayComplete(unscored, settings)).toBe(false);
  });

  it('completes at the threshold, not at all six', () => {
    const day = log('2026-09-01', complete);
    expect(scoreCount(day, settings)).toBe(4);
    expect(isDayComplete(day, settings)).toBe(true);
  });

  it('is incomplete one item under the threshold', () => {
    const day = log('2026-09-01', { water_oz: 80, pages_read: 20, self_care: true });
    expect(scoreCount(day, settings)).toBe(3);
    expect(isDayComplete(day, settings)).toBe(false);
  });

  it('fills the steps ring in thirds from buckets, proportionally from exact', () => {
    expect(stepsProgress(log('2026-09-01', { steps_bucket: 'low' }), settings)).toBeCloseTo(1 / 3);
    expect(stepsProgress(log('2026-09-01', { steps_bucket: 'high' }), settings)).toBe(1);
    expect(stepsProgress(log('2026-09-01', { steps: 5000 }), settings)).toBe(0.5);
    // Exact wins when both are present.
    expect(
      stepsProgress(log('2026-09-01', { steps: 2500, steps_bucket: 'high' }), settings),
    ).toBe(0.25);
  });
});

describe('streaks', () => {
  const now = '2026-09-10';

  it('counts back from today', () => {
    const days = history([
      log('2026-09-08', complete),
      log('2026-09-09', complete),
      log(now, complete),
    ]);
    expect(computeStreak(days, settings, now)).toBe(3);
  });

  it('does not break on an unfinished today', () => {
    const days = history([log('2026-09-08', complete), log('2026-09-09', complete), log(now)]);
    expect(computeStreak(days, settings, now)).toBe(2);
  });

  it('resets to zero on a missed day — no grace days', () => {
    const days = history([
      log('2026-09-06', complete),
      log('2026-09-07', complete),
      // 09-08 missed entirely
      log('2026-09-09', complete),
      log(now, complete),
    ]);
    expect(computeStreak(days, settings, now)).toBe(2);
  });

  it('resets on a logged-but-incomplete day', () => {
    const days = history([
      log('2026-09-08', complete),
      log('2026-09-09', { water_oz: 80 }), // 1 of 6, under the threshold
      log(now, complete),
    ]);
    expect(computeStreak(days, settings, now)).toBe(1);
  });

  it('freezes across a paused day rather than breaking', () => {
    const days = history([
      log('2026-09-07', complete),
      log('2026-09-08', { paused: true }),
      log('2026-09-09', complete),
      log(now, complete),
    ]);
    expect(computeStreak(days, settings, now)).toBe(3);
  });

  it('finds the longest historical run', () => {
    const days = history([
      log('2026-09-01', complete),
      log('2026-09-02', complete),
      log('2026-09-03', complete),
      log('2026-09-04'), // miss
      log('2026-09-05', complete),
    ]);
    expect(bestStreak(days, settings)).toBe(3);
  });
});

describe('edit window', () => {
  const now = '2026-09-10';

  it('allows today and yesterday only', () => {
    expect(isEditable(now, now)).toBe(true);
    expect(isEditable('2026-09-09', now)).toBe(true);
    expect(isEditable('2026-09-08', now)).toBe(false);
  });

  it('rejects future dates', () => {
    expect(isEditable('2026-09-11', now)).toBe(false);
  });
});

describe('rolling window', () => {
  it('is seven days ending today, oldest first', () => {
    const days = lastSevenDays('2026-09-10');
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-09-04');
    expect(days[6]).toBe('2026-09-10');
  });

  it('crosses a month boundary correctly', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
});
