import type { DailyLog } from '../db/types';
import { cx } from '../lib/cx';

type ToggleKey =
  | 'whole_food'
  | 'no_alcohol'
  | 'no_junk_food'
  | 'self_care'
  | 'journaled';

interface Toggle {
  key: ToggleKey;
  label: string;
  hint?: string;
  scored: boolean;
}

/**
 * Four food/self-care toggles plus journaled (spec §11). `journaled` is a
 * checkbox only — the journal itself is paper and the app never stores its text.
 */
const TOGGLES: Toggle[] = [
  { key: 'whole_food', label: 'Whole food', scored: false },
  { key: 'no_alcohol', label: 'No alcohol', scored: false },
  { key: 'no_junk_food', label: 'No junk food', scored: false },
  { key: 'self_care', label: 'Self-Care', scored: true },
  { key: 'journaled', label: 'Daily Journal', hint: 'on paper', scored: true },
];

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
              on
                ? 'bg-accent-soft border-accent'
                : 'bg-raised border-line',
            )}
          >
            <span
              aria-hidden
              className={cx(
                'grid size-6 shrink-0 place-items-center rounded-full border-2 text-xs font-black transition',
                on
                  ? 'bg-accent border-accent text-accent-contrast'
                  : 'border-line-strong text-transparent',
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
  );
}
