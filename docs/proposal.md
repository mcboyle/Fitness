# Two-User Lifestyle Tracker — Technical Proposal

**Status:** Planning / pre-build
**Date:** September 2026
**Author:** Matthew
**Users:** 2 (both iOS), full mutual visibility

---

## 1. Executive summary

The product is a shared daily-habit tracker for two people, built around three Apple-Watch-style progress rings with a pink visual identity. Each user's device holds a local copy of their own data and syncs to a shared backend so both people can see each other's rings in near real time.

**This app does not integrate with Apple Health.** The ring interface is visual inspiration only; every metric is self-reported. That decision removes the single largest constraint on the build — HealthKit is the one capability that would have forced a $99/year Apple Developer account and a native app — and it makes the recommended architecture unambiguous rather than a compromise.

The recommendation is: **an installable web app (PWA) served from a self-hosted API on your Ubuntu lab.** No Apple fees, no App Store, no seven-day certificate expiry, instant updates for both users, and full control of the data on infrastructure you already run. A native rewrite stays available later if widgets or a Watch app ever become worth $99, and the backend carries over unchanged if so.

The design question that replaces the Health question: since nothing auto-fills, the app lives or dies on how fast the daily entry ritual is. §4 covers that.

---

## 2. Requirements as captured

### Daily
| Metric | Target | Entry method |
|---|---|---|
| Steps | 10,000 | Manual (single nightly number) |
| Water | 80 oz | Manual, incremental |
| Reading | 20 pages | Manual |
| Sleep | 8 hours | Manual (morning stepper, 0.5h) — charted, not scored |
| Whole-food / protein priority | Binary | Manual toggle |
| No alcohol | Binary | Manual toggle |
| No junk food | Binary | Manual toggle |
| Self-care (skin, body, appearance) | Binary | Manual toggle |

### Weekly
| Metric | Target |
|---|---|
| Workouts | ≥4 (a 1-hour dance session counts as one) |
| Documentaries | 3 |
| Progress photo | 1 (sharing with the partner is opt-in per photo) |
| Journal entry | ≥1 — physical paper journal; the app stores only a checkbox |

### Periodic
- Body measurements and weight, logged on the user's own cadence.

### Non-functional
- Pink, sleek, feminine visual identity.
- No Apple Health / HealthKit integration — all metrics self-reported.
- Four progress rings: water, reading, steps, workout.
- A missed day resets the streak to zero; a day counts as complete at a configurable threshold of N of 9 items.
- Shared goal defaults, editable per user.
- No notifications of any kind.
- Runs as sequential 75-day challenges; data from finished challenges is retained.
- Planned pause mode that freezes the streak.
- In-app reactions and short notes between the two users.
- Ring-based daily progress display.
- Offline-first: the app must work with no connectivity and reconcile later.
- Two-user sync with full visibility of each other's data.
- Self-hosted or Drive-backed storage — no third-party SaaS holding the data.

---

## 3. Distribution

With Health integration off the table, this decision gets easy — but it's worth recording why, because the reasoning changes if the requirement ever comes back.

### Option A — Progressive Web App (PWA) · **Recommended**

Safari on iOS supports adding a web app to the home screen, where it runs full-screen with its own icon and no browser chrome. Since iOS 16.4, installed web apps can also receive web push notifications.

- **Cost:** $0
- **Distribution:** send her a URL, she taps Share → Add to Home Screen
- **Updates:** instant, you deploy and both devices get it
- **You lose:** home-screen widgets, Live Activities, an Apple Watch app, and reliable background execution
- **What you don't lose:** anything on the requirements list. Every metric is manual, so there is no capability gap between this and a native build

### Option B — Native app, free provisioning

Xcode with a free Apple ID signs a build onto a physically connected device. Certificates expire in seven days, which means re-signing weekly, and the second user's phone would need to reach a Mac or run a side-loading refresher.

**Assessment:** not viable for a second user. The weekly re-signing ritual will kill the project inside a month.

### Option C — Native app, paid Apple Developer Program

$99/year. Unlocks TestFlight (up to 100 internal testers, so two is trivial), certificates that last a year, WidgetKit, and a watchOS companion.

