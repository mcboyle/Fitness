# Mistakes

Every failure in this project gets an entry. **The second time the same root
cause appears, stop and build something that makes it impossible** — a script,
a check, a lint rule — and link it here.

Format: what broke, why, the fix, and the guard if it earned one.

---

## 1. `pkill -f <pattern>` killed the shell running it — TWICE

**Symptom.** `pkill -f "vite preview"` returned exit 144 and silently
terminated the whole command chain behind it. The `cp`, `git init` and `git
commit` that followed never ran, and nothing said so.

**Cause.** `-f` matches against the full command line of every process — which
includes the shell currently executing `pkill -f "vite preview"`. It kills
itself. Retrying with `pgrep -f 'vite.*preview'` did exactly the same thing,
because the pattern was still present in the new command line.

**Guard — [`scripts/killport.sh`](scripts/killport.sh).** Kills by listening
port via `ss`, never by process-name pattern. Use it instead of `pkill`/`pgrep
-f` for anything that serves.

```sh
scripts/killport.sh 5173 4173
```

---

## 2. Writing to Dexie from inside `useLiveQuery` — TWICE

**Symptom.** Blank white page. `tsc`, `oxlint` and `vitest` were all green.
The only trace was `ReadOnlyError: DexieError` in the browser console, which
nothing in the toolchain was reading.

**Cause.** Dexie runs live queries inside a **read-only** transaction. Both
`getSettings()` and the original `useChallenge()` seeded a row with `.put()` on
first read, so the very first render threw and took `<App>` down with it.

There was a second, quieter version of the same bug: `startChallenge()` mints a
UUID, so calling it from a live query or a StrictMode double-invoked effect
could leave two active challenges and two different day numbers.

**Fix.** Split reads from writes. `readSettings()` / `getActiveChallenge()` are
pure reads and safe in a live query; `ensureSettings()` / `ensureChallenge()`
do the seeding, run once from an effect, and `ensureChallenge` holds a
module-level promise so concurrent callers share one bootstrap.

**Guard — [`scripts/smoke.mjs`](scripts/smoke.mjs) (`npm run smoke`).** Builds,
serves, and loads the app in a real browser. Fails on any page error, console
error, failed request, blank render, or a write that doesn't survive a reload.

This one was verified by reintroducing the bug: `tsc` clean, 13/13 tests
passing, and `npm run smoke` failed with "missing from the page: WATER". That
is the whole reason it exists.

**Rule.** Never call anything named `ensure*`, `start*`, or anything that
writes, from inside `useLiveQuery`. Live queries read.

---

## 3. `aria-label` rendered as visible button text

**Symptom.** The round decrement buttons showed "Remove 8 ounces" and "Half an
hour less" as body copy, blowing out the card layout.

**Cause.** `StepButton` used one `label` prop for both the accessible name and
the visible child.

**Fix.** Separate `glyph` (visible, `aria-hidden`) from `label` (screen-reader
only).

**Guard — [`scripts/screenshot.mjs`](scripts/screenshot.mjs) (`npm run shots`).**
Renders both themes and both ring layouts at phone size. Purely visual bugs
don't show up in any assertion; look at the pictures.

---

## 4. Sleep trend bars rendered flat

**Cause.** Percentage heights resolved against a wrapper that had no height of
its own. `h-16` was on the grandparent, not the bar's parent.

**Fix.** `h-full` on the column wrapper. Caught by screenshots, same as #3.

---

## 5. Smoke test served a stale build

**Symptom.** The smoke harness passed against a deliberately reintroduced bug.

**Cause.** `vite preview` serves whatever is already in `dist/`. The script
never rebuilt, so it validated the previous, working artifact.

**Fix.** `npm run smoke` now runs `npm run build` first. A check that can't fail
is worse than no check — it converts "untested" into "verified".

---

## 6. The smoke harness leaked a LAN-exposed server on every run

**Symptom.** An unrelated survey of the VM found four `vite preview` processes
on :4179–:4182, bound to `*`, serving the built app to all of `10.0.70.0/24`.
Nobody started them on purpose and nothing reported them. They had been up for
up to eight minutes each.

**Cause.** `scripts/smoke.mjs` spawned `npx vite preview` and, on exit, called
`server.kill()`. That kills the **`npx` wrapper**, not the `vite` child it
spawned, so every smoke run orphaned a listener. Vite then auto-incremented the
port on the next run, which is why they stacked up instead of colliding.

This is the third process-management failure, after `pkill -f` twice in entry
#1. Same family: acting on the wrong process.

**Fix.** Spawn with `detached: true` so vite gets its own process group, then
kill the **group** (`process.kill(-pid)`). Shutdown is also wired to `SIGINT`,
`SIGTERM` and `exit`, so it runs on a throw and on ctrl-c, not just the happy
path.

