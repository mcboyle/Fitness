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
