import { MEALS, type DailyLog, type Meal, type MealState } from '@lifestyle/shared';
import { cx } from '../lib/cx';
import { Card, CardLabel } from './ui';

type ToggleKey = 'no_alcohol' | 'self_care' | 'journaled';

interface Toggle {
  key: ToggleKey;
  label: string;
  hint?: string;
  scored: boolean;
}

/**
 * What's left after Eating Healthy absorbed the two food toggles. `journaled`
 * stays a checkbox only — the journal itself is paper and the app never stores
 * its text.
 */
const TOGGLES: Toggle[] = [
  { key: 'self_care', label: 'Self-Care', scored: true },
  { key: 'journaled', label: 'Daily Journal', hint: 'on paper', scored: true },
  { key: 'no_alcohol', label: 'No Alcohol', scored: false },
];

const MEAL_LABELS: Record<Meal, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
};

export function TogglePills({
  log,
  locked,
  onPatch,
}: {
  log: DailyLog;
  locked: boolean;
  onPatch: (patch: Partial<DailyLog>) => void;
}) {
  return (
    <>
      <EatingCard log={log} locked={locked} onPatch={onPatch} />

      <div className="grid grid-cols-2 gap-3">
        {TOGGLES.map((toggle, i) => {
          const on = log[toggle.key];
          const spansRow = i === TOGGLES.length - 1 && TOGGLES.length % 2 === 1;

          return (
            <button
              key={toggle.key}
              type="button"
              disabled={locked}
              aria-pressed={on}
              onClick={() => onPatch({ [toggle.key]: !on })}
              className={cx(
                'flex items-center gap-3 rounded-3xl border p-4 text-left transition active:scale-[0.98]',
                'disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100',
                spansRow && 'col-span-2',
                on ? 'bg-accent-soft border-accent' : 'bg-raised border-line',
              )}
            >
              <span
                aria-hidden
                className={cx(
                  'grid size-6 shrink-0 place-items-center rounded-full border-2 text-xs font-black transition',
                  on ? 'bg-accent border-accent text-accent-contrast' : 'border-line-strong text-transparent',
                )}
              >
                ✓
              </span>
              <span className="min-w-0">
                <span className="text-ink block text-sm font-bold">{toggle.label}</span>
                <span className="text-faint block text-xs">
                  {toggle.hint ?? (toggle.scored ? 'scored' : 'tracked')}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/**
 * Three meals, each healthy or not. Tapping the state a meal already has clears
 * it, because "I didn't record lunch" has to stay reachable — it is a different
 * thing from "lunch was junk", and the ring draws them differently.
 */
function EatingCard({
  log,
  locked,
  onPatch,
}: {
  log: DailyLog;
  locked: boolean;
  onPatch: (patch: Partial<DailyLog>) => void;
}) {
  const logged = MEALS.filter((meal) => log[meal] != null).length;

  const set = (meal: Meal, next: MealState) => {
    onPatch({ [meal]: log[meal] === next ? null : next });
  };

  return (
    <Card>
      <CardLabel color="var(--ring-eating)" detail={`${logged} / ${MEALS.length} logged`}>
        Eating Healthy
      </CardLabel>

      <div className="grid gap-2">
        {MEALS.map((meal) => (
          <div key={meal} className="flex items-center gap-2">
            <span className="text-ink w-20 shrink-0 text-sm font-semibold">
              {MEAL_LABELS[meal]}
            </span>
            <MealChip
              active={log[meal] === 'healthy'}
              disabled={locked}
              tone="var(--ring-eating)"
              onClick={() => set(meal, 'healthy')}
            >
              Healthy
            </MealChip>
            <MealChip
              active={log[meal] === 'unhealthy'}
              disabled={locked}
              tone="var(--warn)"
              onClick={() => set(meal, 'unhealthy')}
            >
              Not great
            </MealChip>
          </div>
        ))}
      </div>
    </Card>
  );
}

function MealChip({
  children,
  active,
  disabled,
  tone,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  disabled?: boolean;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cx(
        'flex-1 rounded-full border px-3 py-1.5 text-sm font-semibold transition active:scale-95',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100',
        active ? 'text-accent-contrast border-transparent' : 'bg-sunken text-muted border-line',
      )}
      style={active ? { background: tone } : undefined}
    >
      {children}
    </button>
  );
}
