import type { RingLayout } from '@lifestyle/shared';
import { Ring } from './Ring';
import { SegmentedRing } from './SegmentedRing';
import type { RingSpec } from './specs';

interface RingsProps {
  specs: RingSpec[];
  layout: RingLayout;
  /** 1 on the focused day card, ~0.6 for a partner card. */
  scale?: number;
}

/**
 * Three layouts, all shipped, decided on a real device (§11's method, if not
 * its conclusion — the spec capped concentric at four and this now draws nine).
 *
 * Nine colours cannot carry identity on their own, so every layout keeps
 * persistent labels. That constraint is most of the argument for `grid`.
 */
export function Rings({ specs, layout, scale = 1 }: RingsProps) {
  if (layout === 'grid') return <RingGrid specs={specs} scale={scale} />;
  if (layout === 'tiered') return <RingTiers specs={specs} scale={scale} />;
  return <RingStack specs={specs} scale={scale} />;
}

/** One arc, or three if this ring tracks meals. */
function Arc({
  spec,
  radius,
  stroke,
}: {
  spec: RingSpec;
  radius: number;
  stroke: number;
}) {
  if (spec.segments) {
    return (
      <SegmentedRing
        segments={spec.segments}
        color={spec.color}
        radius={radius}
        stroke={stroke}
        label={spec.label}
        value={spec.value}
      />
    );
  }
  return (
    <Ring
      progress={spec.progress}
      color={spec.color}
      radius={radius}
      stroke={stroke}
      label={spec.label}
      value={spec.value}
    />
  );
}

function Stack({
  specs,
  size,
  stroke,
  gap,
}: {
  specs: RingSpec[];
  size: number;
  stroke: number;
  gap: number;
}) {
  const outer = (size - stroke) / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
      aria-label="Daily rings"
    >
      {specs.map((spec, i) => (
        <Arc key={spec.key} spec={spec} radius={outer - i * (stroke + gap)} stroke={stroke} />
      ))}
    </svg>
  );
}

/**
 * All nine concentric. At this diameter the bands land near 7px — thin enough
 * that telling them apart is guesswork, which is exactly why the spec stopped
 * at four. Built so the comparison can be made on a phone rather than argued.
 */
function RingStack({ specs, scale }: { specs: RingSpec[]; scale: number }) {
  const size = 210 * scale;
  const stroke = 8 * scale;
  const gap = 3.2 * scale;

  return (
    <div className="flex flex-col items-center gap-4">
      <Stack specs={specs} size={size} stroke={stroke} gap={gap} />
      <Legend specs={specs} />
    </div>
  );
}

/** Six scored rings concentric, three informational ones smaller beneath. */
function RingTiers({ specs, scale }: { specs: RingSpec[]; scale: number }) {
  const scored = specs.filter((s) => s.scored);
  const rest = specs.filter((s) => !s.scored);

  return (
    <div className="flex flex-col items-center gap-4">
      <Stack specs={scored} size={190 * scale} stroke={11 * scale} gap={3.5 * scale} />
      <Legend specs={scored} />
      <div className="border-line flex w-full justify-center gap-5 border-t pt-4">
        {rest.map((spec) => (
          <Cell key={spec.key} spec={spec} size={62 * scale} stroke={8 * scale} compact />
        ))}
      </div>
    </div>
  );
}

/** 3×3. The only layout where nine rings stay individually legible. */
function RingGrid({ specs, scale }: { specs: RingSpec[]; scale: number }) {
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-4">
      {specs.map((spec) => (
        <Cell key={spec.key} spec={spec} size={82 * scale} stroke={10 * scale} />
      ))}
    </div>
  );
}

function Cell({
  spec,
  size,
  stroke,
  compact = false,
}: {
  spec: RingSpec;
  size: number;
  stroke: number;
  compact?: boolean;
}) {
  const radius = (size - stroke) / 2;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}>
        <Arc spec={spec} radius={radius} stroke={stroke} />
        {!spec.segments && (
          <text
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-ink font-display text-[13px] font-bold tabular-nums"
          >
            {Math.round(Math.min(spec.progress, 9.99) * 100)}%
          </text>
        )}
      </svg>
      <span className="text-ink text-center text-[11px] leading-tight font-semibold">
        {spec.label}
      </span>
      {!compact && (
        <span className="text-faint text-center text-[10px] leading-tight tabular-nums">
          {spec.value}
        </span>
      )}
    </div>
  );
}

/** Concentric bands need persistent labels; colour alone can't carry nine. */
function Legend({ specs }: { specs: RingSpec[] }) {
  return (
    <ul className="grid w-full grid-cols-2 gap-x-4 gap-y-1 text-xs">
      {specs.map((spec) => (
        <li key={spec.key} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ background: spec.color }}
          />
          <span className="text-muted truncate">{spec.label}</span>
          <span className="text-faint ml-auto shrink-0 tabular-nums">{spec.value}</span>
        </li>
      ))}
    </ul>
  );
}