- **You gain:** home-screen and Lock Screen widgets, and a Watch app — genuinely nice for tapping off a habit from the wrist, and the only remaining reason to consider this
- **You need:** a Mac for Xcode, Swift/SwiftUI, and periodic TestFlight rebuilds (builds expire, typically 90 days)

**Assessment:** now a pure quality-of-life upgrade rather than a capability unlock. Not worth $99 and a SwiftUI rewrite before you know whether the two of you use the thing daily.

### Recommendation

Build A. Keep the API and schema client-agnostic so a SwiftUI front end could be dropped in later against the same backend without touching the server, but treat that as a maybe-never.

---

## 4. Entry friction is now the core design problem

Every metric is self-reported, which means the app's success depends almost entirely on how little effort a full day of logging takes. Ten habits entered badly is a chore people abandon in three weeks. The target: **a complete day logged in under 20 seconds, from one screen, without scrolling.**

Concrete implications:

**Eight of the ten daily items are one tap.** Whole food, no alcohol, no junk food, self-care are binary toggles. Water is a `+8 oz` button you hit ten times across the day. Pages read and workout minutes are two-digit numbers. None of these need a form.

**Steps are the awkward one.** It's the only metric you can't estimate or toggle — you have to open the Fitness app, read a number, and type it in. Two ways to handle that:

- *Resolve it by design:* make the Move ring **workout-first**. Any logged workout closes it; steps only matter on days without one. That turns step entry from a nightly obligation into an occasional thing, and it better reflects the actual goal anyway — the requirement is 4 workouts a week *or* 10k steps, not both every day.
- *Or drop precision:* replace the exact count with three taps — under 5k / 5–10k / over 10k. Nobody's decisions change based on 9,400 versus 10,200 steps.

I'd do the first and keep the number field for people who want it.

**Sleep goes in the morning, not at night.** A 0.5-hour stepper on the morning view, defaulted to yesterday's value. Asking for last night's sleep at 11 PM alongside everything else means it gets guessed or skipped.

**One screen, one ritual.** Resist splitting entry across tabs. The day card holds all ten items; rings sit above it and animate as you tap. The whole interaction should be openable from a notification and finishable without navigating.

> *If you ever change your mind on Health:* an Apple Shortcuts personal automation can read step and sleep samples and POST them to the API on a schedule, giving you auto-fill without a developer account or any native code. It's a bolt-on to the same endpoint, so nothing in this design forecloses it.

---

## 5. Backend options — the tradeoff you asked for

### Option 1 — Shared Google Drive folder

Each client writes JSON/SQLite deltas into a shared Drive folder; clients poll for changes.

| | |
|---|---|
| **Cost** | $0 (existing storage) |
| **Ops burden** | None — no server, no uptime, no certs |
| **Remote access** | Solved by Google |
| **Latency** | Poll-based; 30s–5min staleness |
| **Conflicts** | You hand-roll all of it |
| **Photos** | Natural fit — Drive is built for blobs |
| **Auth from a PWA** | Painful — OAuth in a browser context, token refresh, scope prompts |

**The real problem:** Drive is a file-sync layer, not a database. Two clients writing to the same file produces a conflicted copy, not a merge. You'd end up building per-user append-only files and merging client-side, which is doable but is genuinely the harder engineering path despite looking like the easier one. And a PWA can't be *served* from Drive, so you'd still need somewhere to host the app itself.

**Verdict:** viable only for a native app where each user writes to their own file namespace. Not a fit for the recommended architecture.

### Option 2 — Ubuntu VM on your home lab · **Recommended**

A small container stack on your existing 10.0.70.x infrastructure: API + SQLite (or Postgres) + static file serving for the PWA + a photos volume.

| | |
|---|---|
| **Cost** | $0 marginal — the hardware is already running |
| **Ops burden** | Yours: backups, updates, uptime |
| **Latency** | Real-time (WebSocket or SSE) if you want it |
| **Conflicts** | Server is authoritative; trivially resolved |
| **Photos** | Filesystem volume, full control |
| **Serves the PWA** | Yes — same origin as the API, no CORS work |

Resource footprint is negligible: two users generating maybe 20 rows and one photo a day. A 1 vCPU / 1 GB VM is oversized for this.

