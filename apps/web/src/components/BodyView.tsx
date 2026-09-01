import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatDayLabel, today, type Measurement } from '@lifestyle/shared';
import { db } from '../db/db';
import { saveMeasurement } from '../db/repo';
import { BigButton, Card, CardLabel } from './ui';

const FIELDS = [
  { key: 'weight_lb', label: 'Weight', unit: 'lb', step: 0.1 },
  { key: 'waist_in', label: 'Waist', unit: 'in', step: 0.25 },
  { key: 'hip_in', label: 'Hips', unit: 'in', step: 0.25 },
  { key: 'arm_in', label: 'Arms', unit: 'in', step: 0.25 },
  { key: 'thigh_in', label: 'Thighs', unit: 'in', step: 0.25 },
] as const;

type FieldKey = (typeof FIELDS)[number]['key'];

/**
 * Deliberately outside the ring and streak system (§11). No target line, no
 * streak, no goal state: body metrics respond over weeks and fluctuate daily
 * for reasons unrelated to adherence, so scoring them punishes normal
 * variation.
 */
export function BodyView({ myUserId }: { myUserId: string }) {
  const [draft, setDraft] = useState<Partial<Record<FieldKey, string>>>({});
  const [saving, setSaving] = useState(false);

  const all = useLiveQuery(() => db.measurements.toArray(), []) ?? [];
  const mine = all
    .filter((m) => m.user_id === myUserId)
    .sort((a, b) => b.taken_on.localeCompare(a.taken_on));

  const anyEntered = FIELDS.some((f) => (draft[f.key] ?? '').trim() !== '');

  const save = async () => {
    setSaving(true);
    const patch: Record<string, number | null> = {};
    for (const field of FIELDS) {
      const raw = (draft[field.key] ?? '').trim();
      patch[field.key] = raw === '' ? null : Number(raw);
    }
    await saveMeasurement({ taken_on: today(), ...patch });
    setDraft({});
    setSaving(false);
  };

  return (
    <div className="grid gap-4">
      <Card>
        <CardLabel detail={formatDayLabel(today())}>Measurements</CardLabel>
        <div className="grid gap-2">
          {FIELDS.map((field) => (
            <label key={field.key} className="flex items-center gap-3">
              <span className="text-ink w-20 text-sm font-semibold">{field.label}</span>
              <input
                type="number"
                inputMode="decimal"
                step={field.step}
                value={draft[field.key] ?? ''}
                placeholder="—"
                onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                aria-label={field.label}
                className="font-display text-ink border-line-strong min-w-0 flex-1 border-b bg-transparent py-1 text-xl font-bold tabular-nums outline-none"
              />
              <span className="text-faint w-6 text-xs">{field.unit}</span>
            </label>
          ))}
        </div>
        <BigButton
          onClick={() => void save()}
          disabled={!anyEntered || saving}
          className="mt-4 w-full"
        >
          {saving ? 'Saving…' : 'Save measurement'}
        </BigButton>
        <p className="text-faint mt-2 text-center text-xs">
          Charted over time. No target, no streak — these move over weeks.
        </p>
      </Card>

      {FIELDS.map((field) => (
        <Trend key={field.key} label={field.label} unit={field.unit} field={field.key} rows={mine} />
      ))}

      {mine.length === 0 && (
        <p className="text-faint px-1 text-sm">No measurements yet.</p>
      )}
    </div>
  );
}

/** A line, no target line. The shape is the point. */
function Trend({
  label,
  unit,
  field,
  rows,
}: {
  label: string;
  unit: string;
  field: FieldKey;
  rows: Measurement[];
}) {
  const points = rows
    .filter((r) => r[field] != null)
    .sort((a, b) => a.taken_on.localeCompare(b.taken_on));

  if (points.length === 0) return null;

  const values = points.map((p) => p[field] as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const latest = values[values.length - 1];
  const first = values[0];
  const delta = latest - first;

  const path = points
    .map((p, i) => {
      const x = points.length === 1 ? 50 : (i / (points.length - 1)) * 100;
      const y = 100 - (((p[field] as number) - min) / span) * 100;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <Card>
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-ink text-sm font-bold">{label}</h3>
        <span className="font-display text-ink ml-auto text-xl font-extrabold tabular-nums">
          {latest}
          <span className="text-faint ml-1 text-xs font-semibold">{unit}</span>
        </span>
        {points.length > 1 && (
          <span className="text-faint text-xs tabular-nums">
            {delta > 0 ? '+' : ''}
            {delta.toFixed(1)}
          </span>
        )}
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-16 w-full" aria-hidden>
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="text-faint mt-1 flex justify-between text-[11px]">
        <span>{formatDayLabel(points[0].taken_on)}</span>
        <span>{formatDayLabel(points[points.length - 1].taken_on)}</span>
      </div>
    </Card>
  );
}
