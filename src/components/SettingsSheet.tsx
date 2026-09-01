import type { Challenge, RingLayout, StepEntryMode, Theme, UserSettings } from '../db/types';
import { cx } from '../lib/cx';
import { SCORED_ITEMS, SCORED_LABELS } from '../lib/scoring';
import { APP_TIMEZONE, formatDayLabel, formatMinutes } from '../lib/time';
import { Card, CardLabel, Chip } from './ui';

interface SettingsSheetProps {
  settings: UserSettings;
  challenge: Challenge | undefined;
  onChange: (patch: Partial<UserSettings>) => void;
  onClose: () => void;
}

export function SettingsSheet({
  settings,
  challenge,
  onChange,
  onClose,
}: SettingsSheetProps) {
  return (
    <div className="bg-surface fixed inset-0 z-10 overflow-y-auto">
      <div className="mx-auto grid max-w-md gap-3 p-4 pb-16">
        <header className="flex items-center gap-3 py-2">
          <h1 className="font-display text-ink text-3xl font-black italic">
            SETTINGS
          </h1>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="text-muted bg-raised border-line ml-auto size-10 rounded-full border text-lg"
          >
            ✕
          </button>
        </header>

        <Card>
          <CardLabel>Appearance</CardLabel>
          <Row label="Theme">
            <Segmented<Theme>
              value={settings.theme}
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
              ]}
              onChange={(theme) => onChange({ theme })}
            />
          </Row>
          <Row
            label="Rings"
            hint="Decide this on a real device, not in a mockup."
          >
            <Segmented<RingLayout>
              value={settings.ring_layout}
              options={[
                { value: 'concentric', label: 'Concentric' },
                { value: 'grid', label: '2×2 grid' },
              ]}
              onChange={(ring_layout) => onChange({ ring_layout })}
            />
          </Row>
        </Card>

        <Card>
          <CardLabel detail={`${settings.completion_threshold} of ${SCORED_ITEMS.length}`}>
            Completion
          </CardLabel>
          <p className="text-faint mb-3 text-xs">
            A day counts as complete at this many of the six scored items. A
            missed day resets the streak to zero.
          </p>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: SCORED_ITEMS.length }, (_, i) => i + 1).map((n) => (
              <Chip
                key={n}
                selected={settings.completion_threshold === n}
                onClick={() => onChange({ completion_threshold: n })}
              >
                {n}
              </Chip>
            ))}
          </div>
          <ul className="text-faint mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {SCORED_ITEMS.map((item) => (
              <li key={item}>{SCORED_LABELS[item]}</li>
            ))}
          </ul>
          <p className="text-faint mt-2 text-xs">
            Workout, whole food, no alcohol and no junk food are tracked and
            charted but don't gate the streak.
          </p>
        </Card>

        <Card>
          <CardLabel>Goals</CardLabel>
          <NumberRow
            label="Water"
            suffix="oz"
            value={settings.goal_water_oz}
            step={8}
            onChange={(goal_water_oz) => onChange({ goal_water_oz })}
          />
          <NumberRow
            label="Reading"
            suffix="pages"
            value={settings.goal_pages}
            step={5}
            onChange={(goal_pages) => onChange({ goal_pages })}
          />
          <NumberRow
            label="Steps"
            suffix="steps"
            value={settings.goal_steps}
            step={500}
            onChange={(goal_steps) => onChange({ goal_steps })}
          />
          <NumberRow
            label="Workout"
            suffix="min"
            value={settings.goal_workout_minutes}
            step={5}
            onChange={(goal_workout_minutes) => onChange({ goal_workout_minutes })}
          />
          <NumberRow
            label="Sleep"
            suffix={formatMinutes(settings.goal_sleep_minutes)}
            value={settings.goal_sleep_minutes}
            step={30}
            onChange={(goal_sleep_minutes) => onChange({ goal_sleep_minutes })}
          />
        </Card>

        <Card>
          <CardLabel>Step entry</CardLabel>
          <Segmented<StepEntryMode>
            value={settings.step_entry_mode}
            options={[
              { value: 'buckets', label: 'Buckets' },
              { value: 'both', label: 'Both' },
              { value: 'exact', label: 'Exact' },
            ]}
            onChange={(step_entry_mode) => onChange({ step_entry_mode })}
          />
        </Card>

        <Card>
          <CardLabel>Challenge</CardLabel>
          {challenge ? (
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-muted">Started</dt>
              <dd className="text-ink text-right">
                {formatDayLabel(challenge.start_date)}
              </dd>
              <dt className="text-muted">Target</dt>
              <dd className="text-ink text-right">
                {challenge.target_days} active days
              </dd>
            </dl>
          ) : (
            <p className="text-faint text-sm">No active challenge.</p>
          )}
          <p className="text-faint mt-3 text-xs">
            Day boundaries use {APP_TIMEZONE}. Editing is limited to today and
            yesterday; older days are frozen.
          </p>
        </Card>

        <p className="text-faint px-1 text-xs">
          Phase 1 — local only. Nothing leaves this device and nothing is
          synced yet.
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-line grid gap-2 border-b py-3 last:border-0 last:pb-0">
      <div className="flex items-baseline gap-2">
        <span className="text-ink text-sm font-semibold">{label}</span>
      </div>
      {children}
      {hint && <p className="text-faint text-xs">{hint}</p>}
    </div>
  );
}

function NumberRow({
  label,
  value,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="border-line flex items-center gap-3 border-b py-2.5 last:border-0 last:pb-0">
      <span className="text-ink flex-1 text-sm font-semibold">{label}</span>
      <button
        type="button"
        aria-label={`Decrease ${label} goal`}
        onClick={() => onChange(Math.max(step, value - step))}
        className="bg-sunken border-line text-ink size-8 rounded-full border font-bold"
      >
        −
      </button>
      <span className="text-ink w-20 text-center text-sm font-bold tabular-nums">
        {value.toLocaleString()}
      </span>
      <button
        type="button"
        aria-label={`Increase ${label} goal`}
        onClick={() => onChange(value + step)}
        className="bg-sunken border-line text-ink size-8 rounded-full border font-bold"
      >
        +
      </button>
      <span className="text-faint w-14 text-right text-xs">{suffix}</span>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="bg-sunken border-line flex gap-1 rounded-full border p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cx(
            'flex-1 rounded-full px-3 py-1.5 text-sm font-semibold transition',
            value === option.value
              ? 'bg-accent text-accent-contrast'
              : 'text-muted',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
