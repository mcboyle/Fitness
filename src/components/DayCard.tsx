import { useState } from 'react';
import type { DailyLog, StepsBucket, UserSettings, WorkoutType } from '../db/types';
import { BigButton, Card, CardLabel, Chip, StepButton } from './ui';

/** Open question in spec §14 — the increment lives here so it's one edit. */
const WATER_INCREMENT_OZ = 8;
const PAGES_INCREMENT = 5;
const WORKOUT_INCREMENT_MIN = 15;

const BUCKETS: { value: StepsBucket; label: string }[] = [
  { value: 'low', label: 'under 5k' },
  { value: 'mid', label: '5–10k' },
  { value: 'high', label: 'over 10k' },
];

const WORKOUT_TYPES: WorkoutType[] = ['strength', 'cardio', 'dance', 'other'];

interface DayCardProps {
  log: DailyLog;
  settings: UserSettings;
  locked: boolean;
  onPatch: (patch: Partial<DailyLog>) => void;
}

/**
 * All four ring metrics on one screen. Target from spec §11: a full day logged
 * in under 20 seconds. Nothing here opens a form.
 */
export function DayCard({ log, settings, locked, onPatch }: DayCardProps) {
  return (
    <div className="grid gap-3">
      <WaterRow log={log} settings={settings} locked={locked} onPatch={onPatch} />
      <ReadingRow log={log} settings={settings} locked={locked} onPatch={onPatch} />
      <StepsRow log={log} settings={settings} locked={locked} onPatch={onPatch} />
      <WorkoutRow log={log} settings={settings} locked={locked} onPatch={onPatch} />
    </div>
  );
}

function WaterRow({ log, settings, locked, onPatch }: DayCardProps) {
  const met = log.water_oz >= settings.goal_water_oz;

  return (
    <Card>
      <CardLabel color="var(--ring-water)" detail={met ? 'goal met' : undefined}>
        Water
      </CardLabel>
      <div className="flex items-center gap-3">
        <StepButton
          label="Remove 8 ounces"
          disabled={locked || log.water_oz === 0}
          onClick={() =>
            onPatch({ water_oz: Math.max(0, log.water_oz - WATER_INCREMENT_OZ) })
          }
        />
        <div className="min-w-0 flex-1">
          <div className="font-display text-ink text-3xl font-extrabold tabular-nums">
            {log.water_oz}
            <span className="text-faint ml-1 text-base font-semibold">
              / {settings.goal_water_oz} oz
            </span>
          </div>
        </div>
        <BigButton
          disabled={locked}
          onClick={() => onPatch({ water_oz: log.water_oz + WATER_INCREMENT_OZ })}
        >
          +{WATER_INCREMENT_OZ} oz
        </BigButton>
      </div>
    </Card>
  );
}

function ReadingRow({ log, settings, locked, onPatch }: DayCardProps) {
  const met = log.pages_read >= settings.goal_pages;

  return (
    <Card>
      <CardLabel color="var(--ring-reading)" detail={met ? 'goal met' : 'any book'}>
        Reading
      </CardLabel>
      <div className="flex items-center gap-3">
        <StepButton
          label="Remove 5 pages"
          disabled={locked || log.pages_read === 0}
          onClick={() =>
            onPatch({ pages_read: Math.max(0, log.pages_read - PAGES_INCREMENT) })
          }
        />
        <div className="min-w-0 flex-1">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            disabled={locked}
            value={log.pages_read}
            onChange={(e) =>
              onPatch({ pages_read: Math.max(0, Number(e.target.value) || 0) })
            }
            aria-label="Pages read"
            className="font-display text-ink w-full bg-transparent text-3xl font-extrabold tabular-nums outline-none disabled:opacity-60"
          />
          <span className="text-faint text-xs">of {settings.goal_pages} pages</span>
        </div>
        <BigButton
          disabled={locked}
          onClick={() => onPatch({ pages_read: log.pages_read + PAGES_INCREMENT })}
        >
          +{PAGES_INCREMENT}
        </BigButton>
      </div>
    </Card>
  );
}

