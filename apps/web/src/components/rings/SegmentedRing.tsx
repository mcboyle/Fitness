import type { MealState } from '@lifestyle/shared';

interface Props {
  segments: MealState[];
  color: string;
  radius: number;
  stroke: number;
  label: string;
  value: string;
}

/**
 * One arc per meal, so an unhealthy meal can sit in the same ring in the
 * warning colour. A full ring with red in it reads as "three meals, one was
 * junk" — and an unlogged meal stays track-coloured, because "didn't record"
 * and "ate badly" are different things.
 */
export function SegmentedRing({ segments, color, radius, stroke, label, value }: Props) {
  const circumference = 2 * Math.PI * radius;
  const gap = circumference * 0.02;
  const slice = circumference / segments.length;

  return (
    <g role="img" aria-label={`${label}: ${value}`}>
      <circle r={radius} fill="none" stroke="var(--ring-track)" strokeWidth={stroke} />
      {segments.map((segment, i) => (
        <circle
          key={i}
          r={radius}
          fill="none"
          stroke={
            segment === 'healthy'
              ? color
              : segment === 'unhealthy'
                ? 'var(--warn)'
                : 'transparent'
          }
          strokeWidth={stroke}
          strokeLinecap="butt"
          strokeDasharray={`${Math.max(0, slice - gap)} ${circumference - slice + gap}`}
          strokeDashoffset={-i * slice}
          transform="rotate(-90)"
          style={{ transition: 'stroke 400ms ease' }}
        />
      ))}
    </g>
  );
}
