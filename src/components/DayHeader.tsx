import type { Challenge, DailyLog, UserSettings } from '../db/types';
import { cx } from '../lib/cx';
import { SCORED_ITEMS, dayState, scoreCount } from '../lib/scoring';
import {
  addDays,
  dayNumber,
  formatRelativeDay,
  isEditable,
  type IsoDate,
} from '../lib/time';
import {  } from './ui';

interface DayHeaderProps {
  date: IsoDate;
  today: IsoDate;
  challenge: Challenge | undefined;
  log: DailyLog | undefined;
  settings: UserSettings;
  streak: number;
  onDateChange: (date: IsoDate) => void;
  onOpenSettings: () => void;
}

export function DayHeader({
  date,
  today,
  challenge,
  log,
  settings,
  streak,
  onDateChange,
  onOpenSettings,
}: DayHeaderProps) {
  const scored = log ? scoreCount(log, settings) : 0;
  const state = dayState(log, settings, date, today);
  const day = challenge ? dayNumber(challenge.start_date, date) : null;
  const locked = !isEditable(date, today);

  return (
    <header className="grid gap-3">
      <div className="flex items-center gap-2">
        <NavButton
          label="Previous day"
          glyph="‹"
          onClick={() => onDateChange(addDays(date, -1))}
        />
        <div className="min-w-0 flex-1 text-center">
          <div className="font-display text-ink text-4xl leading-none font-black tracking-tight italic">
            {day && day >= 1 ? `DAY ${day}` : formatRelativeDay(date, today)}
          </div>
          <div className="text-faint mt-1 flex items-center justify-center gap-2 text-xs">
            <span>{formatRelativeDay(date, today)}</span>
            {log?.logged_late && (
              <span
                title="Filled in after the day it describes"
                className="bg-warn size-1.5 rounded-full"
              />
            )}
            {locked && <span className="text-faint">· locked</span>}
          </div>
        </div>
        <NavButton
          label="Next day"
          glyph="›"
          disabled={date >= today}
          onClick={() => onDateChange(addDays(date, 1))}
        />
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Settings"
          className="text-muted bg-raised border-line size-10 shrink-0 rounded-full border text-lg"
        >
          ⚙
        </button>
      </div>

      {/*
        Three of the four rings score and one doesn't, and rings look equally
        weighted. This counter is the fix (spec §4): it makes what actually
        counts legible so an unclosed workout ring can't imply a broken day.
      */}
      <div className="bg-raised border-line flex items-center gap-3 rounded-2xl border px-4 py-2.5">
        <span className="font-display text-ink text-lg font-extrabold tabular-nums">
          {streak}
          <span className="text-faint ml-1 text-xs font-semibold">
            day{streak === 1 ? '' : 's'} streak
          </span>
        </span>
        <span
          className={cx(
            'ml-auto font-display text-sm font-extrabold tabular-nums',
            scored >= settings.completion_threshold ? 'text-ok' : 'text-muted',
          )}
        >
          {scored}/{SCORED_ITEMS.length} today
        </span>
        <StateBadge state={state} threshold={settings.completion_threshold} />
      </div>
    </header>
  );
}

function StateBadge({
  state,
  threshold,
}: {
  state: ReturnType<typeof dayState>;
  threshold: number;
}) {
  const copy: Record<string, { text: string; className: string }> = {
    complete: { text: 'complete', className: 'text-ok' },
    missed: { text: 'missed', className: 'text-workout' },
    paused: { text: 'paused', className: 'text-paused' },
    'in-progress': { text: `needs ${threshold}`, className: 'text-faint' },
    future: { text: 'upcoming', className: 'text-faint' },
  };
  const { text, className } = copy[state];

  return (
    <span className={cx('text-xs font-semibold', className)}>{text}</span>
  );
}

function NavButton({
  label,
  glyph,
  onClick,
  disabled,
}: {
  label: string;
  glyph: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="text-muted bg-raised border-line size-10 shrink-0 rounded-full border text-xl leading-none disabled:opacity-30"
    >
      {glyph}
    </button>
  );
}
