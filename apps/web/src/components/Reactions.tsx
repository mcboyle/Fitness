import { useState } from 'react';
import { formatRelativeDay, type IsoDate } from '@lifestyle/shared';
import { sync } from '../api/sync';
import { QUICK_EMOJI, markSeen, react, type ReactionRow } from '../api/reactions';
import { cx } from '../lib/cx';
import { Card } from './ui';

/**
 * §11: emoji reactions and short notes on the other's day. With no push
 * notifications, in-app is the entire social layer — unseen reactions surface
 * on next open. Pull, not push, which is the point.
 */
export function ReactBar({
  date,
  partnerName,
  mine,
}: {
  date: IsoDate;
  partnerName: string;
  mine: ReactionRow[];
}) {
  const [note, setNote] = useState('');
  const [sending, setSending] = useState<string | null>(null);

  const send = async (emoji: string, body?: string) => {
    setSending(emoji);
    try {
      await react({ target_kind: 'day', target_date: date, emoji, body });
      await sync();
      setNote('');
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="mt-3 border-t border-[var(--border)] pt-3">
      <div className="flex flex-wrap items-center gap-2">
        {QUICK_EMOJI.map((emoji) => {
          const already = mine.some((r) => r.emoji === emoji);
          return (
            <button
              key={emoji}
              type="button"
              disabled={sending !== null}
              onClick={() => void send(emoji)}
              aria-label={`React ${emoji} to ${partnerName}'s day`}
              className={cx(
                'rounded-full border px-2.5 py-1 text-base transition active:scale-90',
                already ? 'border-accent bg-accent-soft' : 'border-line bg-sunken',
              )}
            >
              {emoji}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && note.trim() && void send('💬', note.trim())}
          placeholder={`Say something to ${partnerName}`}
          aria-label="Note"
          className="text-ink border-line min-w-0 flex-1 border-b bg-transparent py-1 text-sm outline-none"
        />
        {note.trim() && (
          <button
            type="button"
            onClick={() => void send('💬', note.trim())}
            className="text-accent text-xs font-semibold"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}

/** Unseen reactions from the partner, surfaced on next open. */
export function ReactionInbox({
  unseen,
  onSeen,
}: {
  unseen: ReactionRow[];
  onSeen: () => void;
}) {
  if (unseen.length === 0) return null;

  const dismiss = async () => {
    // Not swallowed: if the server didn't record it, these reappear on the next
    // load, and clearing the badge locally would be a lie.
    const results = await Promise.allSettled(unseen.map((r) => markSeen(r.id)));
    await sync();
    if (results.every((r) => r.status === 'fulfilled')) onSeen();
  };

  return (
    <Card accent="var(--accent)">
      <h2 className="text-ink text-sm font-bold">
        {unseen.length} new {unseen.length === 1 ? 'reaction' : 'reactions'}
      </h2>
      <ul className="mt-2 grid gap-1.5">
        {unseen.map((r) => (
          <li key={r.id} className="flex items-baseline gap-2 text-sm">
            <span className="text-lg leading-none">{r.emoji}</span>
            <span className="text-muted min-w-0 flex-1 truncate">
              {r.body ?? (r.target_date ? formatRelativeDay(r.target_date) : 'your day')}
            </span>
            {r.target_date && r.body && (
              <span className="text-faint shrink-0 text-xs">
                {formatRelativeDay(r.target_date)}
              </span>
            )}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => void dismiss()} className="text-accent mt-3 text-xs font-semibold">
        Mark all seen
      </button>
    </Card>
  );
}
