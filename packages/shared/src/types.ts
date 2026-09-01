import type { IsoDate } from './time';

export type UserId = string;

export type StepsBucket = 'low' | 'mid' | 'high';
export type WorkoutType = 'strength' | 'cardio' | 'dance' | 'pilates' | 'other';

/** One meal. `null` means not logged, which is not the same as unhealthy. */
export type MealState = 'healthy' | 'unhealthy' | null;

export const MEALS = ['breakfast', 'lunch', 'dinner'] as const;
export type Meal = (typeof MEALS)[number];
export type RingLayout = 'concentric' | 'grid' | 'tiered';
export type Theme = 'dark' | 'light';
export type StepEntryMode = 'buckets' | 'exact' | 'both';

export interface User {
  id: UserId;
  display_name: string;
  avatar_color: string;
  invite_code: string | null;
  created_at: string;
}

export interface UserSettings {
  user_id: UserId;
  goal_water_oz: number;
  goal_pages: number;
  goal_steps: number;
  goal_workout_minutes: number;
  goal_sleep_minutes: number;
  /** How many of the six scored items make a day complete. Spec §4. */
  completion_threshold: number;
  step_entry_mode: StepEntryMode;
  theme: Theme;
  ring_layout: RingLayout;
  updated_at: string;
}

export interface Challenge {
  id: string;
  name: string;
  target_days: number;
  start_date: IsoDate;
  is_shared: boolean;
  status: 'active' | 'completed' | 'abandoned';
  created_at: string;
}

export interface ChallengeMember {
  challenge_id: string;
  user_id: UserId;
  /** Per member, not per challenge: one person's pause shifts only their finish. */
  projected_end_date: IsoDate;
  days_completed: number;
  days_missed: number;
  current_streak: number;
  best_streak: number;
}

export interface DailyLog {
  user_id: UserId;
  date: IsoDate;
  /** Nullable: logging continues between challenges, feeding no streak. */
  challenge_id: string | null;
  steps: number | null;
  steps_bucket: StepsBucket | null;
  sleep_minutes: number | null;
  water_oz: number;
  pages_read: number;
  workout_minutes: number;
  workout_type: WorkoutType | null;
  breakfast: MealState;
  lunch: MealState;
  dinner: MealState;
  /** Superseded by the three meals above; kept so old rows still read. */
  whole_food: boolean;
  no_alcohol: boolean;
  no_junk_food: boolean;
  self_care: boolean;
  journaled: boolean;
  /** Written after the day it describes. Cosmetic dot, not protective. */
  logged_late: boolean;
  paused: boolean;
  updated_at: string;
  device_id: string;
}

export interface Pause {
  id: string;
  user_id: UserId;
  challenge_id: string | null;
  start_date: IsoDate;
  end_date: IsoDate;
  reason: string | null;
  status: 'pending' | 'approved' | 'declined';
  approved_by: UserId | null;
  resolved_at: string | null;
  created_at: string;
}

export interface Media {
  id: string;
  user_id: UserId;
  taken_on: IsoDate;
  kind: 'progress_photo';
  storage_path: string;
  thumb_path: string | null;
  /** The only per-item privacy decision in the system. Spec §9. */
  visibility: 'private' | 'shared';
  shared_at: string | null;
  created_at: string;
}

export interface Measurement {
  id: string;
  user_id: UserId;
  taken_on: IsoDate;
  weight_lb: number | null;
  waist_in: number | null;
  hip_in: number | null;
  arm_in: number | null;
  thigh_in: number | null;
  notes: string | null;
  created_at: string;
}

export interface Documentary {
  id: string;
  user_id: UserId;
  watched_on: IsoDate;
  title: string;
  notes: string | null;
  created_at: string;
  /** Tombstone: a hard delete would never reach the other device. */
  deleted_at?: string | null;
}

export interface Reaction {
  id: string;
  from_user_id: UserId;
  target_kind: 'day' | 'photo' | 'measurement';
  target_date: IsoDate | null;
  target_media_id: string | null;
  emoji: string;
  body: string | null;
  seen_at: string | null;
  created_at: string;
}

export interface SyncState {
  device_id: string;
  user_id: UserId;
  last_pulled_at: string | null;
  last_pushed_at: string | null;
}
