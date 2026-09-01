# CLAUDE.md

A shared daily-habit tracker for exactly two people, run as sequential 75-day
challenges. Installable PWA, self-hosted, offline-first.

## Read this first

[`docs/BUILDSPEC.md`](docs/BUILDSPEC.md) is the authority. Every decision in it
is settled, and most of what looks like an oversight is a deliberate choice with
a stated reason. [`docs/proposal.md`](docs/proposal.md) has the longer
reasoning. **Check the spec before "fixing" a behaviour.**

**One deliberate divergence from the spec.** §4 sets the default
`completion_threshold` to 3; it ships as **4**, decided after device testing.
Everything else in the spec stands as written.

Things that look like bugs and are not:

- **Workout fills a ring but doesn't score.** Its goal is 4 in a rolling 7 days,
  so a rest day must never read as a failure (§4).
- **A met 7-day goal can un-meet itself.** The window is rolling, not a calendar
  week. That's why it's labelled "last 7 days" everywhere (§3).
- **Sleep is a card, not a ring.** Four concentric rings is the ceiling at
  150px (§11).
- **The journal has no table.** It's paper; the app stores one checkbox (§8).
- **Measurements have no `visibility` column.** Photos are the *only* per-item
  privacy decision in the system (§9).

## The mistakes protocol

**Anything that fails gets an entry in [`MISTAKES.md`](MISTAKES.md).** Not just
bugs in the app — a command that silently ate its own chain, a check that
passed when it shouldn't have, a wrong assumption about a library.

**The second time the same root cause appears, stop and build a guard.** A
script, a check, a lint rule — something that makes the mistake structurally
impossible or loudly visible. Link it from the entry.

**Verify the guard by reintroducing the bug.** A check that can't fail is worse
than no check: it converts "untested" into "verified". Entry #2 in MISTAKES.md
was proved this way and entry #5 exists because a guard silently passed against
a stale build.

## Commands

```sh
npm run dev      # vite, also served on the LAN
npm test         # scoring, streak, edit-window rules
npm run lint
npm run build
npm run smoke    # builds, then loads the app in a real browser and asserts
npm run shots    # screenshots: both themes x both ring layouts, phone-sized
npm run check    # lint + test + smoke — run this before committing
npm run icons    # regenerate PWA icons from the palette
npm run api      # Fastify + SQLite on :8787; logs an invite code on an empty db
npm run twophone # two browser contexts, two users, real sync + offline queue
```

The app requires an identity now, so `npm run dev` alone opens the login
screen. Start `npm run api` too; it prints a bootstrap invite code when the
database has no users. `npm run smoke` starts its own throwaway API with a
temporary data directory — a stale one would have its bootstrap code already
claimed and every run after the first would fail to log in.

`npm test` cannot see runtime crashes and neither can `tsc`. Three shipped
already. **Run `npm run check`, and look at `npm run shots` for anything
visual.**

Never bind an input's `value` directly to a value that round-trips through
IndexedDB — keystrokes get dropped between renders. Use the `useNumericDraft`
pattern in `src/components/DayCard.tsx`. When testing text entry use
`keyboard.type()`, never Playwright's `fill()`: `fill()` sets the value in one
event and is blind to this (MISTAKES.md #8).

`localhost` is a **secure context** and a LAN IP over HTTP is not, so
`crypto.randomUUID`, `crypto.subtle` and service workers exist on one and not
the other. `npm run smoke` tests both origins for exactly this reason
(MISTAKES.md #7). Feature-detect anything secure-context-gated.

Two process rules, both learned by breaking them (MISTAKES.md #1, #6):

- Never `pkill -f` / `pgrep -f` on a pattern that appears in your own command
  line — it kills the shell running it. Use `scripts/killport.sh <port>`.
- If you spawn a server, own its process group and kill the **group**. Killing
  a wrapper does not kill what the wrapper spawned; that leaked four
  LAN-exposed servers before anyone looked. `npm run check` ends with
  `scripts/killport.sh --orphans` to catch it.

## Ground rules

**Every colour lives in `src/styles/tokens.css`, under `[data-theme]`.** Zero
hardcoded hex in the component tree. Both themes ship at launch, which is cheap
only because it was done from the first commit; retrofitting is a full styling
pass.

**Every `daily_log` write goes through `repo.patchLog`.** That is the single
gate the today/yesterday edit window passes. Phase 2 must re-enforce the same
rule server-side and return the server's date — a client-side-only rule makes
the streak decoration (§6).

**Each user writes only their own rows.** That is what removes the entire class
of concurrent-edit conflicts and lets last-write-wins be correct (§10). The
server enforces it; don't add a path that writes the partner's rows.

**Counters merge upward on stale ops only.** A newer op wins outright,
including lowering a counter, so `−8 oz` and genuine corrections work. A stale
op may raise `water_oz`, `pages_read`, `steps` and `workout_minutes` but never
lower them — offline taps arrive late and must not be lost. `COUNTER_FIELDS` in
`packages/shared/src/sync.ts`.

**Live queries read; effects write.** Dexie runs `useLiveQuery` in a read-only
transaction. `readSettings`/`getActiveChallenge` are safe there;
`ensureSettings`/`ensureChallenge` are not. See MISTAKES.md #2.

**One app-wide timezone.** `APP_TIMEZONE` in `src/lib/time.ts`. Pin it before a
second device syncs, or the two clients will disagree about "today" and desync
the streak.

## Layout

npm workspaces. Run every command from the repo root.

```
packages/shared/src/   the contract between client and server
  types.ts             the frozen schema, in TypeScript
  time.ts              APP_TIMEZONE, day boundaries, the edit window
  scoring.ts           the six scored items, completion, streaks
  rolling.ts           trailing 7-day goals
  defaults.ts          goal defaults + a pure empty-day factory

apps/web/src/          the PWA
  db/db.ts             Dexie — all ten tables declared, four used so far
  db/repo.ts           the only write path
  db/defaults.ts       LOCAL_USER_ID, deviceId, browser wrapper for emptyLog
  components/rings/    hand-rolled SVG rings, both layouts
  styles/tokens.css    every colour in the app

apps/api/              Fastify + SQLite
scripts/               icons, screenshots, smoke, killport
```

**`packages/shared` must stay environment-free** — no DOM, no Node, no Dexie.
The server maintains `challenge_members.current_streak` and enforces the edit
window with these exact functions; two copies of the streak rules would drift
and nobody would notice until a phone and the server disagreed about a streak.

It is consumed as **TypeScript source** (`exports` points at `src/index.ts`),
so there is no build-ordering problem between the packages.

## Phase

**Phase 1 is done: single-user, local-only.** Rings in both layouts, day card,
toggles, sleep card, rolling strip, 4-of-6 scoring, streaks, edit window, both
themes.

Phase 2 is the API, SQLite, invite-code onboarding, bearer tokens, push/pull
sync, the second user, server-side edit-window enforcement, and pause requests.
Phase 3 is media, measurements, documentaries, the shared calendar and
reactions. Phase 4 is SSE, the scorecard and export.

## Never build

HealthKit, push notifications of any kind, cron or background jobs, a journal
text editor, calendar-week rollovers, multi-user beyond two, account recovery,
an App Store build, or CRDT sync. All explicitly out (§15).
