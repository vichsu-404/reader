import { newId, nowIso } from '../ids';
import type { DbDriver } from './driver';
import type {
  BookFormat,
  BookRow,
  CaptureSource,
  ChapterRow,
  CoachMode,
  CoachProfileRow,
  MessageRole,
  MessageRow,
  NoteRow,
  ProgressRow,
  SessionRow,
  UnitKind,
  UnitRow,
  VocabRow,
} from './schema';

// This is the only file in the project permitted to contain SQL. ESLint enforces
// it by banning @tauri-apps/plugin-sql imports outside src/core/db/.

/* ---------------------------------------------------------------- books --- */

export interface NewBook {
  id: string;
  title: string;
  author: string | null;
  format: BookFormat;
  sourcePath: string | null;
  normalizeVersion: string;
  unitCount: number;
}

export async function insertBook(db: DbDriver, book: NewBook): Promise<void> {
  const now = nowIso();
  await db.execute(
    `INSERT INTO books
       (id, title, author, format, source_path, normalize_version, unit_count, imported_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       author = excluded.author,
       unit_count = excluded.unit_count,
       updated_at = excluded.updated_at`,
    [
      book.id,
      book.title,
      book.author,
      book.format,
      book.sourcePath,
      book.normalizeVersion,
      book.unitCount,
      now,
      now,
    ],
  );
}

export function listBooks(db: DbDriver): Promise<BookRow[]> {
  return db.select<BookRow>('SELECT * FROM books ORDER BY updated_at DESC');
}

export async function getBook(
  db: DbDriver,
  bookId: string,
): Promise<BookRow | null> {
  const rows = await db.select<BookRow>('SELECT * FROM books WHERE id = ?', [
    bookId,
  ]);
  return rows[0] ?? null;
}

export async function deleteBook(db: DbDriver, bookId: string): Promise<void> {
  await db.execute('DELETE FROM books WHERE id = ?', [bookId]);
}

/* ------------------------------------------------------------- chapters --- */

export interface NewChapter {
  chapterIndex: number;
  title: string | null;
}

export async function insertChapters(
  db: DbDriver,
  bookId: string,
  chapters: readonly NewChapter[],
): Promise<void> {
  for (const chapter of chapters) {
    await db.execute(
      `INSERT INTO chapters (book_id, chapter_index, title) VALUES (?, ?, ?)
       ON CONFLICT(book_id, chapter_index) DO UPDATE SET title = excluded.title`,
      [bookId, chapter.chapterIndex, chapter.title],
    );
  }
}

export function listChapters(
  db: DbDriver,
  bookId: string,
): Promise<ChapterRow[]> {
  return db.select<ChapterRow>(
    'SELECT * FROM chapters WHERE book_id = ? ORDER BY chapter_index',
    [bookId],
  );
}

/* ---------------------------------------------------------------- units --- */

export interface NewUnit {
  unitId: string;
  chapterIndex: number;
  seq: number;
  kind: UnitKind;
  text: string;
  matchedFromUnitId?: string | null;
}

/**
 * Units are insert-or-ignore: duplicate text in the same chapter hashes to the
 * same unit_id by design (DECISIONS 001), and the first occurrence wins.
 */
export async function insertUnits(
  db: DbDriver,
  bookId: string,
  units: readonly NewUnit[],
): Promise<void> {
  const now = nowIso();
  for (const unit of units) {
    await db.execute(
      `INSERT INTO units
         (unit_id, book_id, chapter_index, seq, kind, text, char_count,
          is_orphaned, matched_from_unit_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(unit_id) DO UPDATE SET
         seq = excluded.seq,
         chapter_index = excluded.chapter_index,
         is_orphaned = 0`,
      [
        unit.unitId,
        bookId,
        unit.chapterIndex,
        unit.seq,
        unit.kind,
        unit.text,
        unit.text.length,
        unit.matchedFromUnitId ?? null,
        now,
      ],
    );
  }
}

export function listUnits(db: DbDriver, bookId: string): Promise<UnitRow[]> {
  return db.select<UnitRow>(
    'SELECT * FROM units WHERE book_id = ? AND is_orphaned = 0 ORDER BY seq',
    [bookId],
  );
}

export async function getUnit(
  db: DbDriver,
  unitId: string,
): Promise<UnitRow | null> {
  const rows = await db.select<UnitRow>(
    'SELECT * FROM units WHERE unit_id = ?',
    [unitId],
  );
  return rows[0] ?? null;
}