**Verdict:** best fit. It's the only option that serves the app, stores the data, and handles auth from one place, and it's on infrastructure you already maintain.

### Option 3 — MacBook (NEO) as the server

Same software as Option 2, different host.

**The problem is availability.** A laptop sleeps when the lid closes, moves between networks, and gets rebooted for OS updates. If NEO is your daily driver, every time you close it her app goes offline. `caffeinate` and "prevent sleep on power adapter" can hold it awake, but you're fighting the device's design.

**Verdict:** fine as a development target, wrong as the production host when you have a lab sitting there.

### Remote access for the second user

The VM lives on a private subnet, so her phone needs a path in. Three options, in descending order of what I'd recommend for this use case:

**Cloudflare Tunnel + Cloudflare Access** — `cloudflared` makes an outbound connection to Cloudflare; you get a real HTTPS hostname with a valid certificate and no inbound firewall rule, no port forward, and no public IP exposure. Access puts an identity check in front of it so the endpoint isn't open to the internet. A valid public cert also matters here: PWA installation and service workers require a trusted HTTPS origin, and this gives you one for free.

**Tailscale** — put both phones and the VM on a tailnet; `tailscale serve` will even issue a valid `*.ts.net` certificate. Nothing is exposed publicly at all, which is the strongest privacy posture. The cost is that she must install and stay signed into Tailscale, and if the tailnet drops the app is simply unreachable rather than degraded.

**Port forward + reverse proxy** — works, but it puts a self-written API on the public internet behind whatever auth you wrote at 11 PM. Given your background you already know why this is the least attractive of the three.

---

## 6. Data model

Deliberately flat. Two users, one row per user per day.

```sql
users (
  id, display_name, avatar_color, invite_code, created_at
)

challenges (
  id, name, target_days INTEGER DEFAULT 75,
  start_date,
  is_shared BOOLEAN DEFAULT 1,            -- solo = single member
  status TEXT,                            -- 'active'|'completed'|'abandoned'
  created_at
)

challenge_members (
  challenge_id, user_id,                  -- composite PK
  projected_end_date,                     -- per member: pauses shift it
  days_completed INTEGER DEFAULT 0,
  days_missed    INTEGER DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  best_streak    INTEGER DEFAULT 0
)

pauses (
  id, user_id, challenge_id,
  start_date, end_date, reason TEXT,
  status TEXT DEFAULT 'pending',          -- 'pending'|'approved'|'declined'
  approved_by, resolved_at, created_at    -- pending + created_at < now-24h
)                                         -- reads as approved; no cron needed

reactions (
  id, from_user_id, target_kind,          -- 'day'|'photo'|'measurement'
  target_date, target_media_id,
  emoji TEXT, body TEXT,                  -- body = short note, nullable
  seen_at, created_at
)

daily_log (
  user_id, date,                          -- composite PK
  steps            INTEGER,               -- manual, nullable
  sleep_minutes    INTEGER,               -- manual, entered next morning
  water_oz         INTEGER DEFAULT 0,
  pages_read       INTEGER DEFAULT 0,
  workout_minutes  INTEGER DEFAULT 0,
  workout_type     TEXT,                  -- 'strength'|'cardio'|'dance'|...
  whole_food       BOOLEAN DEFAULT 0,
  no_alcohol       BOOLEAN DEFAULT 0,
  no_junk_food     BOOLEAN DEFAULT 0,
  self_care        BOOLEAN DEFAULT 0,
  journaled        BOOLEAN DEFAULT 0,     -- paper journal; checkbox only
  steps_bucket     TEXT,                  -- 'low'|'mid'|'high' when no exact count
  challenge_id,                           -- nullable: logging continues between runs
  logged_late      BOOLEAN DEFAULT 0,     -- entered after the day it describes
  paused           BOOLEAN DEFAULT 0,     -- inside a declared pause window
  updated_at, device_id
)

user_settings (
  user_id,                                -- PK
  goal_water_oz        INTEGER DEFAULT 80,
  goal_pages           INTEGER DEFAULT 20,
  goal_steps           INTEGER DEFAULT 10000,
  goal_workout_minutes INTEGER DEFAULT 45,
  goal_sleep_minutes   INTEGER DEFAULT 480,
  completion_threshold INTEGER DEFAULT 3,  -- N of the 6 scored items
  step_entry_mode      TEXT DEFAULT 'both',   -- buckets shown, exact optional
  theme                TEXT DEFAULT 'dark',
  -- no per-user timezone: one app-wide zone governs day boundaries
  updated_at
)

media (
  id, user_id, taken_on, kind,            -- 'progress_photo'
  storage_path, thumb_path,
  visibility TEXT DEFAULT 'private',      -- 'private' | 'shared'
  shared_at, created_at
)

measurements (
  id, user_id, taken_on,
  weight_lb REAL, waist_in REAL, hip_in REAL, arm_in REAL,
  thigh_in REAL, notes, created_at
)

documentaries (
  id, user_id, watched_on,
  title TEXT, notes TEXT,                 -- notes optional
  created_at
)

sync_state (
  device_id, user_id, last_pulled_at, last_pushed_at
)
```

