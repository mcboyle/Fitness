interface RingProps {
  progress: number;
  color: string;
  /** Distance from centre to the middle of the band. */
  radius: number;
  stroke: number;
  label: string;
  value: string;
}

/**
 * One SVG circle, dasharray/dashoffset animated in CSS. No charting library —
 * hand-rolled is well under 100 lines (spec §11).
 */
export function Ring({ progress, color, radius, stroke, label, value }: RingProps) {
  const circumference = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(progress, 1));
  const offset = circumference * (1 - filled);
  const overflowed = progress >= 1;

  return (
    <g role="img" aria-label={`${label}: ${value}`}>
      <circle
        r={radius}
        fill="none"
        stroke="var(--ring-track)"
        strokeWidth={stroke}
      />
      <circle
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90)"
        style={{
          transition: 'stroke-dashoffset 600ms cubic-bezier(0.22, 1, 0.36, 1)',
          filter: overflowed ? `drop-shadow(0 0 6px ${color})` : undefined,
        }}
      />
    </g>
  );
}
