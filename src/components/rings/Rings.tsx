import type { RingLayout } from '../../db/types';
import { Ring } from './Ring';
import type { RingSpec } from './specs';

interface RingsProps {
  specs: RingSpec[];
  layout: RingLayout;
  /** 1 on the focused day card, ~0.6 for the partner card in Phase 2. */
  scale?: number;
}

/**
 * Both layouts ship in Phase 1 and switch from settings (spec §11). The ring
 * component takes the same four values either way, so the second layout is a
 * rendering variant rather than a second feature — the point is to decide
 * concentric versus grid on a real device rather than in a mockup.
 */
export function Rings({ specs, layout, scale = 1 }: RingsProps) {
  return layout === 'grid' ? (
    <RingGrid specs={specs} scale={scale} />
  ) : (
    <RingStack specs={specs} scale={scale} />
  );
}

const STACK_SIZE = 172;
const STACK_STROKE = 13;
const STACK_GAP = 4;

function RingStack({ specs, scale }: { specs: RingSpec[]; scale: number }) {
  const size = STACK_SIZE * scale;
  const stroke = STACK_STROKE * scale;
  const gap = STACK_GAP * scale;
  const outer = (size - stroke) / 2;

  return (
    <div className="flex flex-col items-center gap-4">
      <svg
        width={size}
        height={size}
        viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
        aria-label="Daily rings"
      >
        {specs.map((spec, i) => (
          <Ring
            key={spec.key}
            progress={spec.progress}
            color={spec.color}
            radius={outer - i * (stroke + gap)}
            stroke={stroke}
            label={spec.label}
            value={spec.value}
          />
        ))}
      </svg>
      <Legend specs={specs} />
    </div>
  );
}

/** Concentric bands need persistent labels; colour alone can't carry four. */
function Legend({ specs }: { specs: RingSpec[] }) {
  return (
    <ul className="grid w-full grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
      {specs.map((spec) => (
        <li key={spec.key} className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: spec.color }}
          />
          <span className="text-muted truncate">{spec.label}</span>
          <span className="text-faint ml-auto tabular-nums">{spec.value}</span>
        </li>
      ))}
    </ul>
  );
}

const GRID_SIZE = 92;
const GRID_STROKE = 11;

function RingGrid({ specs, scale }: { specs: RingSpec[]; scale: number }) {
  const size = GRID_SIZE * scale;
  const stroke = GRID_STROKE * scale;
  const radius = (size - stroke) / 2;

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-5">
      {specs.map((spec) => (
        <div key={spec.key} className="flex flex-col items-center gap-1.5">
          <svg
            width={size}
            height={size}
            viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
          >
            <Ring
              progress={spec.progress}
              color={spec.color}
              radius={radius}
              stroke={stroke}
              label={spec.label}
              value={spec.value}
            />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-ink font-display text-[15px] font-bold tabular-nums"
            >
              {Math.round(Math.min(spec.progress, 9.99) * 100)}%
            </text>
          </svg>
          <span className="text-ink text-sm font-semibold">{spec.label}</span>
          <span className="text-faint text-xs tabular-nums">{spec.value}</span>
        </div>
      ))}
    </div>
  );
}