**Guard — `scripts/killport.sh --orphans`,** now the last step of `npm run
check`. It asserts that none of this project's tooling ports are still held and
prints the offending pid if they are. `killport.sh <port>` also kills by process
**group** now, so a leaked wrapper takes its children with it.

Verified by planting a leak: `npx vite preview --port 4179`, then `--orphans`
exited 1 and named the pid.

**Rule.** If you spawn a server, own its process group and kill the group. Never
trust that killing what you spawned killed what it spawned.

---

## 7. `crypto.randomUUID` is secure-context only — blank page on any phone

**Symptom.** The app was a blank white screen on a real phone at
`http://10.0.70.31:5173`. `curl` returned 200, the build was green, 13/13 tests
passed, and `npm run smoke` passed.

**Cause.** `crypto.randomUUID` is only defined on **secure origins**.
`localhost` is treated as one; a LAN IP over plain HTTP is not. So
`deviceId()` and `startChallenge()` threw `TypeError: crypto.randomUUID is not
a function` before first paint, and React unmounted.

Every automated check ran against `localhost`, the one origin where the bug
cannot reproduce. The harness was testing the wrong target — the same failure
shape as #5, where it tested a stale build.

**Fix.** `src/lib/id.ts` exports `newId()`: uses `crypto.randomUUID` when it
exists, otherwise builds a v4 UUID from `crypto.getRandomValues`, which has no
secure-context restriction and is still cryptographically random.

**Guard — `scripts/smoke.mjs` now runs every check against both origins,**
`localhost` (secure) and the detected LAN IP (insecure), each in its own
browser context.

Verified by reverting all three call sites: `localhost` passed, `10.0.70.31`
failed with the exact `TypeError` and "the app is blank". The first attempt at
that regression was inconclusive — reverting one call site wasn't enough,
because `deviceId()`'s `catch` fell back to `newId()` and swallowed it. **A
regression test that doesn't fail hasn't proved anything; find out why before
moving on.**

**Rule.** Anything gated on a secure context — `crypto.randomUUID`,
`crypto.subtle`, service workers, geolocation — must be feature-detected with a
fallback, and must be exercised from a non-localhost origin.

---

## 8. Controlled inputs dropped keystrokes; the steps field was invisible

Two bugs in one report — "steps doesn't have a way to add steps" from the main
page.

**8a. The field collapsed to a 20px sliver.** Sizing it in `ch` from
`String(log.steps ?? '').length` gives `1ch` when empty. Combined with 8b, there
was no visible field to type into.

**8c. Tapping "enter exact" didn't focus it.** A refactor dropped `autoFocus`,
so no keyboard appeared on iOS. Fixed with a ref plus an `openedByTap` flag —
focus only when the user asked for the field, never on mount, which would pop
the keyboard every time the app opens on a day with an exact count.

**8b. Typing "8432" landed as "2".** The real one. Both numeric inputs bound
`value` directly to the stored number, and every keystroke wrote through
`patchLog` to IndexedDB. React re-rendered with the *pre-write* value between
keys, so characters were silently discarded. **Reading had this since Phase 1**
— "147" became "7".

**Fix.** `useNumericDraft` in `src/components/DayCard.tsx`: local draft state is
authoritative while the field is focused, and adopts the stored value only when
it isn't, so the +/− buttons still drive the field.

**Why nothing caught it.** Every check used Playwright's `fill()`, which sets a
value in one event and never produces a second keystroke against a stale
render. The bug is invisible to it by construction.

**Guard.** `scripts/smoke.mjs` now types into both numeric fields **one key at
a time with no delay**, and asserts the field is focused after tapping "enter
exact".

The first attempt at this guard used `{ delay: 40 }` and **passed against the
planted regression** — 40ms was enough for the write to land. Only the
zero-delay version reproduces. Verified: planted, it failed with `typed 8432,
got "2"` on both origins.

**Rule.** Never bind an input's `value` straight to an async store. And test
text entry with `keyboard.type()`, never `fill()` — `fill()` cannot see this
class of bug.

---

## 9. A 500 on sync push looked like success

**Symptom.** Adding a documentary and saving a measurement both appeared to
work — the row rendered, the rolling strip counted it. Neither ever reached the
server. The only trace was two `500`s in a browser console nobody was reading.

**Cause.** `measurements` and `documentaries` have `created_at NOT NULL`, but
the generic sync INSERT only writes `user_id`, the key column, the patch
fields, `updated_at` and `server_seq`. Every insert violated the constraint and
the whole push 500'd.

**Why it was invisible.** Writes are local-first by design (§10): the row lands
in IndexedDB and the op is queued. A failed push leaves the op queued to retry,
which is correct — but it means a *permanently* failing op is indistinguishable
from a slow network at a glance. The UI was honest and the data was still lost.