Reading tracks pages only — no book titles, no shelf, no current-page state. It's the one metric where extra structure would add entry friction without changing the goal, which is 20 pages of anything.

Documentaries get their own rows rather than a counter on `daily_log`, because you want the titles. The rolling goal is then a `COUNT(*)` over the trailing seven days, and you get a watch history for free.

Note what isn't here: there is no `weekly_log` table. Because the weekly goals run on a rolling 7-day window rather than a calendar week, nothing needs to be stored per-week — workouts, documentaries and journaling all sum from `daily_log` over the trailing seven days, and the photo derives from `media.taken_on`. One fewer table, one fewer sync surface, and no week-rollover job.

There is also no journal table. The journal is physical, so the app records only whether it happened — one boolean on `weekly_log`. Body measurements have no `visibility` column either; they sync visible to both users. Photos are the only per-item privacy decision in the system, which keeps §7.1 the single place that logic lives.

Weekly counts derive from `daily_log` where possible (workout count = days with `workout_minutes > 0` in that ISO week) rather than being stored twice. Only things that can't be derived — documentaries watched, photo taken — get their own weekly row.

---

## 7. Sync design

The offline-first requirement sounds like it demands CRDTs. It doesn't, because of one property of this specific product: **each user writes only their own rows.** You never edit her water intake; she never edits your page count. That removes the entire class of concurrent-edit conflicts, and leaves only one real case — the same user on two devices, or a queued offline write landing after a newer one.

Last-write-wins per field, with `updated_at` as the clock, is sufficient and correct here.

**Client:** IndexedDB (via Dexie) holds the local copy. Every mutation writes locally first and enqueues an outbound op. The UI reads only from IndexedDB, so it never blocks on the network.

**Push:** `POST /api/v1/sync` with the pending op queue. Server applies LWW, returns the authoritative rows.

**Pull:** `GET /api/v1/sync?since=<timestamp>` returns everything changed for both users since that mark. On app foreground, and every ~60s while open.

**Live updates (optional, Phase 5):** an SSE stream so her ring animates on your screen when she logs a workout. This is the feature that makes a shared tracker feel shared rather than like two separate apps, and it's about 30 lines on each side.

**Photos:** never in the sync payload. Upload separately to `POST /api/v1/media`, sync only the metadata row, and lazy-load thumbnails. A year of weekly full-resolution photos for two people is roughly 800 MB — trivial for your storage, but not something you want moving through a JSON sync endpoint.

### 7.1 Media privacy — the one exception to full visibility

Everything else in this app is mutually visible by default. Progress photos are not: they default to private and become visible to the partner only when the owner explicitly shares that specific photo. This is a per-photo decision, not a global setting, so a good week can be shared and a bad week kept private without changing any preference.

Four rules make this work properly:

**1. Default private, always.** A photo is `private` at the moment of upload. Sharing is a deliberate second action. No "share by default" toggle, no remembered preference that silently shares next week's photo because last week's was shared — the failure mode here is one accidental share, and defaults are what prevent it.

**2. Enforce on the server, never in the UI.** `GET /api/v1/media?user_id=<partner>` must return only rows where `visibility = 'shared'`. The partner's client should never receive metadata, thumbnails, or storage paths for private photos — not hidden with a CSS rule, not filtered client-side. If a private photo's existence is never transmitted, no client bug can leak it.

