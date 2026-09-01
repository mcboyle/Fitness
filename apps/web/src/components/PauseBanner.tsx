import { effectivePauseStatus, formatDayLabel } from '@lifestyle/shared';
import { api } from '../api/client';
import { sync } from '../api/sync';
import { BigButton, Card } from './ui';

export interface PauseRow {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: string;
  created_at: string;
}

/**
 * Pending requests sit at the top of the partner's home screen — without push
 * there is no icon badge, so this is the only place a request can surface (§7).
 */
export function PauseBanner({
  pauses,
  myUserId,
  partnerName,
}: {
  pauses: PauseRow[];
  myUserId: string;
  partnerName: string;
}) {
  const now = new Date();
  const awaitingMe = pauses.filter(
    (p) => p.user_id !== myUserId && effectivePauseStatus(p, now) === 'pending',
  );
  const mine = pauses.filter(
    (p) => p.user_id === myUserId && effectivePauseStatus(p, now) === 'pending',
  );

  if (awaitingMe.length === 0 && mine.length === 0) return null;

  const resolve = async (id: string, decision: 'approve' | 'decline') => {
    await api(`/pauses/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    });
    await sync();
  };

  return (
    <>
      {awaitingMe.map((pause) => (
        <Card key={pause.id} accent="var(--accent)">
          <h2 className="text-ink text-sm font-bold">
            {partnerName} asked to pause
          </h2>
          <p className="text-muted mt-1 text-sm">
            {formatDayLabel(pause.start_date)}
            {pause.end_date !== pause.start_date && ` – ${formatDayLabel(pause.end_date)}`}
            {pause.reason && ` · ${pause.reason}`}
          </p>
          <p className="text-faint mt-2 text-xs">
            Approves on its own in 24 hours if you don't answer.
          </p>
          <div className="mt-3 flex gap-2">
            <BigButton onClick={() => void resolve(pause.id, 'approve')} className="flex-1">
              Approve
            </BigButton>
            <BigButton
              tone="quiet"
              onClick={() => void resolve(pause.id, 'decline')}
              className="flex-1"
            >
              Decline
            </BigButton>
          </div>
        </Card>
      ))}

      {mine.map((pause) => (
        <Card key={pause.id}>
          <p className="text-muted text-sm">
            Your pause for {formatDayLabel(pause.start_date)} is waiting on{' '}
            {partnerName}. It approves automatically in 24 hours.
          </p>
        </Card>
      ))}
    </>
  );
}