/** The `n` units immediately before `seq`, oldest first. Crosses chapters. */
export function listUnitsBefore(
  db: DbDriver,
  bookId: string,
  seq: number,
  limit: number,
): Promise<UnitRow[]> {
  return db.select<UnitRow>(
    `SELECT * FROM (
       SELECT * FROM units
       WHERE book_id = ? AND is_orphaned = 0 AND seq < ?
       ORDER BY seq DESC LIMIT ?
     ) ORDER BY seq`,
    [bookId, seq, limit],
  );
}

/** Units within `radius` of `seq` — the re-match search window. */
export function listUnitsNear(
  db: DbDriver,
  bookId: string,
  seq: number,
  radius: number,
): Promise<UnitRow[]> {
  return db.select<UnitRow>(
    `SELECT * FROM units
     WHERE book_id = ? AND seq BETWEEN ? AND ?
     ORDER BY seq`,
    [bookId, seq - radius, seq + radius],
  );
}

/** Units are never deleted — a stale unit keeps its notes and may be revived. */
export async function markUnitsOrphaned(
  db: DbDriver,
  unitIds: readonly string[],
): Promise<void> {
  for (const unitId of unitIds) {
    await db.execute('UPDATE units SET is_orphaned = 1 WHERE unit_id = ?', [
      unitId,
    ]);
  }
}

/* -------------------------------------------------------- coach profiles --- */

export async function getDefaultCoachProfile(
  db: DbDriver,
): Promise<CoachProfileRow | null> {
  const rows = await db.select<CoachProfileRow>(
    'SELECT * FROM coach_profiles ORDER BY is_default DESC, created_at LIMIT 1',
  );
  return rows[0] ?? null;
}

export function listCoachProfiles(db: DbDriver): Promise<CoachProfileRow[]> {
  return db.select<CoachProfileRow>(
    'SELECT * FROM coach_profiles ORDER BY is_default DESC, name',
  );
}

/* ------------------------------------------------------------- sessions --- */

export async function getOrCreateSession(
  db: DbDriver,
  bookId: string,
  coachProfileId: string,
): Promise<SessionRow> {
  const existing = await db.select<SessionRow>(
    'SELECT * FROM sessions WHERE book_id = ? ORDER BY last_active_at DESC LIMIT 1',
    [bookId],
  );
  const found = existing[0];
  if (found) return found;

  const now = nowIso();
  const id = newId();
  await db.execute(
    `INSERT INTO sessions
       (id, book_id, coach_profile_id, rolling_summary, summary_upto_unit_id,
        summary_upto_seq, started_at, last_active_at)
     VALUES (?, ?, ?, NULL, NULL, NULL, ?, ?)`,
    [id, bookId, coachProfileId, now, now],
  );

  const created = await db.select<SessionRow>(
    'SELECT * FROM sessions WHERE id = ?',
    [id],
  );
  const row = created[0];
  if (!row) throw new Error('session insert did not round-trip');
  return row;
}

export async function touchSession(
  db: DbDriver,
  sessionId: string,
): Promise<void> {
  await db.execute('UPDATE sessions SET last_active_at = ? WHERE id = ?', [
    nowIso(),
    sessionId,
  ]);
}

export async function updateRollingSummary(
  db: DbDriver,
  sessionId: string,
  summary: string,
  uptoUnitId: string,
  uptoSeq: number,
): Promise<void> {
  await db.execute(
    `UPDATE sessions
     SET rolling_summary = ?, summary_upto_unit_id = ?, summary_upto_seq = ?,
         last_active_at = ?
     WHERE id = ?`,
    [summary, uptoUnitId, uptoSeq, nowIso(), sessionId],
  );
}

/* ------------------------------------------------------------- messages --- */

export interface NewMessage {
  sessionId: string;
  bookId: string;
  unitId: string | null;
  role: MessageRole;
  mode: CoachMode | null;
  content: string;
  providerId: string;
  inputTokens: number;
  outputTokens: number;
}