**3. Decouple the completion signal from the artifact.** The weekly "photo taken ✓" indicator stays visible to both users regardless of the photo's visibility. She sees that you kept the habit; she doesn't see the image unless you share it. This is what lets accountability and privacy coexist, and it's the whole design in one sentence.

**4. Unsharing is honest about what it can and can't do.** Setting a photo back to `private` revokes future access — the server stops serving it, signed URLs are invalidated. It cannot recall a copy already downloaded to the other device. Mitigate by not persisting shared partner media to IndexedDB (fetch on view, memory-cache only, short-lived signed URLs), and say so plainly in the UI: *"Unsharing hides this from her going forward. It can't undo a screenshot."* Overpromising here is worse than the limitation.

**The asymmetry worth naming out loud:** you administer the server. "Private" means private from the application, not from the box's root user. That's fine if she knows it, and a problem if she assumes otherwise. If she'd rather it be private from you too, the only real answer is client-side encryption — encrypt private photos in the browser with a key derived from that user's passphrase before upload, so the server stores ciphertext it cannot open. It costs you a key-management flow, a lost-passphrase-means-lost-photos warning, and thumbnails that must be generated on-device. Worth it only if she asks; worth *mentioning to her* either way.

---

## 8. UI and the ring system

### Four rings, one metric each

Water, reading, steps, workout — one ring per metric, no weighting to explain. Rendered concentrically, Apple-style, with the outer ring carrying the metric you most want to see at a glance.

Two practical notes from the mockup:

**Four concentric rings is the ceiling.** At a 150px diameter each band lands around 11px. It works, but there's no room for a fifth, and it's why sleep went to a card.

**Build both layouts in Phase 1.** Concentric and a 2x2 grid of separate labelled rings, switchable from settings, decided on a real device rather than in a mockup. The ring component takes the same four values either way, so the second layout is a rendering variant rather than a second feature — cheap now, and it settles the question with your eyes instead of an argument.

**Colour has to carry identity.** Four rings drawn from one pink family are hard to distinguish at that stroke width. The mockup solves it with three pinks plus a cool blue for water. If you want it strictly pink, the fix is persistent labels rather than colour separation.

### The other five items

Whole food, no alcohol, no junk food, and self-care sit directly under the rings as a 2x2 grid of tap-to-toggle pills. Sleep gets its own card with a seven-day trend and no target line — entered in the morning with a half-hour stepper, charted rather than scored.

### Streak logic

**Six items score:** steps, water, reading, sleep, self-care, journaling. A day counts as complete at `completion_threshold` — default 3 of 6. Missing a day resets the streak to zero.

**Four are tracked but unscored:** workout, whole food, no alcohol, no junk food. They're logged, charted and visible to both users; they just don't gate the streak.

Two things follow.

**Workout being unscored daily is a feature, not an oversight.** Its goal is 4 in a rolling 7 days, so a rest day should never read as a failure. The daily streak stays clean and the workout goal lives in the trailing strip where it belongs.

**But three of the four rings score and one doesn't, and rings look equally weighted.** Without a cue, an unclosed workout ring implies a broken day when it doesn't. Fix it in the display, not the data: put a small `3/6 today` counter next to the streak so what actually counts is legible, and let the workout ring read as informational.

One calibration note, since the threshold and the item list were chosen separately: three of six is half the list, and combined with unlimited backfill and no reminders, the streak is close to unbreakable. That may be exactly right — a gentle streak for two people who want encouragement rather than enforcement. If you meant three fewer than *all ten* items, that's 7 of 10 and a substantially stricter app. It's one integer in settings either way, so it's cheap to try 3 and raise it.

### Challenges

The app runs as a sequence of 75-day challenges rather than an endless log. When one ends you start another; every previous challenge's days, photos and measurements stay queryable forever.

**A missed day breaks the streak but doesn't end the challenge.** The challenge is a span rather than a pass/fail gauntlet: 75 active days from the start date, where approved pause days don't count as active and push the finish out. A miss costs you the streak and a mark on the scorecard, not the run.

