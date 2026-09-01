import { ROLLING_GOALS, type RollingWindow } from '@lifestyle/shared';
import { Card } from './ui';

/**
 * Spec §3/§11. Always labelled "last 7 days" — a met goal can un-meet itself as
 * days age out, and the label is what stops that reading as a bug.
 *
 * Documentaries and progress photos have no entry UI until Phase 3; the counts
 * here are live reads of tables that are simply still empty.
 */
export function RollingStrip({
  windows,
}: {
  /** One row per member — these goals are mutually visible like everything else. */
  windows: { name: string; window: RollingWindow }[];
}) {
  return (
    <Card>
      <span className="text-faint text-xs font-bold tracking-wide uppercase">
        Last 7 days
      </span>
      {windows.map(({ name, window }) => (
        <div key={name} className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="text-muted w-full text-xs font-semibold">{name}</span>
          <Goal
            label="Workouts"
            count={window.workouts}
            goal={ROLLING_GOALS.workouts}
            color="var(--ring-workout)"
          />
          <Goal
            label="Docs"
            count={window.documentaries}
            goal={ROLLING_GOALS.documentaries}
            color="var(--ring-reading)"
          />
          <Goal
            label="Photo"
            count={window.photos}
            goal={ROLLING_GOALS.photos}
            color="var(--ring-steps)"
          />
        </div>
      ))}
    </Card>
  );
}

function Goal({
  label,
  count,
  goal,
  color,
}: {
  label: string;
  count: number;
  goal: number;
  color: string;
}) {
  const met = count >= goal;

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted text-sm font-semibold">{label}</span>
      <span className="flex gap-1" aria-hidden>
        {Array.from({ length: goal }, (_, i) => (
          <span
            key={i}
            className="size-2 rounded-full"
            style={{
              background: i < count ? color : 'var(--ring-track)',
            }}
          />
        ))}
      </span>
      <span
        className="text-xs font-bold tabular-nums"
        style={{ color: met ? color : 'var(--text-faint)' }}
      >
        {met && goal === 1 ? '✓' : `${count}/${goal}`}
      </span>
    </div>
  );
}