/**
 * Buckets are the default path because they're one tap; the exact field exists
 * so the ring can fill proportionally when precision is wanted. Store whichever
 * was given and render from whichever is present (spec §3, §11).
 */
function StepsRow({ log, settings, locked, onPatch }: DayCardProps) {
  const [showExact, setShowExact] = useState(log.steps != null);
  const bucketsVisible = settings.step_entry_mode !== 'exact';
  const exactAvailable = settings.step_entry_mode !== 'buckets';

  return (
    <Card>
      <CardLabel color="var(--ring-steps)">Steps</CardLabel>

      {bucketsVisible && (
        <div className="flex flex-wrap gap-2">
          {BUCKETS.map((bucket) => (
            <Chip
              key={bucket.value}
              color="var(--ring-steps)"
              selected={log.steps == null && log.steps_bucket === bucket.value}
              disabled={locked}
              onClick={() => {
                setShowExact(false);
                onPatch({
                  steps_bucket:
                    log.steps_bucket === bucket.value && log.steps == null
                      ? null
                      : bucket.value,
                  steps: null,
                });
              }}
            >
              {bucket.label}
            </Chip>
          ))}
        </div>
      )}

      {exactAvailable &&
        (showExact ? (
          <div className="mt-3 flex items-baseline gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              autoFocus={bucketsVisible}
              disabled={locked}
              value={log.steps ?? ''}
              placeholder="0"
              onChange={(e) => {
                const raw = e.target.value;
                onPatch({ steps: raw === '' ? null : Math.max(0, Number(raw) || 0) });
              }}
              aria-label="Exact step count"
              className="font-display text-ink w-32 bg-transparent text-2xl font-extrabold tabular-nums outline-none disabled:opacity-60"
            />
            <span className="text-faint text-xs">
              of {settings.goal_steps.toLocaleString()}
            </span>
            {bucketsVisible && (
              <button
                type="button"
                onClick={() => {
                  setShowExact(false);
                  onPatch({ steps: null });
                }}
                className="text-accent ml-auto text-xs font-semibold"
              >
                use buckets
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            disabled={locked}
            onClick={() => setShowExact(true)}
            className="text-accent mt-3 text-xs font-semibold disabled:opacity-40"
          >
            enter exact
          </button>
        ))}
    </Card>
  );
}

/**
 * Workout fills a ring but does not score daily — its goal is 4 in a rolling
 * 7 days, so a rest day must never read as a failure (spec §4).
 */
function WorkoutRow({ log, settings, locked, onPatch }: DayCardProps) {
  return (
    <Card>
      <CardLabel color="var(--ring-workout)" detail="not scored daily">
        Workout
      </CardLabel>
      <div className="flex items-center gap-3">
        <StepButton
          label="Remove 15 minutes"
          disabled={locked || log.workout_minutes === 0}
          onClick={() =>
            onPatch({
              workout_minutes: Math.max(0, log.workout_minutes - WORKOUT_INCREMENT_MIN),
            })
          }
        />
        <div className="min-w-0 flex-1">
          <div className="font-display text-ink text-3xl font-extrabold tabular-nums">
            {log.workout_minutes}
            <span className="text-faint ml-1 text-base font-semibold">
              / {settings.goal_workout_minutes} min
            </span>
          </div>
        </div>
        <BigButton
          disabled={locked}
          onClick={() =>
            onPatch({
              workout_minutes: log.workout_minutes + WORKOUT_INCREMENT_MIN,
            })
          }
        >
          +{WORKOUT_INCREMENT_MIN}
        </BigButton>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {WORKOUT_TYPES.map((type) => (
          <Chip
            key={type}
            color="var(--ring-workout)"
            selected={log.workout_type === type}
            disabled={locked}
            onClick={() =>
              onPatch({ workout_type: log.workout_type === type ? null : type })
            }
          >
            {type}
          </Chip>
        ))}
      </div>
    </Card>
  );
}
