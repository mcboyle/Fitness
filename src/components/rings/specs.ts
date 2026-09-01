import type { DailyLog, UserSettings } from '../../db/types';
import { ringValues, stepsProgress } from '../../lib/scoring';

export type RingKey = 'water' | 'reading' | 'steps' | 'workout';

export interface RingSpec {
  key: RingKey;
  label: string;
  /** A token reference, never a literal — see the Phase 1 ground rule in §11. */
  color: string;
  progress: number;
  value: string;
  /** Workout is informational: it fills a ring but does not gate the streak. */
  scored: boolean;
}

const BUCKET_LABEL = {
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

/**
 * Ordered outer to inner. Workout sits innermost on purpose: three of the four
 * rings score and it doesn't, and rings otherwise read as equally weighted
 * (spec §4).
 */
export function ringSpecs(log: DailyLog, settings: UserSettings): RingSpec[] {
  const values = ringValues(log, settings);

  return [
    {
      key: 'water',
      label: 'Water',
      color: 'var(--ring-water)',
      progress: values.water,
      value: `${log.water_oz} / ${settings.goal_water_oz} oz`,
      scored: true,
    },
    {
      key: 'reading',
      label: 'Reading',
      color: 'var(--ring-reading)',
      progress: values.reading,
      value: `${log.pages_read} / ${settings.goal_pages} pages`,
      scored: true,
    },
    {
      key: 'steps',
      label: 'Steps',
      color: 'var(--ring-steps)',
      progress: stepsProgress(log, settings),
      value: stepsValue(log, settings),
      scored: true,
    },
    {
      key: 'workout',
      label: 'Workout',
      color: 'var(--ring-workout)',
      progress: values.workout,
      value: `${log.workout_minutes} / ${settings.goal_workout_minutes} min`,
      scored: false,
    },
  ];
}
