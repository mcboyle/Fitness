/**
 * Day boundaries.
 *
 * Spec §8: there is no per-user timezone. One app-wide zone governs when a day
 * starts and ends, because two clients disagreeing about "today" would desync
 * the streak. Pin PINNED_TIMEZONE before Phase 2 ships a second device.
 */
const PINNED_TIMEZONE: string | null = null;

export const APP_TIMEZONE =
  PINNED_TIMEZONE ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

/** A calendar date in the app timezone, `YYYY-MM-DD`. */
export type IsoDate = string;

const isoFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function toIsoDate(instant: Date = new Date()): IsoDate {
  return isoFormatter.format(instant);
}

export function today(): IsoDate {
  return toIsoDate();
}

/** Calendar arithmetic, done in UTC so DST never shifts a date by one. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  const [ay, am, ad] = from.split('-').map(Number);
  const [by, bm, bd] = to.split('-').map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Spec §6: only today and yesterday are editable. Once a day is two days old
 * its scored items freeze — that is what keeps the streak a measurement rather
 * than an honour system.
 *
 * Phase 1 has no server, so this is the only gate. Phase 2 must re-enforce it
 * server-side; a client-side-only rule makes the streak decoration.
 */
export const EDIT_WINDOW_DAYS = 1;

export function isEditable(date: IsoDate, now: IsoDate = today()): boolean {
  const age = daysBetween(date, now);
  return age >= 0 && age <= EDIT_WINDOW_DAYS;
}

/** Day numbering is per challenge (spec §5). Day 1 is the start date itself. */
export function dayNumber(startDate: IsoDate, date: IsoDate): number {
  return daysBetween(startDate, date) + 1;
}

/** The trailing window every rolling goal sums over, oldest first. */
export function lastSevenDays(end: IsoDate = today()): IsoDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(end, i - 6));
}

const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'short',
});
const monthDayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
});

function asUtcDate(date: IsoDate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "We, Jun 14" */
export function formatDayLabel(date: IsoDate): string {
  const at = asUtcDate(date);
  return `${weekdayFormatter.format(at).slice(0, 2)}, ${monthDayFormatter.format(at)}`;
}

export function formatRelativeDay(date: IsoDate, now: IsoDate = today()): string {
  const age = daysBetween(date, now);
  if (age === 0) return 'Today';
  if (age === 1) return 'Yesterday';
  return formatDayLabel(date);
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
