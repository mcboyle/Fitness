import { useState } from 'react';
import { formatDayLabel, today, type Documentary } from '@lifestyle/shared';
import { deleteDocumentary, saveDocumentary } from '../db/repo';
import { BigButton, Card, CardLabel } from './ui';

/**
 * Documentaries get rows rather than a counter, because the titles are worth
 * keeping — the rolling goal is then a count over the trailing seven days and
 * you get a watch history for free (§8).
 */
export function DocumentaryCard({
  recent,
  goal,
  nameFor,
  myUserId,
}: {
  /** Everyone's, not just yours — documentaries are mutually visible (§1). */
  recent: Documentary[];
  goal: number;
  nameFor: (userId: string) => string;
  myUserId: string;
}) {
  const [title, setTitle] = useState('');
  const [open, setOpen] = useState(false);

  const add = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    await saveDocumentary({ watched_on: today(), title: trimmed });
    setTitle('');
    setOpen(false);
  };

  return (
    <Card>
      <CardLabel detail={`you ${recent.filter((r) => r.user_id === myUserId).length}/${goal} last 7 days`}>
        Documentaries
      </CardLabel>

      {recent.length > 0 && (
        <ul className="mb-3 grid gap-1">
          {recent.map((row) => (
            <li key={row.id} className="flex items-baseline gap-2 text-sm">
              <span className="text-ink truncate">{row.title}</span>
              {row.user_id !== myUserId && (
                <span className="text-faint shrink-0 text-xs">{nameFor(row.user_id)}</span>
              )}
              <span className="text-faint ml-auto shrink-0 text-xs">
                {formatDayLabel(row.watched_on)}
              </span>
              {row.user_id === myUserId && (
                <button
                  type="button"
                  onClick={() => void deleteDocumentary(row.id)}
                  aria-label={`Delete ${row.title}`}
                  className="text-faint shrink-0 px-1 text-sm leading-none"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <div className="flex gap-2">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
            placeholder="Title"
            aria-label="Documentary title"
            className="text-ink border-line-strong min-w-0 flex-1 border-b bg-transparent py-1 text-base outline-none"
          />
          <BigButton onClick={() => void add()} disabled={!title.trim()}>
            Add
          </BigButton>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-accent text-xs font-semibold"
        >
          + log a documentary
        </button>
      )}
    </Card>
  );
}
