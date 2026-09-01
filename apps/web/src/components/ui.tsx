import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

export function Card({
  children,
  className,
  accent,
}: {
  children: ReactNode;
  className?: string;
  accent?: string;
}) {
  return (
    <section
      className={cx(
        'bg-raised border-line rounded-3xl border p-4',
        className,
      )}
      style={accent ? { borderColor: accent } : undefined}
    >
      {children}
    </section>
  );
}

export function CardLabel({
  children,
  color,
  detail,
}: {
  children: ReactNode;
  color?: string;
  detail?: ReactNode;
}) {
  return (
    <header className="mb-3 flex items-baseline gap-2">
      {color && (
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: color }}
        />
      )}
      <h2 className="text-ink text-sm font-bold tracking-wide uppercase">
        {children}
      </h2>
      {detail && <span className="text-faint ml-auto text-xs">{detail}</span>}
    </header>
  );
}

/** The primary tap target: big, round, and reachable with one thumb. */
export function BigButton({
  children,
  onClick,
  disabled,
  tone = 'accent',
  className,
  'aria-label': ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'accent' | 'quiet';
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cx(
        'rounded-2xl px-4 py-3 font-display font-bold transition active:scale-95',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100',
        tone === 'accent'
          ? 'bg-accent text-accent-contrast'
          : 'bg-sunken text-ink border-line border',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** `glyph` is what you see; `label` is what a screen reader hears. */
export function StepButton({
  glyph = '−',
  label,
  onClick,
  disabled,
}: {
  glyph?: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="bg-sunken text-ink border-line grid size-11 shrink-0 place-items-center rounded-full border text-xl leading-none font-bold transition active:scale-90 disabled:opacity-40 disabled:active:scale-100"
    >
      <span aria-hidden>{glyph}</span>
    </button>
  );
}

export function Chip({
  children,
  selected,
  onClick,
  disabled,
  color,
}: {
  children: ReactNode;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cx(
        'rounded-full border px-3 py-1.5 text-sm font-semibold transition active:scale-95',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100',
        selected
          ? 'text-accent-contrast border-transparent'
          : 'bg-sunken text-muted border-line',
      )}
      style={selected ? { background: color ?? 'var(--accent)' } : undefined}
    >
      {children}
    </button>
  );
}
