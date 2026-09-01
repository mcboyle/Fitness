import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatDayLabel, today, type Measurement } from '@lifestyle/shared';
import { db } from '../db/db';
import { deleteMeasurement, saveMeasurement } from '../db/repo';
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
  const [editing, setEditing] = useState<Measurement | null>(null);
  const [saving, setSaving] = useState(false);

  const all = useLiveQuery(() => db.measurements.toArray(), []) ?? [];
  const mine = all
    .filter((m) => m.user_id === myUserId && !m.deleted_at)
    .sort((a, b) => b.taken_on.localeCompare(a.taken_on));

  /** Load an existing entry into the form so it can be corrected in place. */
  const edit = (row: Measurement) => {
    setEditing(row);
    setDraft(
      Object.fromEntries(
        FIELDS.map((f) => [f.key, row[f.key] == null ? '' : String(row[f.key])]),
      ),
    );
    globalThis.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const anyEntered = FIELDS.some((f) => (draft[f.key] ?? '').trim() !== '');

  const save = async () => {
    setSaving(true);
    const patch: Record<string, number | null> = {};
    for (const field of FIELDS) {
      const raw = (draft[field.key] ?? '').trim();
      patch[field.key] = raw === '' ? null : Number(raw);
    }
    await saveMeasurement({
      // Keep the id and date when correcting, so an edit replaces the entry
      // rather than adding a second one for the same day.
      id: editing?.id,
      created_at: editing?.created_at,
      taken_on: editing?.taken_on ?? today(),
      ...patch,
    });
    setDraft({});
    setEditing(null);
    setSaving(false);
  };

  return (
    <div className="grid gap-4">
      <Card>
        <CardLabel detail={formatDayLabel(editing?.taken_on ?? today())}>
          {editing ? 'Editing measurement' : 'Measurements'}
        </CardLabel>
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
        <div className="mt-4 flex gap-2">
          <BigButton
            onClick={() => void save()}
            disabled={!anyEntered || saving}
            className="flex-1"
          >
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Save measurement'}
          </BigButton>
          {editing && (
            <BigButton
              tone="quiet"
              onClick={() => {
                setEditing(null);
                setDraft({});
              }}
            >
              Cancel
            </BigButton>
          )}
        </div>
        <p className="text-faint mt-2 text-center text-xs">
          Charted over time. No target, no streak — these move over weeks.
        </p>
      </Card>

      {FIELDS.map((field) => (
        <Trend key={field.key} label={field.label} unit={field.unit} field={field.key} rows={mine} />
      ))}

      {mine.length > 0 && (
        <Card>
          <CardLabel detail={`${mine.length} entries`}>History</CardLabel>
          <ul className="grid gap-1">
            {mine.map((row) => (
              <li key={row.id} className="flex items-baseline gap-3 text-sm">
                <span className="text-ink w-20 shrink-0">
                  {formatDayLabel(row.taken_on)}
                </span>
                <span className="text-muted min-w-0 flex-1 truncate tabular-nums">
                  {FIELDS.filter((f) => row[f.key] != null)
                    .map((f) => `${row[f.key]}${f.unit === 'lb' ? 'lb' : '"'}`)
                    .join(' · ') || '—'}
                </span>
                <button
                  type="button"
                  onClick={() => edit(row)}
                  className="text-accent shrink-0 text-xs font-semibold"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void deleteMeasurement(row.id)}
                  aria-label={`Delete measurement from ${row.taken_on}`}
                  className="text-faint shrink-0 px-1 leading-none"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

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
