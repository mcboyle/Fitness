import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { api } from './api/client';
import { clearSession, getSession } from './api/session';
import { onSync, startSyncLoop } from './api/sync';
import { Login } from './components/Login';
import { PartnerCard } from './components/PartnerCard';
import { PauseBanner, type PauseRow } from './components/PauseBanner';
import { BodyView } from './components/BodyView';
import { CalendarView } from './components/CalendarView';
import { DocumentaryCard } from './components/DocumentaryCard';
import { PhotosView } from './components/PhotosView';
import { TabBar, type View } from './components/TabBar';
import { ReactBar, ReactionInbox } from './components/Reactions';
import type { ReactionRow } from './api/reactions';
import { ROLLING_GOALS } from '@lifestyle/shared';
import { DayCard } from './components/DayCard';
import { DayHeader } from './components/DayHeader';
import { RollingStrip } from './components/RollingStrip';
import { SettingsSheet } from './components/SettingsSheet';
import { SleepCard } from './components/SleepCard';
import { TogglePills } from './components/TogglePills';
import { Rings } from './components/rings/Rings';
import { ringSpecs } from './components/rings/specs';
import { db } from './db/db';
import { emptyDailyLog } from '@lifestyle/shared';
import { emptyLog } from './db/defaults';
import { EditWindowError, patchLogAndSync, updateSettings } from './db/repo';
import { isEditable, lastSevenDays, rollingWindow } from '@lifestyle/shared';
import type { DailyLog } from '@lifestyle/shared';
import {
  useChallenge,
  useDocumentaries,
  useLog,
  useLogHistory,
  useMedia,
  useSettings,
  useStreak,
  useThemeAttribute,
  useToday,
} from './hooks/useTracker';

export default function App() {
  const [session, setSessionState] = useState(getSession);

  // The app is useless without an identity: rows are keyed by user, and the
  // edit window and streak are the server's to enforce.
  if (!session) return <Login onSignedIn={() => setSessionState(getSession())} />;
  return <Tracker onSignOut={() => setSessionState(null)} />;
}

