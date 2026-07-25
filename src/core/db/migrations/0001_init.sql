-- 0001_init — complete v1 schema.
--
-- FROZEN ONCE SHIPPED. Never edit this file after it has run on a real machine;
-- add a new numbered migration instead. See docs/DECISIONS.md 006 and 012.
--
-- The runner in migrate.ts splits statements on ';', so no statement in this file
-- may contain a semicolon inside a string literal.

CREATE TABLE IF NOT EXISTS books (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  author            TEXT,
  format            TEXT NOT NULL CHECK (format IN ('epub', 'txt')),
  source_path       TEXT,
  normalize_version TEXT NOT NULL,
  unit_count        INTEGER NOT NULL DEFAULT 0,
  imported_at       TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chapters (
  book_id       TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_index INTEGER NOT NULL,
  title         TEXT,
  PRIMARY KEY (book_id, chapter_index)
);

-- unit_id is a content hash (see docs/DECISIONS.md 001). It is the anchor every
-- other table points at. Rows are never deleted, only flagged is_orphaned.
CREATE TABLE IF NOT EXISTS units (
  unit_id              TEXT PRIMARY KEY,
  book_id              TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_index        INTEGER NOT NULL,
  seq                  INTEGER NOT NULL,
  kind                 TEXT NOT NULL CHECK (kind IN ('paragraph', 'heading', 'list_item', 'quote')),
  text                 TEXT NOT NULL,
  char_count           INTEGER NOT NULL,
  is_orphaned          INTEGER NOT NULL DEFAULT 0,
  matched_from_unit_id TEXT,
  created_at           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_units_book_seq ON units (book_id, seq);
CREATE INDEX IF NOT EXISTS idx_units_book_chapter ON units (book_id, chapter_index, seq);
CREATE INDEX IF NOT EXISTS idx_units_orphaned ON units (book_id, is_orphaned);

-- The coach persona is data, not UI logic, so v2 can edit it without a rewrite.
CREATE TABLE IF NOT EXISTS coach_profiles (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  level              TEXT NOT NULL,
  target_locale      TEXT NOT NULL,
  tone               TEXT,
  extra_instructions TEXT,
  is_default         INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id                   TEXT PRIMARY KEY,
  book_id              TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  coach_profile_id     TEXT NOT NULL REFERENCES coach_profiles(id),
  rolling_summary      TEXT,
  summary_upto_unit_id TEXT,
  summary_upto_seq     INTEGER,
  started_at           TEXT NOT NULL,
  last_active_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_book ON sessions (book_id, last_active_at);

CREATE TABLE IF NOT EXISTS messages (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  book_id       TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  unit_id       TEXT,
  seq           INTEGER NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('user', 'coach')),
  mode          TEXT CHECK (mode IN ('explain', 'ask')),
  content       TEXT NOT NULL,
  provider_id   TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session_seq ON messages (session_id, seq);
CREATE INDEX IF NOT EXISTS idx_messages_unit ON messages (unit_id);

CREATE TABLE IF NOT EXISTS progress (
  book_id    TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
  unit_id    TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id                TEXT PRIMARY KEY,
  book_id           TEXT REFERENCES books(id) ON DELETE CASCADE,
  unit_id           TEXT,
  selected_text     TEXT,
  body              TEXT NOT NULL,
  source            TEXT NOT NULL CHECK (source IN ('selection', 'chat', 'manual')),
  source_message_id TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_book ON notes (book_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notes_unit ON notes (unit_id);

-- ease/interval_days/due_at/review_count are unused in v1 and exist so the v3 SRS
-- review mode needs no migration of existing rows.
CREATE TABLE IF NOT EXISTS vocab (
  id                TEXT PRIMARY KEY,
  term              TEXT NOT NULL,
  gloss_zh          TEXT NOT NULL,
  reading           TEXT,
  example_en        TEXT,
  note              TEXT,
  book_id           TEXT REFERENCES books(id) ON DELETE CASCADE,
  unit_id           TEXT,
  source            TEXT NOT NULL CHECK (source IN ('selection', 'chat', 'manual')),
  source_message_id TEXT,
  ease              REAL NOT NULL DEFAULT 2.5,
  interval_days     INTEGER NOT NULL DEFAULT 0,
  due_at            TEXT,
  review_count      INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vocab_book ON vocab (book_id, created_at);
CREATE INDEX IF NOT EXISTS idx_vocab_unit ON vocab (unit_id);
CREATE INDEX IF NOT EXISTS idx_vocab_term ON vocab (term);

INSERT OR IGNORE INTO coach_profiles
  (id, name, level, target_locale, tone, extra_instructions, is_default, created_at, updated_at)
VALUES
  ('default', '中高級閱讀教練', 'intermediate_advanced', 'zh-TW', 'encouraging', NULL, 1,
   '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