export async function insertMessage(
  db: DbDriver,
  message: NewMessage,
): Promise<string> {
  const id = newId();
  const next = await db.select<{ next_seq: number }>(
    'SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM messages WHERE session_id = ?',
    [message.sessionId],
  );

  await db.execute(
    `INSERT INTO messages
       (id, session_id, book_id, unit_id, seq, role, mode, content, provider_id,
        input_tokens, output_tokens, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      message.sessionId,
      message.bookId,
      message.unitId,
      next[0]?.next_seq ?? 1,
      message.role,
      message.mode,
      message.content,
      message.providerId,
      message.inputTokens,
      message.outputTokens,
      nowIso(),
    ],
  );
  return id;
}

/** Most recent `limit` messages, returned oldest-first for prompt assembly. */
export function listRecentMessages(
  db: DbDriver,
  sessionId: string,
  limit: number,
): Promise<MessageRow[]> {
  return db.select<MessageRow>(
    `SELECT * FROM (
       SELECT * FROM messages WHERE session_id = ? ORDER BY seq DESC LIMIT ?
     ) ORDER BY seq`,
    [sessionId, limit],
  );
}

export async function getMessage(
  db: DbDriver,
  messageId: string,
): Promise<MessageRow | null> {
  const rows = await db.select<MessageRow>(
    'SELECT * FROM messages WHERE id = ?',
    [messageId],
  );
  return rows[0] ?? null;
}

/* ------------------------------------------------------------- progress --- */

export async function getProgress(
  db: DbDriver,
  bookId: string,
): Promise<ProgressRow | null> {
  const rows = await db.select<ProgressRow>(
    'SELECT * FROM progress WHERE book_id = ?',
    [bookId],
  );
  return rows[0] ?? null;
}

export async function saveProgress(
  db: DbDriver,
  bookId: string,
  unitId: string,
  seq: number,
): Promise<void> {
  await db.execute(
    `INSERT INTO progress (book_id, unit_id, seq, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(book_id) DO UPDATE SET
       unit_id = excluded.unit_id,
       seq = excluded.seq,
       updated_at = excluded.updated_at`,
    [bookId, unitId, seq, nowIso()],
  );
}

/* ---------------------------------------------------------------- notes --- */

export interface NewNote {
  bookId: string | null;
  unitId: string | null;
  selectedText: string | null;
  body: string;
  source: CaptureSource;
  sourceMessageId: string | null;
}

export async function insertNote(
  db: DbDriver,
  note: NewNote,
): Promise<string> {
  const id = newId();
  const now = nowIso();
  await db.execute(
    `INSERT INTO notes
       (id, book_id, unit_id, selected_text, body, source, source_message_id,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      note.bookId,
      note.unitId,
      note.selectedText,
      note.body,
      note.source,
      note.sourceMessageId,
      now,
      now,
    ],
  );
  return id;
}

export function listNotes(db: DbDriver, bookId: string): Promise<NoteRow[]> {
  return db.select<NoteRow>(
    'SELECT * FROM notes WHERE book_id = ? OR book_id IS NULL ORDER BY created_at DESC',
    [bookId],
  );
}

export async function deleteNote(db: DbDriver, noteId: string): Promise<void> {
  await db.execute('DELETE FROM notes WHERE id = ?', [noteId]);
}

/* ---------------------------------------------------------------- vocab --- */

export interface NewVocab {
  term: string;
  glossZh: string;
  reading: string | null;
  exampleEn: string | null;
  note: string | null;
  bookId: string | null;
  unitId: string | null;
  source: CaptureSource;
  sourceMessageId: string | null;
}

export async function insertVocab(
  db: DbDriver,
  vocab: NewVocab,
): Promise<string> {
  const id = newId();
  const now = nowIso();
  await db.execute(
    `INSERT INTO vocab
       (id, term, gloss_zh, reading, example_en, note, book_id, unit_id, source,
        source_message_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      vocab.term,
      vocab.glossZh,
      vocab.reading,
      vocab.exampleEn,
      vocab.note,
      vocab.bookId,
      vocab.unitId,
      vocab.source,
      vocab.sourceMessageId,
      now,
      now,
    ],
  );
  return id;
}

export function listVocab(db: DbDriver, bookId: string): Promise<VocabRow[]> {
  return db.select<VocabRow>(
    'SELECT * FROM vocab WHERE book_id = ? OR book_id IS NULL ORDER BY created_at DESC',
    [bookId],
  );
}

export function listRecentVocab(
  db: DbDriver,
  bookId: string,
  limit: number,
): Promise<VocabRow[]> {
  return db.select<VocabRow>(
    'SELECT * FROM vocab WHERE book_id = ? ORDER BY created_at DESC LIMIT ?',
    [bookId, limit],
  );
}

export async function deleteVocab(
  db: DbDriver,
  vocabId: string,
): Promise<void> {
  await db.execute('DELETE FROM vocab WHERE id = ?', [vocabId]);
}
