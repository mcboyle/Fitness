# Lifestyle Tracker — Build Spec

Self-contained implementation brief. Every decision below is settled; where a rationale is given it's to prevent a plausible wrong implementation, not to reopen the choice. Anything genuinely undecided is in §14.

---

## 1. What this is

A shared daily-habit tracker for exactly two people, run as a sequence of 75-day challenges. Pink, sleek, ring-based. Both users see each other's data in full, with one exception (progress photos).

**Delivered as an installable PWA**, served from a self-hosted API. Not a native app. Not in the App Store.

---

## 2. Hard constraints

- **No Apple Health / HealthKit integration.** Every metric is self-reported. The Apple Watch ring aesthetic is visual inspiration only.
- **No Apple Developer account.** Nothing in the build may require one.
- **No notifications of any kind.** No web push, no VAPID, no scheduled jobs, no reminders.
- **No third-party SaaS holding user data.** Self-hosted only.
- **Offline-first.** The app must be fully usable with no connectivity and reconcile on reconnect.
- **Two users.** Do not build multi-tenancy, org structures, or user discovery.

---

## 3. Tracked metrics

### Daily — four rings

| Ring | Goal (default) | Entry |
|---|---|---|
| Water | 80 oz | `+8 oz` increment button |
| Reading | 20 pages | Number, pages only, any book |
| Steps | 10,000 | Buckets by default, exact optional |
| Workout | 45 min | Minutes + type (`strength`/`cardio`/`dance`/other) |

### Daily — five toggles

Whole food · No alcohol · No junk food · Self-care · Journaled

`journaled` is a checkbox only. The journal itself is physical paper; the app never stores journal text and has no journal table.

### Daily — one card

Sleep, 8 hours default. Entered as a half-hour stepper on the morning view. Charted as a 7-day trend with **no target line**. Not a ring.

### Rolling 7-day goals

- Workouts: 4
- Documentaries: 3
- Progress photo: 1

There is no calendar week. All three sum over a trailing 7-day window and are always labelled "last 7 days" in the UI. A met goal can un-meet itself as days age out — that is correct behaviour, not a bug.

### Periodic

Body measurements: weight, waist, hips, arms, thighs. User's own cadence.

---

## 4. Scoring and streaks

**Six items score toward daily completion:**
steps · water · reading · sleep · self-care · journaled

**Four are tracked but unscored:** workout, whole food, no alcohol, no junk food. Logged, charted, visible to the partner — they just don't gate the streak.

**Threshold:** `completion_threshold`, default **3 of 6**, per user, editable in settings.

**A missed day resets the streak to zero.** No grace days.

**Display requirement:** three of the four rings score and one (workout) doesn't, and rings look equally weighted. Show a `3/6 today` counter next to the streak so what actually counts is legible. An unclosed workout ring must not imply a broken day.

---

## 5. Challenges

- A challenge is **75 active days** from its start date. Approved pause days are not active and push the projected finish out.
- **A missed day breaks the streak but does not end or restart the challenge.**
- Ends in a **scorecard**, not a pass/fail verdict: days completed, days missed, longest streak, first-to-last photo comparison, measurement delta. Build this well — it's the artifact users look at twice.
- **Shared by default** (both users, one start date), solo optional (single member).
- `projected_end_date` lives on `challenge_members`, not `challenges`. One person's pause shifts their finish and not the other's, so a shared challenge can legitimately end on two different days.
- Day numbering is **per challenge**. "Day 8" = eighth day of the current run.
- **Between challenges:** the next one starts manually after a suggested rest window of a few days. Logging continues in the gap with a null `challenge_id` — charted, but feeding no streak or day count. Never stop recording.
- Photos, measurements and documentaries live outside challenges and span all of them.

---

## 6. Editing window

**Only today and yesterday are editable.** Once a day is two days old its scored items freeze. This is what keeps the streak a measurement rather than an honour system.