**It ends in a scorecard, not a verdict** — days completed, days missed, longest streak, first-to-last photo comparison, measurement delta. This is the artifact worth building well; it's the thing you'll actually look at twice.

**Between challenges, logging continues.** The next run starts manually with a suggested rest window of a few days rather than auto-chaining. In the gap, habits are still logged and charted with a null `challenge_id` — they just don't feed a streak or a day count. Stopping the tracking entirely during a rest week would put a hole in the measurement and photo history for no reason.

**Shared by default, solo when wanted.** A shared challenge has both of you as members with one start date; a solo one has a single member. Note that the end date lives on the member, not the challenge — one person's approved pause shifts their finish without moving the other's, so a shared challenge can legitimately end on two different days.

This is a better fit than an open-ended tracker for two reasons. It gives the progress photos a natural before-and-after span, and it gives both of you a defined finish rather than a streak that can only ever be broken.

Day numbering is per challenge — "Day 8" means the eighth qualifying day of the current run, not the eighth day since install. Photos, measurements and reactions live outside the challenge and span all of them, so a compare view can put challenge one day one against challenge three day forty.

### Pause mode

A pause is a declared date range during which days don't count against you: the streak freezes rather than resets, paused days don't consume challenge days, and the projected end date shifts out by the length of the pause.

Design rules:

- **Declared, not retroactive.** A pause can be set for today or any future range. Letting someone pause last week after seeing a broken streak turns it into an undo button, which defeats the one-day edit window.
- **Per user, not per couple.** One person's injury shouldn't stall the other's challenge.
- **The partner approves it.** A pause is a request, not a setting. That's what makes it accountability rather than an escape hatch.
- **Visually distinct.** Paused days render greyed on the calendar, neither complete nor missed. They should never look like success.

**Approval auto-grants after 24 hours.** With no notifications, a request only surfaces when the other person next opens the app, so an unanswered request approves itself a day later. The partner keeps a real veto; they just can't block by inattention.

Two details make this work cleanly:

**Approval backdates.** Whether granted by tap or by timer, an approved pause applies from its declared start date, not from the moment of approval. So it doesn't matter if a day boundary falls inside the pending window — the streak is made whole retroactively. A decline is what converts those days to misses.

**No scheduler required.** The 24-hour grant is evaluated lazily at read time: a row that is still `pending` with a `created_at` older than 24 hours reads as approved. No cron job, no background worker, nothing to fail silently at 3 a.m. — which matters in an architecture that deliberately has no other scheduled work.

Pending requests should be the loudest thing in the partner's view. Without push there's no icon badge, so it sits at the top of the home screen until resolved. A declined pause is a conversation between two people; the app records the decision rather than arbitrating it.

### Reactions and notes

With no push notifications, in-app interaction is the only social layer. Both users can drop an emoji reaction or a short note on the other's day, photo, or measurement entry. Unseen reactions surface as a badge the next time the app opens — the interaction is pull, not push, which is the point.

One rule inherited from §7.1: you can only react to what you can see. A private photo generates no reaction affordance for the partner because its existence is never transmitted.

### Rolling 7-day strip

```
Last 7 days —  Workouts ●●●○ 3/4      Docs ●●○ 2/3      Photo ✓
```

The 4x/week workout goal and 3 documentaries can't be daily rings without showing a false failure on every rest day, so they sit below as a trailing-window strip.

Rolling rather than calendar-week means there's no Sunday-night cliff and no artificial reset. The trade is that a met goal can un-meet itself: four workouts on Monday through Thursday reads 4/4 on Friday and 3/4 the next Tuesday as the oldest ages out. That's arguably more honest about current behaviour than a calendar week, but it should be labelled "last 7 days" everywhere so it never looks like a bug.

### Partner view

A second card with her four rings at ~60% scale. Tapping swaps focus. A shared calendar showing both streaks on one grid is the feature that makes this different from two people using separate trackers — worth building in Phase 3 rather than deferring.

### No notifications, and a one-day edit window

The app sends nothing. No nudges, no streak warnings, no partner alerts. That removes web push, VAPID keys, a subscription table, a per-timezone scheduler, and the onboarding step where both users must install to the home screen before a permission prompt will appear.

