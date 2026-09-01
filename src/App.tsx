import { useCallback, useMemo, useState } from 'react';
import { DayCard } from './components/DayCard';
import { DayHeader } from './components/DayHeader';
import { RollingStrip } from './components/RollingStrip';
import { SettingsSheet } from './components/SettingsSheet';
import { SleepCard } from './components/SleepCard';
import { TogglePills } from './components/TogglePills';
import { Rings } from './components/rings/Rings';
import { ringSpecs } from './components/rings/specs';
import { emptyLog } from './db/defaults';
import { EditWindowError, patchLog, updateSettings } from './db/repo';
import type { DailyLog } from './db/types';
import { rollingWindow } from './lib/rolling';
import { isEditable, lastSevenDays } from './lib/time';
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
  const today = useToday();
  const [date, setDate] = useState(today);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
      patchLog(date, patch).catch((error: unknown) => {
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

  const rolling = useMemo(
    () => rollingWindow([...byDate.values()], documentaries, media, date),
    [byDate, documentaries, media, date],
  );

  if (!settings) return <Splash />;

  const log = storedLog ?? emptyLog(date, challenge?.id ?? null);
  const specs = ringSpecs(log, settings);

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-4 p-4 pb-10">
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