- **Scope the lock to `daily_log` only.** Measurements, photos and documentaries stay editable at any time — none gate the streak, and blocking a correction to last month's weight is friction with no integrity benefit.
- **Enforce server-side.** Reject writes to `daily_log` rows outside the window and return the server's current date so the client can grey out locked days rather than failing a save silently. A client-side-only rule makes the streak decoration.
- `logged_late` is set when an entry's write date is later than the date it describes. Render those days with a small dot. Cosmetic, not protective.

**Known residual risk:** with no reminders and a one-day window, two forgotten evenings in a row kill a streak with no warning. The 3-of-6 threshold absorbs this. If streaks die in ways that feel unfair, widen the window — don't lower the threshold.

---

## 7. Pause mode

A pause is a **request**, not a setting.

- Declared for today or a future range. **Never retroactive** — pausing last week after seeing a broken streak is an undo button and defeats §6.
- **Per user**, not per couple. Both users' pauses are visible to each other.
- **The partner approves it**, and an unanswered request **auto-approves after 24 hours**. The veto is real; it just can't be exercised by inattention.
- **Approval backdates** to the declared start date, whether granted by tap or timer. A day boundary falling inside the pending window doesn't matter — the streak is made whole retroactively. A decline converts those days to misses.
- **No scheduler.** Evaluate the 24-hour grant lazily at read time: a row still `pending` with `created_at` older than 24h reads as approved. There must be no cron job anywhere in this system.
- Paused days render greyed on the calendar — neither complete nor missed. They must never look like success.
- Pending requests sit at the top of the partner's home screen. There is no icon badge without push.

---

## 8. Data model

```sql
users (
  id, display_name, avatar_color, invite_code, created_at
)

user_settings (
  user_id,                                -- PK
  goal_water_oz        INTEGER DEFAULT 80,
  goal_pages           INTEGER DEFAULT 20,
  goal_steps           INTEGER DEFAULT 10000,
  goal_workout_minutes INTEGER DEFAULT 45,
  goal_sleep_minutes   INTEGER DEFAULT 480,
  completion_threshold INTEGER DEFAULT 3,   -- of the 6 scored items
  step_entry_mode      TEXT DEFAULT 'both', -- buckets shown, exact optional
  theme                TEXT DEFAULT 'dark',
  ring_layout          TEXT DEFAULT 'concentric',  -- 'concentric'|'grid'
  updated_at
)
-- no per-user timezone: one app-wide zone governs day boundaries

challenges (
  id, name, target_days INTEGER DEFAULT 75,
  start_date,
  is_shared BOOLEAN DEFAULT 1,
  status TEXT,                            -- 'active'|'completed'|'abandoned'
  created_at
)

challenge_members (
  challenge_id, user_id,                  -- composite PK
  projected_end_date,                     -- per member; pauses shift it
  days_completed INTEGER DEFAULT 0,
  days_missed    INTEGER DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  best_streak    INTEGER DEFAULT 0
)

daily_log (
  user_id, date,                          -- composite PK
  challenge_id,                           -- nullable: logging continues between runs
  steps            INTEGER,
  steps_bucket     TEXT,                  -- 'low'|'mid'|'high' when no exact count
  sleep_minutes    INTEGER,
  water_oz         INTEGER DEFAULT 0,
  pages_read       INTEGER DEFAULT 0,
  workout_minutes  INTEGER DEFAULT 0,
  workout_type     TEXT,
  whole_food       BOOLEAN DEFAULT 0,
  no_alcohol       BOOLEAN DEFAULT 0,
  no_junk_food     BOOLEAN DEFAULT 0,
  self_care        BOOLEAN DEFAULT 0,
  journaled        BOOLEAN DEFAULT 0,
  logged_late      BOOLEAN DEFAULT 0,
  paused           BOOLEAN DEFAULT 0,
  updated_at, device_id
)

pauses (
  id, user_id, challenge_id,
  start_date, end_date, reason TEXT,
  status TEXT DEFAULT 'pending',          -- 'pending'|'approved'|'declined'
  approved_by, resolved_at, created_at    -- pending + created_at < now-24h
)                                         -- reads as approved; no cron

media (
  id, user_id, taken_on, kind,            -- 'progress_photo'
  storage_path, thumb_path,
  visibility TEXT DEFAULT 'private',      -- 'private'|'shared'
  shared_at, created_at
)

measurements (
  id, user_id, taken_on,
  weight_lb REAL, waist_in REAL, hip_in REAL, arm_in REAL,
  thigh_in REAL, notes, created_at
)

documentaries (
  id, user_id, watched_on,
  title TEXT, notes TEXT, created_at
)

reactions (
  id, from_user_id, target_kind,          -- 'day'|'photo'|'measurement'
  target_date, target_media_id,
  emoji TEXT, body TEXT,                  -- body = short note, nullable
  seen_at, created_at
)

sync_state (
  device_id, user_id, last_pulled_at, last_pushed_at
)
```

