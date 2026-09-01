import { RING_ICON, type IconName } from '../Icon';
import {
  MEALS,
  eatingProgress,
  mealSegments,
  ringValues,
  stepsProgress,
  type DailyLog,
  type MealState,
  type UserSettings,
} from '@lifestyle/shared';

export type RingKey =
  | 'water' | 'reading' | 'steps' | 'workout'
  | 'sleep' | 'eating' | 'journal' | 'alcohol' | 'selfcare';

export interface RingSpec {
  key: RingKey;
  label: string;
  icon: IconName;
  /** A token reference, never a literal — the Phase 1 ground rule. */
  color: string;
  progress: number;
  value: string;
  /** Whether it gates the streak. Six do; three are informational. */
  scored: boolean;
  /**
   * Eating Healthy draws three arcs, one per meal, so unhealthy ones can be a
   * different colour in the same ring. Everything else is a single arc.
   */
  segments?: MealState[];
}

export const BUCKET_LABEL = {
  low: 'under 5k',
  mid: '5–10k',
  high: 'over 10k',
} as const;

function stepsValue(log: DailyLog, settings: UserSettings): string {
  if (log.steps != null) {
    return `${log.steps.toLocaleString()} / ${settings.goal_steps.toLocaleString()}`;
  }
  if (log.steps_bucket) return BUCKET_LABEL[log.steps_bucket];
  return `0 / ${settings.goal_steps.toLocaleString()}`;
}

function sleepValue(log: DailyLog, settings: UserSettings): string {
  const goal = `${Math.round(settings.goal_sleep_minutes / 60)}h`;
  if (log.sleep_minutes == null) return `— / ${goal}`;
  const h = Math.floor(log.sleep_minutes / 60);
  const m = log.sleep_minutes % 60;
  return `${m === 0 ? `${h}h` : `${h}h ${m}m`} / ${goal}`;
}

function eatingValue(log: DailyLog): string {
  const logged = mealSegments(log).filter((meal) => meal != null).length;
  if (logged === 0) return `0 / ${MEALS.length} meals`;
  const bad = mealSegments(log).filter((meal) => meal === 'unhealthy').length;
  return bad === 0 ? `${logged} / ${MEALS.length} healthy` : `${logged} / ${MEALS.length}, ${bad} off`;
}

const yesNo = (done: boolean) => (done ? 'done' : 'not yet');

/**
 * Nine rings — every tracked item, on request. Scored ones come first so the
 * tiered layout can simply take the first six.
 */
export function ringSpecs(log: DailyLog, settings: UserSettings): RingSpec[] {
  const values = ringValues(log, settings);

  return [
    { key: 'water', icon: RING_ICON.water, label: 'Water', color: 'var(--ring-water)', progress: values.water,
      value: `${log.water_oz} / ${settings.goal_water_oz} oz`, scored: true },
    { key: 'reading', icon: RING_ICON.reading, label: 'Reading', color: 'var(--ring-reading)', progress: values.reading,
      value: `${log.pages_read} / ${settings.goal_pages} pages`, scored: true },
    { key: 'steps', icon: RING_ICON.steps, label: 'Steps', color: 'var(--ring-steps)', progress: stepsProgress(log, settings),
      value: stepsValue(log, settings), scored: true },
    { key: 'workout', icon: RING_ICON.workout, label: 'Workout', color: 'var(--ring-workout)', progress: values.workout,
      value: `${log.workout_minutes} / ${settings.goal_workout_minutes} min`, scored: true },
    { key: 'selfcare', icon: RING_ICON.selfcare, label: 'Self-Care', color: 'var(--ring-selfcare)',
      progress: log.self_care ? 1 : 0, value: yesNo(log.self_care), scored: true },
    { key: 'journal', icon: RING_ICON.journal, label: 'Journal', color: 'var(--ring-journal)',
      progress: log.journaled ? 1 : 0, value: yesNo(log.journaled), scored: true },

    { key: 'sleep', icon: RING_ICON.sleep, label: 'Sleep', color: 'var(--ring-sleep)',
      progress: (log.sleep_minutes ?? 0) / settings.goal_sleep_minutes,
      value: sleepValue(log, settings), scored: false },
    { key: 'eating', icon: RING_ICON.eating, label: 'Eating', color: 'var(--ring-eating)',
      progress: eatingProgress(log), value: eatingValue(log), scored: false,
      segments: mealSegments(log) },
    { key: 'alcohol', icon: RING_ICON.alcohol, label: 'No Alcohol', color: 'var(--ring-alcohol)',
      progress: log.no_alcohol ? 1 : 0, value: yesNo(log.no_alcohol), scored: false },
  ];
}
