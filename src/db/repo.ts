import { db } from './db';
import { DEFAULT_SETTINGS, LOCAL_USER_ID, deviceId, emptyLog } from './defaults';
import type { Challenge, DailyLog, UserSettings } from './types';
import { addDays, isEditable, type IsoDate, today } from '../lib/time';

export class EditWindowError extends Error {
  readonly date: IsoDate;
  readonly serverDate: IsoDate;

  constructor(date: IsoDate, serverDate: IsoDate) {
    super(`${date} is outside the edit window (today is ${serverDate})`);
    this.name = 'EditWindowError';
    this.date = date;
    this.serverDate = serverDate;
  }
}

export async function getSettings(): Promise<UserSettings> {
  const existing = await db.user_settings.get(LOCAL_USER_ID);
  if (existing) return existing;

  const seeded: UserSettings = {
    user_id: LOCAL_USER_ID,
    ...DEFAULT_SETTINGS,
    updated_at: new Date().toISOString(),
  };
  await db.user_settings.put(seeded);
  return seeded;
}

export async function updateSettings(
  patch: Partial<Omit<UserSettings, 'user_id'>>,
): Promise<void> {
  const current = await getSettings();
  await db.user_settings.put({
    ...current,
    ...patch,
    updated_at: new Date().toISOString(),
  });
}

/**
 * Phase 1 keeps one local challenge so the header can show "Day 8" — day
 * numbering is per challenge (spec §5). Phase 2 moves creation server-side and
 * adds members, pauses and the projected end date.
 */
export async function getActiveChallenge(): Promise<Challenge | undefined> {
  return db.challenges.where('status').equals('active').first();
}

let bootstrapping: Promise<Challenge> | null = null;

/**
 * Idempotent bootstrap. `startChallenge` mints a UUID, so it must never run
 * from a live query or a double-invoked effect — two calls would leave two
 * active challenges and two different day numbers.
 */
export function ensureChallenge(): Promise<Challenge> {
  bootstrapping ??= (async () => {
    const active = await getActiveChallenge();
    return active ?? (await startChallenge());
  })().finally(() => {
    bootstrapping = null;
  });

  return bootstrapping;
}

export async function startChallenge(
  startDate: IsoDate = today(),
  name = '75 Days',
): Promise<Challenge> {
  const challenge: Challenge = {
    id: crypto.randomUUID(),
    name,
    target_days: 75,
    start_date: startDate,
    is_shared: false,
    status: 'active',
    created_at: new Date().toISOString(),
  };

  await db.transaction('rw', [db.challenges, db.challenge_members], async () => {
    await db.challenges.put(challenge);
    await db.challenge_members.put({
      challenge_id: challenge.id,
      user_id: LOCAL_USER_ID,
      projected_end_date: addDays(startDate, challenge.target_days - 1),
      days_completed: 0,
      days_missed: 0,
      current_streak: 0,
      best_streak: 0,
    });
  });

  return challenge;
}

export async function getLog(date: IsoDate): Promise<DailyLog | undefined> {
  return db.daily_log.get([LOCAL_USER_ID, date]);
}

/**
 * The single write path for daily_log. Everything that mutates a scored item
 * goes through here so the edit window (spec §6) has exactly one gate to pass.
 *
 * Phase 2 must reject the same writes server-side and return the server's date
 * so the client can grey out locked days rather than failing a save silently.
 */
export async function patchLog(
  date: IsoDate,
  patch: Partial<Omit<DailyLog, 'user_id' | 'date'>>,
): Promise<DailyLog> {
  const now = today();
  if (!isEditable(date, now)) throw new EditWindowError(date, now);

  const challenge = await getActiveChallenge();

  return db.transaction('rw', [db.daily_log], async () => {
    const existing = await db.daily_log.get([LOCAL_USER_ID, date]);
    const base = existing ?? emptyLog(date, challenge?.id ?? null);

    const next: DailyLog = {
      ...base,
      ...patch,
      user_id: LOCAL_USER_ID,
      date,
      // Nulled deliberately between challenges: logging continues, feeding no
      // streak or day count (spec §5).
      challenge_id: base.challenge_id ?? challenge?.id ?? null,
      logged_late: base.logged_late || date !== now,
      updated_at: new Date().toISOString(),
      device_id: deviceId(),
    };

    await db.daily_log.put(next);
    return next;
  });
}

export async function logsBetween(from: IsoDate, to: IsoDate): Promise<DailyLog[]> {
  return db.daily_log.where('date').between(from, to, true, true).toArray();
}
