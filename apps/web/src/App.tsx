import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { clearSession, getSession } from './api/session';
import { onSync, startSyncLoop } from './api/sync';
import { checkVersion } from './api/version';
import { Login } from './components/Login';
import { PartnerCard } from './components/PartnerCard';
import { PauseBanner, type PauseRow } from './components/PauseBanner';
import { BodyView } from './components/BodyView';
import { CalendarView } from './components/CalendarView';
import { DocumentaryCard } from './components/DocumentaryCard';
import { PhotosView } from './components/PhotosView';
import { TabBar, type View } from './components/TabBar';
import { ReactBar, ReactionInbox } from './components/Reactions';
import { Confetti, type Intensity } from './components/Confetti';
import { IconSprite } from './components/Icon';
import { useMembers } from './hooks/useMembers';
import { SCORED_ITEMS, scoredStatus, ROLLING_GOALS as GOALS } from '@lifestyle/shared';
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
  usePhotoDays,
  useSettings,
  useStreak,
  useThemeAttribute,
  useToday,
} from './hooks/useTracker';

export default function App() {
  const [session, setSessionState] = useState(getSession);
  const [stale, setStale] = useState(false);

  /*
   * Checked before anything else and on every foreground: a client running an
   * old bundle can be wrong about the API in ways that look like data bugs —
   * which is exactly how a spent invite code got blamed on the sign-in feature.
   */
  useEffect(() => {
    const check = () => {
      void checkVersion().then((state) => setStale(state === 'stale'));
    };
    check();
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, []);

  const banner = stale ? <StaleBanner /> : null;

  // The app is useless without an identity: rows are keyed by user, and the
  // edit window and streak are the server's to enforce.
  if (!session) {
    return (
      <>
        <IconSprite />
        {banner}
        <Login onSignedIn={() => setSessionState(getSession())} />
      </>
    );
  }
  return (
    <>
      <IconSprite />
      {banner}
      <Tracker onSignOut={() => setSessionState(null)} />
    </>
  );
}

/**
 * Only shown when the automatic update could not fix it, so the instruction has
 * to be something a phone can actually do.
 */
function StaleBanner() {
  return (
    <div className="bg-accent text-accent-contrast sticky top-0 z-30 px-4 py-2 text-center text-xs font-semibold">
      This app is out of date. Fully close it and open it again to update.
    </div>
  );
}

function Tracker({ onSignOut }: { onSignOut: () => void }) {
  const session = getSession()!;
  const today = useToday();
  const [date, setDate] = useState(today);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [view, setView] = useState<View>('today');
  const [celebrating, setCelebrating] = useState<{ intensity: Intensity; key: number } | null>(null);
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
  const myStreak = useStreak(settings, today);

  useThemeAttribute(settings?.theme);

  const window7 = lastSevenDays(date);
  const documentaries = useDocumentaries(window7[0], date);
  const photoDays = usePhotoDays(window7[0], date);

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

  const { list: members, nameFor } = useMembers(session.user_id);
  // The app supports up to 20 people; the day view stays legible by showing the
  // first alongside you and letting the calendar carry the rest.
  const primary = members[0] ?? null;
  const primaryStreak = useStreak(settings, today, primary?.id);

  /* Yours first. Someone with no account yet has no streak to show. */
  const streaks = useMemo(
    () => [
      { name: 'you', streak: myStreak },
      ...(primary ? [{ name: primary.display_name.toLowerCase(), streak: primaryStreak }] : []),
    ],
    [myStreak, primary, primaryStreak],
  );
  const allLogs = useAllLogs();
  const partnerLogs = usePartnerLogs(session.user_id, date);
  const pauses = usePauses();
  const reactions = useReactions();
  const [inboxDismissed, setInboxDismissed] = useState(false);

  /** One rolling window per member — these goals are mutually visible (§1). */
  const rollingWindows = useMemo(() => {
    const logs = [...byDate.values(), ...partnerLogs];
    const people = [
      { id: session.user_id, name: 'You' },
      ...members.map((m) => ({ id: m.id, name: m.display_name })),
    ];
    return people.map(({ id, name }) => ({
      name,
      window: rollingWindow(
        logs.filter((l) => l.user_id === id),
        documentaries.filter((d) => d.user_id === id),
        photoDays.filter((d) => d.user_id === id),
        date,
      ),
    }));
  }, [byDate, partnerLogs, documentaries, photoDays, date, session.user_id, members]);

  /*
   * A short burst each time a single ring closes, and a long one when all nine
   * are closed at once.
   *
   * Both are transitions, not states: closing a ring that was already closed is
   * not an event, and neither is reopening the app on a finished day. The refs
   * seed from the first render, which is what keeps launch quiet.
   */
  const prevRings = useRef<Record<string, boolean> | null>(null);
  const prevAllNine = useRef<boolean | null>(null);
  const prevGoals = useRef<Record<string, boolean> | null>(null);

  useEffect(() => {
    if (!settings) return;

    const rings = storedLog
      ? scoredStatus(storedLog, settings)
      : (Object.fromEntries(SCORED_ITEMS.map((k) => [k, false])) as Record<string, boolean>);
    const allNine = SCORED_ITEMS.every((item) => rings[item]);

    const window7 = rollingWindows[0]?.window;
    const goals = {
      workouts: !!window7 && window7.workouts >= GOALS.workouts,
      documentaries: !!window7 && window7.documentaries >= GOALS.documentaries,
      photos: !!window7 && window7.photos >= GOALS.photos,
    };

    const first = prevRings.current === null;
    const ringJustClosed =
      !first && SCORED_ITEMS.some((item) => rings[item] && !prevRings.current![item]);
    const allJustClosed = !first && allNine && !prevAllNine.current;
    const goalJustMet =
      !first &&
      prevGoals.current !== null &&
      Object.entries(goals).some(([key, met]) => met && !prevGoals.current![key]);

    prevRings.current = rings;
    prevAllNine.current = allNine;
    prevGoals.current = goals;

    // Closing the ninth ring closes a ring *and* completes the set; the big one
    // wins, or the two would fire on top of each other.
    if (allJustClosed || ringJustClosed || goalJustMet) {
      // oxlint-disable-next-line react/set-state-in-effect
      setCelebrating({
        intensity: allJustClosed ? 'big' : 'small',
        key: Date.now(),
      });
    }
  }, [settings, storedLog, rollingWindows]);

  if (!settings) return <Splash />;

  const log = storedLog ?? emptyLog(date, challenge?.id ?? null);
  const specs = ringSpecs(log, settings);
  /*
   * Render the partner's card whenever we know who they are, not only once
   * they have logged. An idle partner still exists, and a card that vanishes
   * takes the reaction affordance with it — the same mistake as the calendar
   * row (MISTAKES.md #10).
   */
  const primaryLog = primary
    ? (partnerLogs.find((l) => l.date === date && l.user_id === primary.id) ??
      emptyDailyLog({
        userId: primary.id,
        date,
        challengeId: challenge?.id ?? null,
        deviceId: 'partner',
      }))
    : undefined;

  return (
    <div
      className="mx-auto flex min-h-full max-w-md flex-col gap-4 p-4"
      style={{
        /*
         * Installed on iOS the web view draws under the status bar and the home
         * indicator, because apple-mobile-web-app-status-bar-style is
         * black-translucent. Without this the day header sits behind the clock
         * and the settings gear behind the battery.
         */
        // The day header supplies its own top inset because it is sticky;
        // the other views get theirs from the title below.
        paddingTop: view === 'today' ? 0 : TOP_INSET,
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
      }}
    >
      <PauseBanner pauses={pauses} myUserId={session.user_id} nameFor={nameFor} />

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
          memberIds={members.map((m) => m.id)}
          nameFor={nameFor}
          logs={allLogs}
          pauses={pauses}
          settings={settings}
          startDate={challenge?.start_date}
        />
      )}

      {view === 'photos' && (
        <PhotosView
          myUserId={session.user_id}
          nameFor={nameFor}
          onUploaded={() => setCelebrating({ intensity: 'small', key: Date.now() })}
        />
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
        streaks={streaks}
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
      <RollingStrip windows={rollingWindows} />

      <DocumentaryCard
        recent={documentaries}
        goal={ROLLING_GOALS.documentaries}
        myUserId={session.user_id}
        nameFor={nameFor}
      />

      {primaryLog && primary && settings && (
        <PartnerCard
          name={primary.display_name}
          log={primaryLog}
          settings={settings}
          layout={settings.ring_layout}
          onFocus={() => undefined}
        >
          <ReactBar
            date={date}
            partnerName={primary.display_name}
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

      <SyncTrouble status={syncState.status} pending={syncState.pending} />

      <TabBar view={view} onChange={setView} />

      <Confetti fire={celebrating} onDone={() => setCelebrating(null)} />


      {settingsOpen && (
        <SettingsSheet
          settings={settings}
          challenge={challenge}
          onChange={(patch) => void updateSettings(patch)}
          onClose={() => setSettingsOpen(false)}
          onSignOut={() => {
            clearSession();
            onSignOut();
          }}
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

const TOP_INSET = 'max(1.25rem, calc(env(safe-area-inset-top) + 0.5rem))';

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

/**
 * Only speaks up when something is wrong.
 *
 * A permanent "Synced" line is noise — it says nothing on the overwhelming
 * majority of renders, and it sat below the sticky tab bar leaving dead space
 * under it. Offline with queued writes is worth knowing about; everything
 * working is not.
 */
function SyncTrouble({ status, pending }: { status: string; pending: number }) {
  if (status !== 'offline' && status !== 'error') return null;

  return (
    <p className="bg-sunken text-faint rounded-2xl px-4 py-2 text-center text-xs">
      {status === 'offline'
        ? pending > 0
          ? `Offline — ${pending} change${pending === 1 ? '' : 's'} will sync when you reconnect`
          : 'Offline — your entries are saved on this device'
        : 'Sync failed — retrying'}
    </p>
  );
}

/** Every stored log for both users — the shared calendar draws from this. */
function useAllLogs() {
  return useLiveQuery(() => db.daily_log.toArray(), []) ?? [];
}

function useReactions(): ReactionRow[] {
  return (useLiveQuery(() => db.reactions.toArray(), []) ?? []) as unknown as ReactionRow[];
}

