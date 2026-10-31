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

-- People who asked to hear from you. Collected here so nothing is lost while
-- you decide on a mailing-list provider; export with:
--   wrangler d1 execute trh-commons --remote \
--     --command "SELECT name, email, source, created_at FROM subscribers ORDER BY created_at;"
CREATE TABLE IF NOT EXISTS subscribers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT    NOT NULL UNIQUE,
  name       TEXT,
  source     TEXT    NOT NULL DEFAULT 'footer',   -- which form they used
  status     TEXT    NOT NULL DEFAULT 'active',   -- active | removed
  created_at TEXT    NOT NULL,
  ip_hash    TEXT
);

CREATE INDEX IF NOT EXISTS idx_subscribers_created
  ON subscribers (status, created_at DESC);

-- Field Notes. Written from /admin.html so a note can be published from a
-- phone, which editing HTML by hand never allowed.
CREATE TABLE IF NOT EXISTS notes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT    NOT NULL UNIQUE,
  kind          TEXT    NOT NULL,                  -- write | build | find
  title         TEXT    NOT NULL,
  summary       TEXT    NOT NULL DEFAULT '',       -- the line on the card
  body          TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'draft',  -- draft | published
  build_state   TEXT,                              -- build logs only: In progress | Shipped
  read_minutes  INTEGER NOT NULL DEFAULT 0,        -- 0 means work it out from the body
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  published_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_notes_live
  ON notes (status, published_at DESC);