function Tracker({ onSignOut }: { onSignOut: () => void }) {
  const session = getSession()!;
  const today = useToday();
  const [date, setDate] = useState(today);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [view, setView] = useState<View>('today');
  const [syncState, setSyncState] = useState<{ status: string; pending: number }>({
    status: 'idle',
    pending: 0,
  });

  useEffect(() => {
    onSync((state) => {
      setSyncState({ status: state.status, pending: state.pending });
      const locked = state.rejections.find((r) => r.reason === 'edit_window');
      if (locked) {
        setNotice('That day is locked on the server. Only today and yesterday can be edited.');
        globalThis.setTimeout(() => setNotice(null), 4000);
      }
    });
    const stop = startSyncLoop();
    return () => {
      onSync(null);
      stop();
    };
  }, []);

  const settings = useSettings();
  const challenge = useChallenge();
  const storedLog = useLog(date);
  const { byDate } = useLogHistory(date, 14);
  const streak = useStreak(settings, today);

  useThemeAttribute(settings?.theme);

  const window7 = lastSevenDays(date);
  const documentaries = useDocumentaries(window7[0], date);
  const media = useMedia(window7[0], date);

  const locked = !isEditable(date, today);

  const onPatch = useCallback(
    (patch: Partial<DailyLog>) => {
      patchLogAndSync(date, patch).catch((error: unknown) => {
        // The window is the only rule that can reject a write here. Say so
        // rather than failing the save silently.
        setNotice(
          error instanceof EditWindowError
            ? 'That day is locked. Only today and yesterday can be edited.'
            : 'Could not save that.',
        );
        setTimeout(() => setNotice(null), 3200);
      });
    },
    [date],
  );

  const partner = usePartner(session.user_id);
  const partnerName = partner.name;
  const allLogs = useAllLogs();
  const myDocumentaries = documentaries.filter((d) => d.user_id === session.user_id);
  const partnerLogs = usePartnerLogs(session.user_id, date);
  const pauses = usePauses();
  const reactions = useReactions();
  const [inboxDismissed, setInboxDismissed] = useState(false);

  const rolling = useMemo(
    () => rollingWindow([...byDate.values()], documentaries, media, date),
    [byDate, documentaries, media, date],
  );

  if (!settings) return <Splash />;

  const log = storedLog ?? emptyLog(date, challenge?.id ?? null);
  const specs = ringSpecs(log, settings);
  /*
   * Render the partner's card whenever we know who they are, not only once
   * they have logged. An idle partner still exists, and a card that vanishes
   * takes the reaction affordance with it — the same mistake as the calendar
   * row (MISTAKES.md #10).
   */
  const partnerLog =
    partnerLogs.find((l) => l.date === date) ??
    (partner.id
      ? emptyDailyLog({
          userId: partner.id,
          date,
          challengeId: challenge?.id ?? null,
          deviceId: 'partner',
        })
      : undefined);

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-4 p-4 pb-10">
      <PauseBanner
        pauses={pauses}
        myUserId={session.user_id}
        partnerName={partnerName}
      />

      {!inboxDismissed && (
        <ReactionInbox
          unseen={reactions.filter(
            (r) => r.from_user_id !== session.user_id && !r.seen_at,
          )}
          onSeen={() => setInboxDismissed(true)}
        />
      )}

      {view !== 'today' && (
        <h1 className="font-display text-ink text-3xl font-black italic">
          {view === 'calendar' ? 'CALENDAR' : view === 'photos' ? 'PHOTOS' : 'BODY'}
        </h1>
      )}

      {view === 'calendar' && (
        <CalendarView
          myUserId={session.user_id}
          myName={session.display_name}
          partnerId={partner.id}
          partnerName={partnerName}
          logs={allLogs}
          pauses={pauses}
          settings={settings}
        />
      )}

      {view === 'photos' && (
        <PhotosView myUserId={session.user_id} partnerName={partnerName} />
      )}

      {view === 'body' && <BodyView myUserId={session.user_id} />}

      {view === 'today' && (
      <>
      <DayHeader
        date={date}
        today={today}
        challenge={challenge}
        log={storedLog}
        settings={settings}
        streak={streak}
        onDateChange={(next) => setDate(next > today ? today : next)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="flex justify-center py-2">
        <Rings specs={specs} layout={settings.ring_layout} />
      </div>

      {locked && (
        <p className="bg-sunken text-faint rounded-2xl px-4 py-2.5 text-center text-xs">
          Frozen — only today and yesterday are editable.{' '}
          <button
            type="button"
            className="text-accent font-semibold"
            onClick={() => setDate(today)}
          >
            Back to today
          </button>
        </p>
      )}

      <DayCard log={log} settings={settings} locked={locked} onPatch={onPatch} />
      <TogglePills log={log} locked={locked} onPatch={onPatch} />
      <SleepCard
        log={log}
        settings={settings}
        history={byDate}
        date={date}
        locked={locked}
        onPatch={onPatch}
      />
      <RollingStrip window={rolling} />

      <DocumentaryCard
        recent={myDocumentaries}
        goal={ROLLING_GOALS.documentaries}
      />

      {partnerLog && settings && (
        <PartnerCard
          name={partnerName}
          log={partnerLog}
          settings={settings}
          layout={settings.ring_layout}
          onFocus={() => undefined}
        >
          <ReactBar
            date={date}
            partnerName={partnerName}
            mine={reactions.filter(
              (r) =>
                r.from_user_id === session.user_id &&
                r.target_kind === 'day' &&
                r.target_date === date,
            )}
          />
        </PartnerCard>
      )}
      </>
      )}

      <TabBar view={view} onChange={setView} />

      <SyncFooter status={syncState.status} pending={syncState.pending} onSignOut={onSignOut} />

      {settingsOpen && (
        <SettingsSheet
          settings={settings}
          challenge={challenge}
          onChange={(patch) => void updateSettings(patch)}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {notice && (
        <div
          role="status"
          className="bg-raised border-line text-ink fixed inset-x-4 bottom-6 z-20 mx-auto max-w-sm rounded-2xl border px-4 py-3 text-center text-sm shadow-lg"
        >
          {notice}
        </div>
      )}
    </div>
  );
}

function Splash() {
  return (
    <div className="grid min-h-full place-items-center">
      <span className="font-display text-faint text-sm">Loading…</span>
    </div>
  );
}

/**
 * The partner's rows arrive through the same pull as ours — the server returns
 * changes for both users (§10) — so this is a plain local read.
 */
function usePartnerLogs(myUserId: string, date: string) {
  return (
    useLiveQuery(
      () => db.daily_log.where('date').equals(date).toArray(),
      [date],
    ) ?? []
  ).filter((log) => log.user_id !== myUserId);
}

function usePauses(): PauseRow[] {
  return (useLiveQuery(() => db.pauses.toArray(), []) ?? []) as unknown as PauseRow[];
}

function SyncFooter({
  status,
  pending,
  onSignOut,
}: {
  status: string;
  pending: number;
  onSignOut: () => void;
}) {
  const label =
    status === 'offline'
      ? pending > 0
        ? `Offline — ${pending} change${pending === 1 ? '' : 's'} waiting`
        : 'Offline'
      : status === 'syncing'
        ? 'Syncing…'
        : status === 'error'
          ? 'Sync failed — will retry'
          : pending > 0
            ? `${pending} waiting`
            : 'Synced';

  return (
    <footer className="text-faint flex items-center gap-3 px-1 pt-2 text-xs">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => {
          clearSession();
          onSignOut();
        }}
        className="ml-auto font-semibold"
      >
        Sign out
      </button>
    </footer>
  );
}

/**
 * `users` isn't a synced table — the only thing the UI needs from it is the
 * partner's name, so it comes from /me and is cached for the session.
 */
/**
 * The partner's id comes from synced data, not from /me.
 *
 * `user_settings` carries a row per user and is pulled for both, so the id is
 * available offline and stays correct however the two of you joined. A /me
 * fetched once at mount goes stale the moment she claims her invite — which is
 * exactly how the shared calendar ended up rendering one row instead of two.
 *
 * Only the display name needs the network, and "Partner" is a fine placeholder.
 */
function usePartner(myUserId: string): { id: string | null; name: string } {
  const [name, setName] = useState('Partner');

  const id =
    useLiveQuery(async () => {
      const settings = await db.user_settings.toArray();
      const other = settings.find((row) => row.user_id !== myUserId);
      if (other) return other.user_id;
      const members = await db.challenge_members.toArray();
      return members.find((m) => m.user_id !== myUserId)?.user_id ?? null;
    }, [myUserId]) ?? null;

  useEffect(() => {
    let cancelled = false;
    api<{ partner: { id: string; display_name: string } | null }>('/me')
      .then((me) => {
        if (!cancelled && me.partner?.display_name) setName(me.partner.display_name);
      })
      .catch(() => {
        // Offline: keep the placeholder until the next pull.
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return { id, name };
}

/** Every stored log for both users — the shared calendar draws from this. */
function useAllLogs() {
  return useLiveQuery(() => db.daily_log.toArray(), []) ?? [];
}

function useReactions(): ReactionRow[] {
  return (useLiveQuery(() => db.reactions.toArray(), []) ?? []) as unknown as ReactionRow[];
}
