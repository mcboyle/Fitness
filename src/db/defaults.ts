import type { DailyLog, UserSettings, UserId } from './types';
import { newId } from '../lib/id';
import { type IsoDate, today } from '../lib/time';

/** Phase 1 is single-user and local. Phase 2 replaces this with the synced id. */
export const LOCAL_USER_ID: UserId = 'local';

export const DEFAULT_SETTINGS: Omit<UserSettings, 'user_id' | 'updated_at'> = {
  goal_water_oz: 80,
  goal_pages: 20,
  goal_steps: 10_000,
  goal_workout_minutes: 45,
  goal_sleep_minutes: 480,
  // BUILDSPEC §4 specifies 3. Raised to 4 after a week's device testing —
  // three of six is half the list, and with no reminders the streak was too
  // forgiving to mean much. Still one integer, editable per user in settings.
  completion_threshold: 4,
  step_entry_mode: 'both',
  theme: 'dark',
  ring_layout: 'concentric',
};

let cachedDeviceId: string | null = null;

/**
 * Stable per install; Phase 2 stamps it on every synced row. Falls back to a
 * memory-only id where localStorage is unavailable or throws — Safari in
 * private mode does both.
 */
export function deviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;

  const key = 'lt.device_id';
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      cachedDeviceId = stored;
      return stored;
    }
    const created = newId();
    localStorage.setItem(key, created);
    cachedDeviceId = created;
    return created;
  } catch {
    cachedDeviceId = newId();
    return cachedDeviceId;
  }
}

export function emptyLog(date: IsoDate, challengeId: string | null): DailyLog {
  return {
    user_id: LOCAL_USER_ID,
    date,
    challenge_id: challengeId,
    steps: null,
    steps_bucket: null,
    sleep_minutes: null,
    water_oz: 0,
    pages_read: 0,
    workout_minutes: 0,
    workout_type: null,
    whole_food: false,
    no_alcohol: false,
    no_junk_food: false,
    self_care: false,
    journaled: false,
    logged_late: date !== today(),
    paused: false,
    updated_at: new Date().toISOString(),
    device_id: deviceId(),
  };
}
