-- The Commons — schema for Cloudflare D1
-- Apply with:  wrangler d1 execute trh-commons --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS threads (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  room         TEXT    NOT NULL,
  title        TEXT    NOT NULL,
  body         TEXT    NOT NULL,
  author       TEXT    NOT NULL,
  email        TEXT,                                   -- never returned to the public API
  new_here     INTEGER NOT NULL DEFAULT 0,             -- 1 pins it to the top of its room
  status       TEXT    NOT NULL DEFAULT 'open',        -- open | answered | hidden
  reply_count  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL,
  ip_hash      TEXT                                    -- salted hash, for rate limiting only
);

CREATE INDEX IF NOT EXISTS idx_threads_room
  ON threads (room, status, new_here DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS replies (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id  INTEGER NOT NULL REFERENCES threads (id) ON DELETE CASCADE,
  body       TEXT    NOT NULL,
  author     TEXT    NOT NULL,
  email      TEXT,
  status     TEXT    NOT NULL DEFAULT 'visible',       -- visible | hidden
  created_at TEXT    NOT NULL,
  ip_hash    TEXT
);

CREATE INDEX IF NOT EXISTS idx_replies_thread
  ON replies (thread_id, status, created_at);

-- One row per poster per hour. Keeps a single machine from flooding a room.
CREATE TABLE IF NOT EXISTS rate_limit (
  ip_hash      TEXT    NOT NULL,
  window_start TEXT    NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, window_start)
);
