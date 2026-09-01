# Lifestyle Tracker

A shared daily-habit tracker for exactly two people, run as a sequence of
75-day challenges. Installable PWA, self-hosted, offline-first.

The design is settled in [`docs/BUILDSPEC.md`](docs/BUILDSPEC.md); the reasoning
behind it is in [`docs/proposal.md`](docs/proposal.md). Read the spec before
changing behaviour — most of what looks like an oversight is a decision.

## Status: Phase 1

Single-user, local-only. IndexedDB is the whole backend; nothing leaves the
device and there is no sync yet.

**Built**

- Four rings — water, reading, steps, workout — in both `concentric` and `grid`
  layouts, switchable from settings.
- Day card: water `+8 oz`, pages, step buckets with an exact option, workout
  minutes and type.
- Five toggle pills, the sleep card with its 7-day trend, and the rolling
  "last 7 days" strip.
- 4-of-6 scoring, the streak, and the today/yesterday edit window.
- Both themes, fully tokenized, with a user toggle.
- One local challenge so the header can number days.

**Not built** — Phase 2 onward: the API and sync, the second user, challenges
and pause requests, photos, measurements, documentaries, reactions, the shared
calendar, the scorecard.

## Running it

```sh
npm install
npm run dev      # http://localhost:5173, also on the LAN
npm run build
npm test         # scoring, streak and edit-window rules
npm run icons    # regenerate the PWA icons from the palette
```

To try it on a phone during Phase 1, hit the dev server's Network URL from
Safari. A real home-screen install needs a trusted HTTPS origin, so it waits on
the Cloudflare Tunnel from §12 of the spec — that lands with Phase 2.

## Progress photos

Stored at `data/media/<user_id>/<uuid>.<ext>` — outside anything Fastify serves
statically, with random names, so no path is guessable. Bytes are reachable
only through a short-lived HMAC-signed URL that names the viewer, and
visibility is re-checked when the file is served, not when the URL is signed.
That is what makes unsharing bite: a signed URL still inside its five-minute
window stops working the moment a photo goes private.

**Uploads keep the original file untouched.** That is a deliberate choice, and
it means EXIF metadata — including GPS coordinates, capture time and device
identifiers — is stored as-is, on a volume that currently has neither
encryption at rest nor an off-box backup. Stripping EXIF in the browser before
upload is a small change if that trade stops being acceptable.

## Backups — read this before trusting it

`scripts/snapshot.sh` takes a timestamped, gzipped copy of the SQLite database
every hour via a systemd timer, keeping the most recent 48. It uses sqlite3's
backup API rather than `cp`, because the database runs in WAL mode and copying
the file alone can capture a torn state.

**This is not a backup in the sense the spec means.** The copies sit on the
same disk as the original, so they protect against a bad migration or an
accidental delete and *not* against losing the disk. BUILDSPEC §12 asks for
Litestream streaming off-box, and that is still outstanding — as is LUKS
encryption of the data volume (§9). Both matter more once Phase 3 puts progress
photos on disk.

```sh
scripts/snapshot.sh                       # snapshot now
systemctl list-timers lifestyle-snapshot  # when the next one runs
```

## Layout

```
src/
  lib/time.ts        day boundaries, the edit window, rolling windows
  lib/scoring.ts     the six scored items, completion, streaks
  lib/rolling.ts     trailing 7-day goals
  db/types.ts        the frozen schema, in TypeScript
  db/db.ts           Dexie: all ten tables, declared now
  db/repo.ts         the only write path — where the edit window is enforced
  components/rings/  hand-rolled SVG rings, both layouts
  styles/tokens.css  every colour in the app
```

## Two ground rules

**No hardcoded colour anywhere outside `styles/tokens.css`.** Both themes ship
at launch, which is cheap only if it's done from the first commit.

**Every `daily_log` write goes through `repo.patchLog`.** That is the single
gate the today/yesterday edit window passes through. Phase 2 has to re-enforce
the same rule server-side — a client-side-only rule makes the streak
decoration.

## Deliberately absent

No Apple Health, no notifications, no cron or background jobs, no journal text,
no calendar weeks, no CRDTs, no third parties.
