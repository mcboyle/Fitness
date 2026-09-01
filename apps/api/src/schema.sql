-- BUILDSPEC §8, verbatim, plus two things the spec implies but doesn't list:
-- a tokens table (§9 wants revocable per-user bearer tokens) and server_seq
-- on every synced table (the sync cursor, see db.ts).

PRAGMA journal_mode = WAL;      -- required for Litestream
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  avatar_color  TEXT NOT NULL,
  invite_code   TEXT UNIQUE,    -- NULL once claimed; a code is single-use
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  hash        TEXT NOT NULL UNIQUE,   -- sha-256; the plaintext is never stored
  label       TEXT,
  created_at  TEXT NOT NULL,
  revoked_at  TEXT
);
CREATE INDEX IF NOT EXISTS tokens_user ON tokens(user_id);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id               TEXT PRIMARY KEY REFERENCES users(id),
  goal_water_oz         INTEGER NOT NULL DEFAULT 80,
  goal_pages            INTEGER NOT NULL DEFAULT 20,
  goal_steps            INTEGER NOT NULL DEFAULT 10000,
  goal_workout_minutes  INTEGER NOT NULL DEFAULT 45,
  goal_sleep_minutes    INTEGER NOT NULL DEFAULT 480,
  completion_threshold  INTEGER NOT NULL DEFAULT 4,
  step_entry_mode       TEXT    NOT NULL DEFAULT 'both',
  theme                 TEXT    NOT NULL DEFAULT 'dark',
  ring_layout           TEXT    NOT NULL DEFAULT 'concentric',
  updated_at            TEXT    NOT NULL,
  server_seq            INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS challenges (
  id           TEXT PRIMARY KEY,
  name         TEXT    NOT NULL,
  target_days  INTEGER NOT NULL DEFAULT 75,
  start_date   TEXT    NOT NULL,
  is_shared    INTEGER NOT NULL DEFAULT 1,
  status       TEXT    NOT NULL DEFAULT 'active',
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL,
  server_seq   INTEGER NOT NULL
);

-- projected_end_date lives here, not on challenges: one person's pause shifts
-- their finish and not the other's, so a shared challenge can legitimately end
-- on two different days (§5).
CREATE TABLE IF NOT EXISTS challenge_members (
  challenge_id        TEXT NOT NULL REFERENCES challenges(id),
  user_id             TEXT NOT NULL REFERENCES users(id),
  projected_end_date  TEXT NOT NULL,
  days_completed      INTEGER NOT NULL DEFAULT 0,
  days_missed         INTEGER NOT NULL DEFAULT 0,
  current_streak      INTEGER NOT NULL DEFAULT 0,
  best_streak         INTEGER NOT NULL DEFAULT 0,
  updated_at          TEXT NOT NULL,
  server_seq          INTEGER NOT NULL,
  PRIMARY KEY (challenge_id, user_id)
);

CREATE TABLE IF NOT EXISTS daily_log (
  user_id          TEXT NOT NULL REFERENCES users(id),
  date             TEXT NOT NULL,
  challenge_id     TEXT REFERENCES challenges(id),  -- null between challenges
  steps            INTEGER,
  steps_bucket     TEXT,
  sleep_minutes    INTEGER,
  water_oz         INTEGER NOT NULL DEFAULT 0,
  pages_read       INTEGER NOT NULL DEFAULT 0,
  workout_minutes  INTEGER NOT NULL DEFAULT 0,
  workout_type     TEXT,
  whole_food       INTEGER NOT NULL DEFAULT 0,
  no_alcohol       INTEGER NOT NULL DEFAULT 0,
  no_junk_food     INTEGER NOT NULL DEFAULT 0,
  self_care        INTEGER NOT NULL DEFAULT 0,
  journaled        INTEGER NOT NULL DEFAULT 0,
  logged_late      INTEGER NOT NULL DEFAULT 0,
  paused           INTEGER NOT NULL DEFAULT 0,
  updated_at       TEXT NOT NULL,
  device_id        TEXT,
  server_seq       INTEGER NOT NULL,
  PRIMARY KEY (user_id, date)
);
CREATE INDEX IF NOT EXISTS daily_log_seq ON daily_log(server_seq);

CREATE TABLE IF NOT EXISTS pauses (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  challenge_id  TEXT REFERENCES challenges(id),
  start_date    TEXT NOT NULL,
  end_date      TEXT NOT NULL,
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  approved_by   TEXT REFERENCES users(id),
  resolved_at   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  server_seq    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS media (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  taken_on      TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'progress_photo',
  storage_path  TEXT NOT NULL,
  thumb_path    TEXT,
  visibility    TEXT NOT NULL DEFAULT 'private',
  shared_at     TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  server_seq    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS measurements (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  taken_on    TEXT NOT NULL,
  weight_lb   REAL,
  waist_in    REAL,
  hip_in      REAL,
  arm_in      REAL,
  thigh_in    REAL,
  notes       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  server_seq  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS documentaries (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  watched_on  TEXT NOT NULL,
  title       TEXT NOT NULL,
  notes       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  server_seq  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reactions (
  id              TEXT PRIMARY KEY,
  from_user_id    TEXT NOT NULL REFERENCES users(id),
  target_kind     TEXT NOT NULL,
  target_date     TEXT,
  target_media_id TEXT REFERENCES media(id),
  emoji           TEXT NOT NULL,
  body            TEXT,
  seen_at         TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  server_seq      INTEGER NOT NULL
);

-- Single-row counter backing the sync cursor.
CREATE TABLE IF NOT EXISTS sync_seq (
  id  INTEGER PRIMARY KEY CHECK (id = 1),
  n   INTEGER NOT NULL
);
INSERT OR IGNORE INTO sync_seq (id, n) VALUES (1, 0);
