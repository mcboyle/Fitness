import { DEFAULT_SETTINGS, emptyDailyLog } from '@lifestyle/shared';
import type { DailyLog, IsoDate, UserId } from '@lifestyle/shared';
import { newId } from '../lib/id';

export { DEFAULT_SETTINGS };

/** Phase 1 is single-user and local. Phase 2 replaces this with the synced id. */
export const LOCAL_USER_ID: UserId = 'local';

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

/** Browser-side wrapper: supplies this device's identity to the pure factory. */
export function emptyLog(date: IsoDate, challengeId: string | null): DailyLog {
  return emptyDailyLog({
    userId: LOCAL_USER_ID,
    date,
    challengeId,
    deviceId: deviceId(),
  });
}
