import type { Challenge, RingLayout, StepEntryMode, Theme, UserSettings } from '@lifestyle/shared';
import { cx } from '../lib/cx';
import { SCORED_ITEMS, SCORED_LABELS } from '@lifestyle/shared';
import { APP_TIMEZONE, formatDayLabel, formatMinutes } from '@lifestyle/shared';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Card, CardLabel, Chip } from './ui';

interface SettingsSheetProps {
  settings: UserSettings;
  challenge: Challenge | undefined;
  onChange: (patch: Partial<UserSettings>) => void;
  onClose: () => void;
  onSignOut: () => void;
}

export function SettingsSheet({
  settings,
  challenge,
  onChange,
  onClose,
  onSignOut,
}: SettingsSheetProps) {
  return (
    <div className="bg-surface fixed inset-0 z-20 overflow-y-auto overscroll-contain">
      <div
        className="mx-auto grid max-w-md gap-3 p-4"
        style={{
          /*
           * apple-mobile-web-app-status-bar-style is black-translucent, so an
           * installed app draws under the status bar and the home indicator.
           * Without these insets the sheet's title sits behind the clock and
           * the last card is unreachable.
           */
          paddingTop: 'max(1rem, env(safe-area-inset-top))',
          paddingBottom: 'max(4rem, calc(env(safe-area-inset-bottom) + 4rem))',
        }}
      >
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
            hint="Nine rings. Grid labels them all; tiered puts the six scored ones first; concentric stacks every one. Decide on a real device."
          >
            <Segmented<RingLayout>
              value={settings.ring_layout}
              options={[
                { value: 'grid', label: '3×3 grid' },
                { value: 'tiered', label: 'Tiered' },
                { value: 'concentric', label: 'Concentric' },
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

        <SignInCode />

        <Card>
          <CardLabel>Account</CardLabel>
          <p className="text-faint mb-3 text-xs">
            Signing out clears this device. Your data stays on the server — sign
            back in with the code above to get it all back.
          </p>
          <button
            type="button"
            onClick={onSignOut}
            className="text-workout text-sm font-bold"
          >
            Sign out
          </button>
        </Card>
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

/**
 * The reusable sign-in code.
 *
 * This is the answer to the app asking for a code again after Add to Home
 * Screen: iOS gives an installed web app its own storage, so the session never
 * carries over from Safari, and the invite code was single-use.
 */
function SignInCode() {
  const [code, setCode] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ user: { sign_in_code: string | null } }>('/me')
      .then((me) => !cancelled && setCode(me.user.sign_in_code))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardLabel>Sign in on another device</CardLabel>
      <p className="text-faint mb-3 text-xs">
        Use this code to sign in again — on a new phone, or after adding the app
        to your home screen. It works as many times as you need.
      </p>

      {code ? (
        revealed ? (
          <div className="font-display text-ink bg-sunken border-line rounded-2xl border py-3 text-center text-2xl font-extrabold tracking-widest">
            {code}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="text-accent text-sm font-semibold"
          >
            Show my code
          </button>
        )
      ) : (
        <p className="text-faint text-sm">Connect to the server to see your code.</p>
      )}
    </Card>
  );
}
