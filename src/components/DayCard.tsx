import { useEffect, useRef, useState } from 'react';
import type { DailyLog, StepsBucket, UserSettings, WorkoutType } from '../db/types';
import { BUCKET_LABEL } from './rings/specs';
import { BigButton, Card, CardLabel, Chip, StepButton } from './ui';

/** Open question in spec §14 — the increment lives here so it's one edit. */
const WATER_INCREMENT_OZ = 8;
const PAGES_INCREMENT = 5;
const WORKOUT_INCREMENT_MIN = 15;

const BUCKETS: { value: StepsBucket; label: string }[] = (
  ['low', 'mid', 'high'] as StepsBucket[]
).map((value) => ({ value, label: BUCKET_LABEL[value] }));

const WORKOUT_TYPES: WorkoutType[] = ['strength', 'cardio', 'dance', 'other'];


/**
 * Keeps a numeric text field usable while its value round-trips through
 * IndexedDB.
 *
 * Binding `value` straight to the stored number makes React re-render with the
 * pre-write value between keystrokes, so characters are silently dropped —
 * typing "8432" landed as "2". The draft is authoritative while focused, and
 * adopts the stored value only when the user isn't typing (so the +/- buttons
 * still update the field). See MISTAKES.md #8.
 */
function useNumericDraft(
  value: number | null,
  commit: (next: number | null) => void,
) {
  const asText = value == null ? '' : String(value);
  const [draft, setDraft] = useState(asText);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(asText);
  }, [asText]);

  return {
    value: draft,
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      setDraft(asText);
    },
    onChange: (raw: string) => {
      setDraft(raw);
      commit(raw === '' ? null : Math.max(0, Number(raw) || 0));
    },
  };
}

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
  const pages = useNumericDraft(log.pages_read, (next) =>
    onPatch({ pages_read: next ?? 0 }),
  );

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
            value={pages.value}
            onFocus={pages.onFocus}
            onBlur={pages.onBlur}
            onChange={(e) => pages.onChange(e.target.value)}
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
  const exactMode = exactAvailable && (showExact || !bucketsVisible);
  const bucketLabel = log.steps_bucket ? BUCKET_LABEL[log.steps_bucket] : null;

  const inputRef = useRef<HTMLInputElement>(null);
  const openedByTap = useRef(false);
  const steps = useNumericDraft(log.steps, (next) => onPatch({ steps: next }));

  // Focus only when the user asked for the field — never on mount, which would
  // pop the keyboard every time the app opens on a day with an exact count.
  useEffect(() => {
    if (exactMode && openedByTap.current) {
      openedByTap.current = false;
      inputRef.current?.focus();
    }
  }, [exactMode]);

  return (
    <Card>
      <CardLabel color="var(--ring-steps)">Steps</CardLabel>

      {/*
        The other three rows lead with a big number. Without one here a bucket
        reads as "100%" on the ring and no count anywhere on the card.
      */}
      <div className="mb-3 flex items-baseline gap-2">
        {exactMode ? (
          <>
            <input
              ref={inputRef}
              type="number"
              inputMode="numeric"
              min={0}
              disabled={locked}
              value={steps.value}
              placeholder="0"
              onFocus={steps.onFocus}
              onBlur={steps.onBlur}
              onChange={(e) => steps.onChange(e.target.value)}
              aria-label="Exact step count"
              /*
               * Grows with the number so "/ 10,000" sits beside it, but never
               * below the goal's own width — sized from the value alone this
               * collapsed to a 20px sliver when empty, which read as "there is
               * no way to enter steps". `field-sizing: content` isn't on iOS.
               */
              style={{
                width: `${Math.max(
                  String(settings.goal_steps).length,
                  steps.value.length,
                )}ch`,
              }}
              className="font-display text-ink border-line-strong border-b-2 bg-transparent text-3xl font-extrabold tabular-nums outline-none disabled:opacity-60"
            />
            <span className="text-faint text-base font-semibold">
              / {settings.goal_steps.toLocaleString()}
            </span>
          </>
        ) : (
          <>
            <span className="font-display text-ink text-3xl font-extrabold">
              {bucketLabel ?? '—'}
            </span>
            <span className="text-faint text-base font-semibold">
              {bucketLabel ? 'estimated' : `of ${settings.goal_steps.toLocaleString()}`}
            </span>
          </>
        )}
      </div>

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

      {exactAvailable && bucketsVisible && (
        <button
          type="button"
          disabled={locked}
          onClick={() => {
            openedByTap.current = !showExact;
            setShowExact(!showExact);
            if (showExact) onPatch({ steps: null });
          }}
          className="text-accent mt-3 text-xs font-semibold disabled:opacity-40"
        >
          {exactMode ? 'use buckets' : 'enter exact'}
        </button>
      )}
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