**Deliberately absent:**
- No `journal` table — the journal is paper.
- No `weekly_log` table — rolling windows sum from `daily_log` and `documentaries`; the photo derives from `media.taken_on`. No week-rollover job.
- No `push_subscriptions` table — no notifications.
- No `visibility` on `measurements` — they're shared.

---

## 9. Privacy rules

**Progress photos are the only per-item privacy decision in the system.**

1. **Default private at upload.** Sharing is a deliberate second action, per photo. No global setting, no remembered preference that silently shares next week's photo.
2. **Enforce server-side.** `GET /media?user_id=<partner>` returns only rows where `visibility = 'shared'`. The partner's client must never receive metadata, thumbnails or storage paths for private photos — not hidden with CSS, not filtered client-side. If it's never transmitted, no client bug can leak it.
3. **Decouple completion from artifact.** The weekly "photo taken ✓" stays visible to both users regardless of the photo's visibility. She sees the habit was kept; she sees the image only if it's shared.
4. **Unsharing is honest.** Revokes future access and invalidates signed URLs. It cannot recall a downloaded copy. Don't persist shared partner media to IndexedDB — fetch on view, memory-cache only. UI copy: "Unsharing hides this from her going forward. It can't undo a screenshot."
5. **You can only react to what you can see.** A private photo generates no reaction affordance for the partner.

Other security requirements:

- Store photos outside the web root; serve only via authenticated, short-lived signed URLs. Never a guessable path.
- Authorize every media request against `visibility` and `user_id` on the endpoint, not in the query.
- Encrypt the data volume at rest (LUKS).
- Per-user bearer tokens, long-lived, revocable.
- Backups off-box: Litestream plus a periodic encrypted snapshot.
- Nothing exposed publicly without an identity gate.

---

## 10. Sync

**Each user writes only their own rows.** That removes the entire class of concurrent-edit conflicts. Last-write-wins per field with `updated_at` as the clock is sufficient and correct. Do not build CRDTs.

- **Client:** IndexedDB via Dexie. Every mutation writes locally first and enqueues an outbound op. The UI reads only from IndexedDB and never blocks on the network.
- **Push:** `POST /api/v1/sync` with the pending op queue. Server applies LWW, returns authoritative rows.
- **Pull:** `GET /api/v1/sync?since=<timestamp>` returns everything changed for both users. On app foreground and every ~60s while open.
- **Live updates:** SSE stream so the partner's ring animates when they log something. Phase 4.
- **Photos never travel in the sync payload.** `POST /api/v1/media` separately; sync only the metadata row; lazy-load thumbnails.

---

## 11. UI

### Rings

Four concentric SVG rings — water, reading, steps, workout — using `stroke-dasharray`/`stroke-dashoffset` animated in CSS. No charting library; hand-rolled is under 100 lines.

**Build both layouts in Phase 1**, switchable via `user_settings.ring_layout`:
- `concentric` — Apple-style, ~150px diameter, ~11px bands. Four is the ceiling; there is no room for a fifth, which is why sleep is a card.
- `grid` — 2×2 of separate labelled rings.

The ring component takes the same four values either way. Decide on a real device, not in a mockup.

**Colour has to carry identity.** Four rings from one pink family are hard to distinguish at that stroke width, hence one cool accent for water.

### Layout

One screen, one ritual. The day card holds all ten items; rings sit above and animate as you tap. Target: **a full day logged in under 20 seconds without scrolling.** Do not split entry across tabs.

