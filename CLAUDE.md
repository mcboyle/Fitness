# CLAUDE.md

A shared daily-habit tracker for exactly two people, run as sequential 75-day
challenges. Installable PWA, self-hosted, offline-first.

## Read this first

[`docs/BUILDSPEC.md`](docs/BUILDSPEC.md) is the authority. Every decision in it
is settled, and most of what looks like an oversight is a deliberate choice with
a stated reason. [`docs/proposal.md`](docs/proposal.md) has the longer
reasoning. **Check the spec before "fixing" a behaviour.**

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
```

`npm test` cannot see runtime crashes and neither can `tsc`. Three shipped
already. **Run `npm run check`, and look at `npm run shots` for anything
visual.**

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

**Live queries read; effects write.** Dexie runs `useLiveQuery` in a read-only
transaction. `readSettings`/`getActiveChallenge` are safe there;
`ensureSettings`/`ensureChallenge` are not. See MISTAKES.md #2.

**One app-wide timezone.** `APP_TIMEZONE` in `src/lib/time.ts`. Pin it before a
second device syncs, or the two clients will disagree about "today" and desync
the streak.

## Layout

```
src/
  lib/time.ts        day boundaries, edit window, rolling windows
  lib/scoring.ts     the six scored items, completion, streaks
  lib/rolling.ts     trailing 7-day goals
  db/types.ts        the frozen schema, in TypeScript
  db/db.ts           Dexie — all ten tables declared, four used in Phase 1
  db/repo.ts         the only write path
  components/rings/  hand-rolled SVG rings, both layouts
  styles/tokens.css  every colour in the app
scripts/             icons, screenshots, smoke, killport
```

## Phase

**Phase 1 is done: single-user, local-only.** Rings in both layouts, day card,
toggles, sleep card, rolling strip, 3-of-6 scoring, streaks, edit window, both
themes.

Phase 2 is the API, SQLite, invite-code onboarding, bearer tokens, push/pull
sync, the second user, server-side edit-window enforcement, and pause requests.
Phase 3 is media, measurements, documentaries, the shared calendar and
reactions. Phase 4 is SSE, the scorecard and export.

## Never build

HealthKit, push notifications of any kind, cron or background jobs, a journal
text editor, calendar-week rollovers, multi-user beyond two, account recovery,
an App Store build, or CRDT sync. All explicitly out (§15).
