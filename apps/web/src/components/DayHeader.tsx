import type { Challenge, DailyLog, UserSettings } from '@lifestyle/shared';
import { cx } from '../lib/cx';
import { Icon } from './Icon';
import { SCORED_ITEMS, dayState, scoreCount } from '@lifestyle/shared';
import {
  addDays,
  dayNumber,
  formatDayLabel,
  formatRelativeDay,
  isEditable,
  type IsoDate,
} from '@lifestyle/shared';
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
      {/*
        Three columns with the outer two the same width, so the date is centred
        against the page rather than against whatever is left over. A flex row
        can't do this: there is one button on the left and two on the right, so
        "flex-1 text-center" centres the date in the remaining space and it
        lands visibly off to the left.
      */}
      <div className="grid grid-cols-[5.5rem_1fr_5.5rem] items-center gap-2">
        <div>
          <NavButton
            label="Previous day"
            icon="prev"
            onClick={() => onDateChange(addDays(date, -1))}
          />
        </div>
        <div className="min-w-0 text-center">
          {/* The date is what orients you; the challenge day number is trivia. */}
          <div className="font-display text-ink text-3xl leading-none font-black tracking-tight italic">
            {formatDayLabel(date).toUpperCase()}
          </div>
          <div className="text-faint mt-1 flex items-center justify-center gap-2 text-xs">
            <span>{formatRelativeDay(date, today)}</span>
            {day && day >= 1 && <span>· day {day}</span>}
            {log?.logged_late && (
              <span
                title="Filled in after the day it describes"
                className="bg-warn size-1.5 rounded-full"
              />
            )}
            {locked && <span className="text-faint">· locked</span>}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <NavButton
            label="Next day"
            icon="next"
            disabled={date >= today}
            onClick={() => onDateChange(addDays(date, 1))}
          />
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Settings"
            className="text-muted bg-raised border-line grid size-10 shrink-0 place-items-center rounded-full border"
          >
            <Icon name="settings" size={19} />
          </button>
        </div>
      </div>

      {/*
        Three of the four rings score and one doesn't, and rings look equally
        weighted. This counter is the fix (spec §4): it makes what actually
        counts legible so an unclosed workout ring can't imply a broken day.
      */}
      <div className="bg-raised border-line flex items-center gap-2 rounded-2xl border px-4 py-2.5">
        <Icon
          name="streak"
          size={18}
          className={streak > 0 ? 'text-workout' : 'text-faint'}
        />
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
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: 'prev' | 'next';
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="text-muted bg-raised border-line grid size-10 shrink-0 place-items-center rounded-full border disabled:opacity-30"
    >
      <Icon name={icon} size={19} />
    </button>
  );
}