Below the rings: a 2×2 grid of tap-to-toggle pills for the four food/self-care toggles plus journaled, then the sleep card, then the rolling 7-day strip:

```
Last 7 days —  Workouts ●●●○ 3/4    Docs ●●○ 2/3    Photo ✓
```

### Partner view

Second card with the partner's rings at ~60% scale; tap to swap focus. A shared calendar showing both streaks on one grid is the actual differentiator over any off-the-shelf 75 Hard app — build it in Phase 3, don't defer it.

### Reactions

Emoji reactions and short notes on the other's day, photo or measurement. Unseen reactions surface as an in-app badge on next open. Pull, not push — that's the point.

### Palette

```
--pink-hot     #FF2D78    Workout ring, primary actions
--pink-rose    #FF7AA8    Steps ring
--pink-orchid  #C77DFF    Reading ring
--blue-water   #6EC5FF    Water ring
--pink-blush   #FFF3F7    Light theme background
--surface-dark #12070C    Dark theme background
--ink          #3A0E22    Text on light
```

Light-theme ring variants: `#E01B60` / `#F2699A` / `#A855F7` / `#2FA3E8`. Dark track `#2A1620`, light track `#FBDDE8`.

**Both themes ship at launch** with a user toggle. This is cheap only if done from the first commit: every colour as a CSS custom property scoped under `[data-theme]`, zero hardcoded hex in the component tree. Retrofitting a second theme is a full styling pass — this is a Phase 1 ground rule, not polish.

**Typography:** geometric sans with real weight contrast — Poppins, Outfit or Cabinet Grotesk for headings. The reference aesthetic comes almost entirely from very heavy display type.

### Weight and measurements

Keep them out of the ring and streak system entirely. Separate tab, charted over time, **no target line, no streak, no goal state**. Body metrics respond over weeks and fluctuate daily for reasons unrelated to adherence; scoring them daily makes the app punish normal variation.

---

## 12. Stack

| Layer | Choice |
|---|---|
| Client | React + TypeScript + Vite, `vite-plugin-pwa` |
| Styling | Tailwind + CSS custom properties |
| Local store | IndexedDB via Dexie |
| API | FastAPI (Python) or Fastify (Node) |
| Database | SQLite + Litestream |
| Host | Docker Compose on an Ubuntu VM (existing home lab) |
| Ingress | Cloudflare Tunnel + Cloudflare Access, or Tailscale |
| Auth | Per-user bearer tokens; onboarding via invite code — no email, no password reset |

Do not host on the MacBook. A laptop sleeps, moves networks and reboots for updates; every closed lid takes the second user offline.

Do not use Google Drive as the backend. It's a file-sync layer, not a database — concurrent writes produce conflicted copies rather than merges, and it can't serve the PWA anyway.

---

## 13. Phases

**Phase 1 — Single-user local PWA.**
Four rings in both layouts, day card, toggles, sleep card, both themes tokenized from the first commit. IndexedDB only, no server. Runs on one phone. Goal: find out whether the ring set and the 3-of-6 threshold feel right before building anything behind them.

**Phase 2 — Backend and sync.**
API, SQLite, invite-code onboarding, bearer tokens, push/pull sync, second user. Server-side enforcement of the edit window. Challenges and pause logic.

**Phase 3 — Media and history.**
Progress photos with per-photo visibility, measurements, documentaries, rolling strip, shared calendar, reactions and notes.

**Phase 4 — Polish.**
Live SSE updates, streak visualizations, end-of-challenge scorecard, first-to-last photo compare, CSV/JSON export.

---

## 14. Genuinely open

Decide these in code or after living with the app:

- Whether 3 of 6 survives a week of use.
- Concentric versus grid rings, on a real device.
- Whether the workout ring earns its place in the ring set at all, given it doesn't score daily.
- Whether the one-day edit window feels right or punishing.
- Water button increment, app name, export format, how a new phone re-pairs.

---

## 15. Non-goals

Do not build: HealthKit integration, push notifications, background jobs or cron, a journal text editor, calendar-week rollovers, multi-user beyond two, account recovery flows, an App Store build, or CRDT-based sync.