**Editing is limited to today and yesterday.** Once a day is two days old its scored items are frozen. This is what keeps the streak a measurement rather than a formality — a missed Tuesday can be caught Wednesday morning, but not reconstructed on Friday.

**Scope the lock to what's scored.** `daily_log` locks after the two-day window. Measurements, progress photos and documentary counts stay freely editable at any time — none of them gate the streak, and refusing to let someone correct a weight entry from last month is friction with no integrity benefit behind it. One rule, one table.

**Enforce server-side.** A client that permits editing any past date turns the streak into decoration regardless of what the UI shows. Reject writes to `daily_log` rows older than the window and return the current server date so the client can grey out locked days rather than failing a save silently.

**Keep `logged_late`.** With a one-day window it's cosmetic rather than protective, but a small dot on days filled in the morning after still tells you something true at a glance, and it costs one boolean.

**The residual risk, stated plainly:** no reminders plus a one-day window means two forgotten evenings in a row kill the streak with no warning at any point. The 3-of-6 threshold is what absorbs that — a distracted day still clears the bar as long as someone opens the app. If the streak starts dying in ways that feel unfair, the lever to pull is the window, not the threshold.

If a nudge ever becomes useful, the zero-code version is an iOS Reminders entry or a Shortcut on each phone, with no server involvement.

### Step entry — buckets with exact as an option

Three bucket buttons (under 5k / 5–10k / over 10k) fill the ring in thirds, with a small "enter exact" affordance beside them for anyone who wants the real number. Buckets are the default path because they're one tap; the exact field exists so the ring can fill proportionally when precision is wanted. Store whichever was given — `steps` or `steps_bucket` — and render the ring from whichever is present.

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

Both themes ship at launch with a user toggle (`user_settings.theme`). This is cheap only if it's done from the first commit: every colour lives as a CSS custom property scoped under a `[data-theme]` attribute, with zero hardcoded hex anywhere in the component tree. Retrofitting a second theme onto hardcoded colours is a full styling pass, so this belongs in the Phase 1 ground rules, not in polish.

**Typography:** a geometric sans with real weight contrast — Poppins, Outfit, or Cabinet Grotesk for headings. The reference screenshots get their character almost entirely from very heavy display type.

**Implementation:** rings are SVG circles with `stroke-dasharray` / `stroke-dashoffset` animated via CSS. No charting library; hand-rolled is under 100 lines.

### One design note on weight and measurements

Keep weight and body measurements out of the ring and streak system entirely — a separate tab, charted over time, with no target line, no streak, and no notification. Body metrics respond on a scale of weeks and fluctuate daily for reasons that have nothing to do with adherence; wiring them into a daily "did you succeed" display makes the app punish normal variation. Everything else on the list is a behavior you control same-day, which is what streaks are actually good at.

---

## 9. Proposed stack

| Layer | Choice | Why |
|---|---|---|
| Client | React + TypeScript + Vite | PWA tooling is mature (`vite-plugin-pwa`), and the component model maps cleanly to a later SwiftUI port |
| Styling | Tailwind + CSS custom properties | Palette lives in one place; theming is trivial |
| Local store | IndexedDB via Dexie | Real offline capability with a query API |
| API | FastAPI (Python) or Fastify (Node) | Pick whichever you'd rather debug at 11 PM |
| Database | SQLite + Litestream | Two users; Postgres is overkill. Litestream streams WAL to your storage volume for continuous backup |
| Host | Docker Compose on an Ubuntu VM | Matches how the rest of your lab runs |
| Ingress | Cloudflare Tunnel + Access | Valid TLS, no inbound ports, identity gate |

---

## 10. Security and privacy

Worth stating explicitly given what this app holds — progress photos, body measurements, journal entries, and daily behavior logs for two people.

