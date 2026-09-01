import type { DailyLog, UserSettings } from '@lifestyle/shared';
import { addDays, formatMinutes, type IsoDate } from '@lifestyle/shared';
import { Card, CardLabel, StepButton } from './ui';

const STEP_MINUTES = 30;
const MAX_MINUTES = 14 * 60;

/**
 * Sleep is a card, not a ring: four concentric rings is the ceiling at this
 * diameter (spec §11). Charted as a 7-day trend with no target line, and
 * entered in the morning — asking for last night's sleep at 11 PM means it gets
 * guessed or skipped.
 */
export function SleepCard({
  log,
  settings,
  history,
  date,
  locked,
  onPatch,
}: {
  log: DailyLog;
  settings: UserSettings;
  history: Map<IsoDate, DailyLog>;
  date: IsoDate;
  locked: boolean;
  onPatch: (patch: Partial<DailyLog>) => void;
}) {
  const yesterday = history.get(addDays(date, -1))?.sleep_minutes ?? null;
  const current = log.sleep_minutes;
  const met = (current ?? 0) >= settings.goal_sleep_minutes;

  const bump = (delta: number) => {
    const base = current ?? yesterday ?? settings.goal_sleep_minutes;
    const next = Math.max(0, Math.min(MAX_MINUTES, base + delta));
    onPatch({ sleep_minutes: next });
  };

  return (
    <Card>
      <CardLabel icon="sleep" color="var(--ring-sleep)" detail={met ? 'goal met' : 'last night'}>
        Sleep
      </CardLabel>
      <div className="flex items-center gap-3">
        <StepButton
          glyph="−"
          label="Half an hour less"
          disabled={locked}
          onClick={() => bump(-STEP_MINUTES)}
        />
        <div className="flex-1 text-center">
          {current == null ? (
            <button
              type="button"
              disabled={locked}
              onClick={() =>
                onPatch({ sleep_minutes: yesterday ?? settings.goal_sleep_minutes })
              }
              className="text-accent font-display text-2xl font-extrabold disabled:opacity-40"
            >
              log sleep
            </button>
          ) : (
            <span className="font-display text-ink text-3xl font-extrabold tabular-nums">
              {formatMinutes(current)}
            </span>
          )}
          <span className="text-faint block text-xs">
            goal {formatMinutes(settings.goal_sleep_minutes)}
          </span>
        </div>
        <StepButton
          glyph="+"
          label="Half an hour more"
          disabled={locked}
          onClick={() => bump(STEP_MINUTES)}
        />
      </div>
      <SleepTrend history={history} end={date} />
    </Card>
  );
}

/** Seven bars, no target line — the point is the shape, not a pass/fail. */
function SleepTrend({
  history,
  end,
}: {
  history: Map<IsoDate, DailyLog>;
  end: IsoDate;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(end, i - 6));
  const values = days.map((d) => history.get(d)?.sleep_minutes ?? null);
  const peak = Math.max(MAX_MINUTES / 2, ...values.map((v) => v ?? 0));

  return (
    <div className="mt-4 flex h-16 items-end gap-1.5" aria-hidden>
      {values.map((value, i) => (
        <div key={days[i]} className="flex h-full flex-1 flex-col justify-end">
          <div
            className="bg-accent w-full rounded-t-sm transition-[height] duration-500"
            style={{
              height: value == null ? 2 : `${Math.max(4, (value / peak) * 100)}%`,
              opacity: value == null ? 0.25 : i === 6 ? 1 : 0.55,
            }}
          />
        </div>
      ))}
    </div>
  );
}