**Fix.** `INSERT_DEFAULTS` in `apps/api/src/sync.ts` supplies server-managed
columns per table.

**Guard.** `scripts/phase3test.mjs` now asserts the footer reads **Synced** and
re-queries `/sync` to confirm the rows exist server-side. A local row proves
nothing; the outbox draining is the proof.

**Rule.** In a local-first app, "it appeared in the UI" is not evidence a write
succeeded. Assert the queue drains, and assert the server has the row.

---

## 10. The shared calendar rendered one row instead of two

**Symptom.** "Both streaks, one grid" showed only my own row — 35 cells where
there should have been 70.

**Cause.** Two compounding mistakes. The partner's row was derived from which
users appear in `daily_log`, so she had no row until she happened to log
something. And the partner id came from a `/me` fetched once at mount, which is
stale the moment she claims her invite.

**Fix.** The partner id is derived from `user_settings`, which carries a row per
user and is pulled for both — so it is correct offline and however the two of
you joined. Her row renders empty rather than being absent. Only the display
name still needs the network.

**Rule.** Don't derive identity from activity. Someone who has done nothing yet
still exists, and a feature about *both* people must not disappear when one of
them is idle.

---

## 11. Three silent failures behind a green UI, in one feature

Reactions shipped looking fine and were broken three ways. All three shared a
shape: **the interface reported success the server never granted.**

**11a. Pulled reactions were dropped.** `applyServerRows` opens a Dexie
transaction over an explicit table list, and `reactions` wasn't in it, so every
write threw. The catch in `sync()` turned that into a status flag nobody was
watching. The pull "succeeded" and the rows vanished. `applyServerRows` now
logs loudly when a pulled table has no local home, instead of `continue`-ing
past it.

**11b. Every bodyless POST 400'd.** The API client set
`content-type: application/json` unconditionally, and Fastify rejects an empty
body that claims to be JSON. `markSeen` sends no body, so marking a reaction
seen always failed. The header is now set only when there is a body.

**11c. A `.catch()` hid 11b.** `dismiss()` was
`markSeen(id).catch(() => undefined)` followed by clearing the badge. So the
inbox cleared, the server recorded nothing, and the reactions would return on
the next load. Now `Promise.allSettled`, and the badge only clears if every
call actually succeeded.

**The pattern worth naming.** This is the third entry (#5, #9, now #11) where
something reported success it hadn't earned. Every instance was a place where a
failure had somewhere convenient to go: a stale artifact, a retry queue, a
`.catch`. **A swallowed error is a bug you have chosen not to find.**

**Rule.** Never `.catch(() => undefined)` around a write. If a failure genuinely
doesn't matter, say why in a comment. If it does, let it change what the UI
shows.

---

## 12. Committed with a failing check

**Symptom.** `npm run check` failed and the commit went in anyway. The output
scrolled past in the same command as the commit, and the exit status of the
pipeline was the commit's, not the check's.

**Cause.** Chaining `npm run check 2>&1 | tail -3 && git commit` reports the
status of `tail`, which always succeeds. The check's failure was on screen and
structurally invisible to the shell.

**What was broken.** The login screen was rebuilt — "Invite code" became "Code"
and "Join" became "Continue" — so every harness that signs in broke at once:
smoke, twophone, phase3test, screenshot and tour.

**Fix.** All five harnesses updated. The redesigned flow needed a second step
(the name field only appears once the server says this is a first-time invite),
so they wait for it rather than assuming a single form.

**The deeper fix.** The first repair left an *expected* 404 in the console —
the client probed `/signin`, fell back to `/claim`, and the browser logs any 404
as an error. Rather than teach the harness to ignore errors, the two endpoints
became one `/api/v1/auth`: the server knows which kind of code it is, so there
is no wasted round trip and nothing to ignore. **A check that has to be taught
to ignore things stops being a check.**

**Rule.** Never pipe a verification command into `tail` and chain a commit off
it. Run the check, read it, then commit as a separate step.

---

## Toolchain snags

Low-value individually; recorded so they aren't rediscovered.

- **`erasableSyntaxOnly`** (on by default in this Vite template) rejects
  TypeScript constructor parameter properties. Declare and assign fields
  explicitly.
- **Dexie `EntityTable<T, 'id'>`** doesn't type compound primary keys. Use
  `Table<T, [string, string]>` for `daily_log` and `challenge_members`, and pass
  tables to `db.transaction` as an **array**.
- **`localStorage` is undefined under vitest's node environment.** `deviceId()`
  now try/catches and falls back to a memory-only id — which also fixes Safari
  private mode, where it throws.
- **oxlint's `only-export-components`** fires when a component file also exports
  a helper. `cx` lives in `src/lib/cx.ts` for that reason.
