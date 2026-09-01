import type { DailyLog, Documentary, Media } from './types';
import { lastSevenDays, type IsoDate } from './time';

/**
 * Spec §3. There is no calendar week. All three goals sum over a trailing
 * 7-day window and are always labelled "last 7 days" in the UI, because a met
 * goal can un-meet itself as days age out — that is correct behaviour, and the
 * label is what keeps it from reading as a bug.
 */
export const ROLLING_GOALS = {
  workouts: 4,
  documentaries: 3,
  photos: 1,
} as const;

export interface RollingWindow {
  dates: IsoDate[];
  workouts: number;
  documentaries: number;
  photos: number;
}

export function rollingWindow(
  logs: DailyLog[],
  documentaries: Documentary[],
  media: Media[],
  end: IsoDate,
): RollingWindow {
  const dates = lastSevenDays(end);
  const first = dates[0];
  const inWindow = (d: IsoDate) => d >= first && d <= end;

  return {
    dates,
    workouts: logs.filter((l) => inWindow(l.date) && l.workout_minutes > 0).length,
    documentaries: documentaries.filter((d) => !d.deleted_at && inWindow(d.watched_on)).length,
    photos: media.filter((m) => inWindow(m.taken_on)).length,
  };
}