- **Photos are the sensitive asset.** Store them outside the web root, serve only through authenticated, signed, short-lived URLs. Never a guessable path.
- **Authorize every media request against `visibility` and `user_id`.** Owner sees all their own; partner sees only `shared`. Check on the endpoint, not the query — an ID passed by a client is a request, not a permission.
- **Encrypt the volume at rest.** LUKS on the data volume, or at minimum full-disk encryption on the VM host.
- **Per-user bearer tokens**, long-lived, revocable, stored in the client's secure storage. Two users doesn't justify OAuth, but it does justify tokens you can rotate if a phone is lost.
- **Backups off-box.** Litestream to a separate volume, plus a periodic encrypted snapshot. The failure mode you care about is losing a year of progress photos to a disk, not an attacker.
- **Nothing exposed publicly without an identity gate.** Cloudflare Access or Tailscale, not a bare port forward.

---

## 11. Build phases

**Phase 0 — Decisions and schema** *(this document + a day)*
Close the open questions in §12. Freeze the schema. Stand up the empty VM and tunnel.

**Phase 1 — Single-user local PWA**
Rings, daily log, manual entry for everything, IndexedDB only, no server. Runs on your phone. The goal is to find out whether the ring grouping in §8 actually feels right before building anything behind it — this is the phase most likely to change the spec.

**Phase 2 — Backend and sync**
API, SQLite, tokens, push/pull sync, second user onboarded. Both people logging manually, seeing each other's rings.

**Phase 3 — Media and history**
Progress photos with per-photo visibility, measurements, weekly strip, shared calendar view.

**Phase 4 — Polish**
Live SSE updates, streak visualizations, month-in-review, backfill window.

**Phase 5 (optional, probably never) — Native migration**
$99 developer account, SwiftUI client against the same API, home-screen widgets, Watch app. Only worth it if you're both still using it daily and specifically want the wrist or widget experience.

---

## 12. Decisions closed, and what's left

**Settled:**

| Decision | Answer |
|---|---|
| Platform | PWA, self-hosted, no Apple Developer account |
| Health integration | None — all metrics manual |
| Rings | Four: water, reading, steps, workout |
| Sleep | Own card with trend chart, not scored |
| Streak | Configurable threshold of N of 9; miss resets to zero |
| Goals | Shared defaults, editable per user |
| Photo sharing | Per-photo opt-in, private by default |
| Measurements | Visible to both |
| Journal | Physical; app stores a checkbox only |
| Reminders | None — no notifications |
| Scored items | 6 of 10: steps, water, reading, sleep, self-care, journaling |
| Threshold | 3 of 6 (configurable) |
| Timezone | Single shared zone, not per user |
| Editing | Today and yesterday only, enforced server-side |
| Step entry | Buckets by default, exact optional |
| Theme | Both at launch, user toggle |
| Ring layout | Build concentric and 2×2, decide on device |
| Weekly goals | Rolling 7-day window, no fixed week start |
| Journaling | Daily checkbox in-app, writing stays on paper |
| Reading | Pages only, any book |
| Documentaries | Title and optional notes per entry |
| Measurements | Weight, waist, hips, arms, thighs |
| Structure | Sequential 75-day challenges, history retained |
| Pause | Requested per user, partner approves, auto-grants after 24h |
| The 75 | Active days from start; pauses push the finish out |
| Between runs | Manual start after a suggested rest, logging continues |
| Missed day | Streak breaks, challenge continues to its 75 days |
| Challenge mode | Shared by default, solo optional |
| Social | Emoji reactions and short notes, surfaced in-app |
| Onboarding | Invite code, no email or password flow |

**Nothing structural is open.** The remaining calls are ones best made against a running build rather than a document:

- Whether 3 of 6 is the right default once you've lived with it for a week.
- Whether the one-day edit window feels right or punishing in practice.
- Concentric versus 2×2 rings, decided on a real phone in Phase 1.
- Whether the workout ring earns its place in the ring set at all, given it doesn't score daily.

Phase 1 can start.

## Appendix — What each option costs you in effort

| Path | Apple fee | Build effort | Ongoing burden | Ceiling |
|---|---|---|---|---|
| PWA + Drive | $0 | High (hand-rolled merge) | Low | No widgets, no Watch, awkward auth |
| **PWA + self-hosted** | **$0** | **Medium** | **Medium (you own uptime)** | **No widgets, no Watch — no feature gap otherwise** |
| Native free-provisioned | $0 | High | Punishing (weekly re-signing) | Not distributable |
| Native + paid | $99/yr | High (SwiftUI) | Low | Widgets and Watch only |
