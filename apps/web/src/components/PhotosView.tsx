import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDayLabel, today } from '@lifestyle/shared';
import {
  deletePhoto,
  forgetSignedUrls,
  listMedia,
  setVisibility,
  signedUrl,
  uploadPhoto,
  type MediaRow,
} from '../api/media';
import { cx } from '../lib/cx';
import { sync } from '../api/sync';
import { Icon } from './Icon';
import { BigButton, Card } from './ui';

export function PhotosView({
  myUserId,
  nameFor,
  onUploaded,
}: {
  myUserId: string;
  nameFor: (id: string) => string;
  onUploaded: () => void;
}) {
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setMedia(await listMedia());
      setError(null);
    } catch {
      setError('could not reach the server — photos need a connection');
    }
  }, []);

  useEffect(() => {
    // Photos are the one thing that is not in IndexedDB — partner media is
    // fetched on view and memory-cached only (§9.4), so this genuinely is
    // synchronising with an external system. The setState happens after an
    // await, not synchronously, which the lint rule can't see.
    // oxlint-disable-next-line react/set-state-in-effect
    void refresh();
    return forgetSignedUrls;
  }, [refresh]);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadPhoto(file, today());
      await refresh();
      /*
       * Pull straight away rather than waiting for the 60s tick: the photo's
       * metadata row and the rolling "Photo 0/1" both come from the server, so
       * without this the strip sits stale for up to a minute after an upload.
       */
      await sync();
      onUploaded();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'upload failed');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const mine = media.filter((m) => m.user_id === myUserId);
  const theirs = media.filter((m) => m.user_id !== myUserId);

  return (
    <div className="grid gap-4">
      <Card>
        <h2 className="text-ink text-sm font-bold tracking-wide uppercase">Progress photo</h2>
        <p className="text-faint mt-1 mb-3 text-xs">
          Private when you add it. Sharing is a separate tap, one photo at a time.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void onPick(e.target.files?.[0])}
        />
        <BigButton
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          className="flex w-full items-center justify-center gap-2"
        >
          <Icon name="camera" size={18} strokeWidth={2} />
          {busy ? 'Uploading…' : 'Add a photo'}
        </BigButton>
        {error && <p className="text-workout mt-2 text-center text-xs">{error}</p>}
      </Card>

      <Section title="Yours" empty="No photos yet.">
        {mine.map((row) => (
          <Photo key={row.id} row={row} owned onChanged={refresh} />
        ))}
      </Section>

      <Section title="Shared with you" empty="Nobody has shared a photo with you yet.">
        {theirs.map((row) => (
          <Photo
            key={row.id}
            row={row}
            owned={false}
            onChanged={refresh}
            owner={nameFor(row.user_id)}
          />
        ))}
      </Section>
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <section>
      <h3 className="text-faint mb-2 px-1 text-xs font-bold tracking-wide uppercase">
        {title}
      </h3>
      {children.length === 0 ? (
        <p className="text-faint px-1 text-sm">{empty}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">{children}</div>
      )}
    </section>
  );
}

function Photo({
  row,
  owned,
  onChanged,
  owner,
}: {
  row: MediaRow;
  owned: boolean;
  onChanged: () => Promise<void>;
  owner?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    signedUrl(row.id)
      .then((u) => !cancelled && setUrl(u))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [row.id]);

  const shared = row.visibility === 'shared';

  return (
    <Card className="p-2">
      <div className="bg-sunken mb-2 aspect-[3/4] overflow-hidden rounded-2xl">
        {url ? (
          <img src={url} alt={`Progress photo from ${row.taken_on}`} className="size-full object-cover" />
        ) : (
          <div className="text-faint grid size-full place-items-center text-xs">…</div>
        )}
      </div>

      <div className="flex items-center gap-2 px-1">
        <span className="text-faint text-xs">
          {owner ? `${owner} · ` : ''}
          {formatDayLabel(row.taken_on)}
        </span>
        {owned && (
          <span
            className={cx('ml-auto text-xs font-bold', shared ? 'text-ok' : 'text-faint')}
          >
            {shared ? 'shared' : 'private'}
          </span>
        )}
      </div>

      {owned && (
        <div className="mt-2 flex gap-2 px-1">
          <button
            type="button"
            onClick={async () => {
              await setVisibility(row.id, shared ? 'private' : 'shared');
              await onChanged();
            }}
            className="text-accent text-xs font-semibold"
          >
            {shared ? 'Unshare' : 'Share'}
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!confirming) return setConfirming(true);
              await deletePhoto(row.id);
              await onChanged();
            }}
            className="text-faint ml-auto text-xs font-semibold"
          >
            {confirming ? 'Really delete?' : 'Delete'}
          </button>
        </div>
      )}

      {owned && shared && (
        <p className="text-faint mt-2 px-1 text-[11px] leading-snug">
          Unsharing hides this going forward. It can't undo a screenshot.
        </p>
      )}
    </Card>
  );
}
