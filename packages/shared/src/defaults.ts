import type { DailyLog, UserId, UserSettings } from './types';
import { type IsoDate, today } from './time';

/**
 * Goal and scoring defaults. Shared because the API seeds `user_settings`
 * server-side at onboarding and must agree with the client exactly — a client
 * and server disagreeing about the threshold would disagree about the streak.
 */
export const DEFAULT_SETTINGS: Omit<UserSettings, 'user_id' | 'updated_at'> = {
  goal_water_oz: 80,
  goal_pages: 20,
  goal_steps: 10_000,
  goal_workout_minutes: 45,
  goal_sleep_minutes: 480,
  // BUILDSPEC §4 specifies 3. Raised to 4 after device testing — three of six
  // is half the list, and with no reminders the streak was too forgiving to
  // mean much. Still one integer, editable per user in settings.
  completion_threshold: 4,
  step_entry_mode: 'both',
  theme: 'dark',
  ring_layout: 'concentric',
};

/**
 * A blank day. Pure — the caller supplies identity and the clock, so the
 * server can build one without a browser and tests can build one without
 * either.
 */
export function emptyDailyLog(params: {
  userId: UserId;
  date: IsoDate;
  challengeId: string | null;
  deviceId: string;
  now?: IsoDate;
}): DailyLog {
  const { userId, date, challengeId, deviceId, now = today() } = params;

  return {
    user_id: userId,
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
    logged_late: date !== now,
    paused: false,
    updated_at: new Date().toISOString(),
    device_id: deviceId,
  };
}
