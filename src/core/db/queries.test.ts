import { beforeEach, describe, expect, it } from 'vitest';

import type { DbDriver } from './driver';
import { migrate, splitStatements } from './migrate';
import { createTestDb } from './node-driver';
import * as q from './queries';

const BOOK: q.NewBook = {
  id: 'book-1',
  title: 'Pride and Prejudice',
  author: 'Jane Austen',
  format: 'epub',
  sourcePath: '/books/pp.epub',
  normalizeVersion: 'v1',
  unitCount: 3,
};

const UNITS: q.NewUnit[] = [
  { unitId: 'aaaa', chapterIndex: 0, seq: 0, kind: 'heading', text: 'Chapter 1' },
  { unitId: 'bbbb', chapterIndex: 0, seq: 1, kind: 'paragraph', text: 'It is a truth.' },
  { unitId: 'cccc', chapterIndex: 1, seq: 2, kind: 'paragraph', text: 'However little.' },
];

let db: DbDriver;

beforeEach(async () => {
  db = await createTestDb();
});

describe('migrations', () => {
  it('seeds a default zh-TW coach profile', async () => {
    const profile = await q.getDefaultCoachProfile(db);
    expect(profile).not.toBeNull();
    expect(profile?.target_locale).toBe('zh-TW');
    expect(profile?.level).toBe('intermediate_advanced');
  });

  it('is idempotent', async () => {
    const secondRun = await migrate(db);
    expect(secondRun).toEqual([]);

    const applied = await db.select<{ name: string }>(
      'SELECT name FROM schema_migrations',
    );
    expect(applied).toHaveLength(1);
  });

  it('strips comments and blank statements when splitting', () => {
    const statements = splitStatements(
      '-- a comment;\nCREATE TABLE a (b TEXT);\n\n-- another;\nCREATE TABLE c (d TEXT);\n',
    );
    expect(statements).toEqual(['CREATE TABLE a (b TEXT)', 'CREATE TABLE c (d TEXT)']);
  });
});

describe('books, chapters, units', () => {
  beforeEach(async () => {
    await q.insertBook(db, BOOK);
    await q.insertChapters(db, BOOK.id, [
      { chapterIndex: 0, title: 'Chapter 1' },
      { chapterIndex: 1, title: 'Chapter 2' },
    ]);
    await q.insertUnits(db, BOOK.id, UNITS);
  });

  it('round-trips a book and its units in seq order', async () => {
    expect(await q.listBooks(db)).toHaveLength(1);
    expect((await q.listChapters(db, BOOK.id)).map((c) => c.title)).toEqual([
      'Chapter 1',
      'Chapter 2',
    ]);

    const units = await q.listUnits(db, BOOK.id);
    expect(units.map((u) => u.unit_id)).toEqual(['aaaa', 'bbbb', 'cccc']);
    expect(units[1]?.char_count).toBe('It is a truth.'.length);
  });

  it('re-importing the same unit_id updates position instead of duplicating', async () => {
    await q.insertUnits(db, BOOK.id, [
      { unitId: 'bbbb', chapterIndex: 0, seq: 9, kind: 'paragraph', text: 'It is a truth.' },
    ]);
    const units = await q.listUnits(db, BOOK.id);
    expect(units).toHaveLength(3);
    expect(units.find((u) => u.unit_id === 'bbbb')?.seq).toBe(9);
  });

  it('lookback crosses chapter boundaries', async () => {
    const before = await q.listUnitsBefore(db, BOOK.id, 2, 2);
    expect(before.map((u) => u.unit_id)).toEqual(['aaaa', 'bbbb']);
    expect(before[0]?.chapter_index).toBe(0);
  });

  it('orphans units rather than deleting them', async () => {
    await q.markUnitsOrphaned(db, ['bbbb']);

    expect((await q.listUnits(db, BOOK.id)).map((u) => u.unit_id)).toEqual([
      'aaaa',
      'cccc',
    ]);
    // Still retrievable by id, so its notes keep resolving.
    expect((await q.getUnit(db, 'bbbb'))?.is_orphaned).toBe(1);
  });

  it('finds units within the re-match window', async () => {
    const near = await q.listUnitsNear(db, BOOK.id, 1, 1);
    expect(near.map((u) => u.unit_id)).toEqual(['aaaa', 'bbbb', 'cccc']);
  });
});

describe('sessions and messages', () => {
  beforeEach(async () => {
    await q.insertBook(db, BOOK);
    await q.insertUnits(db, BOOK.id, UNITS);
  });

  it('reuses the existing session for a book', async () => {
    const first = await q.getOrCreateSession(db, BOOK.id, 'default');
    const second = await q.getOrCreateSession(db, BOOK.id, 'default');
    expect(second.id).toBe(first.id);
  });

  it('assigns increasing seq and returns messages oldest-first', async () => {
    const session = await q.getOrCreateSession(db, BOOK.id, 'default');
    for (const content of ['one', 'two', 'three']) {
      await q.insertMessage(db, {
        sessionId: session.id,
        bookId: BOOK.id,
        unitId: 'bbbb',
        role: 'user',
        mode: 'ask',
        content,
        providerId: 'mock',
        inputTokens: 10,
        outputTokens: 20,
      });
    }

    const recent = await q.listRecentMessages(db, session.id, 2);
    expect(recent.map((m) => m.content)).toEqual(['two', 'three']);
    expect(recent.map((m) => m.seq)).toEqual([2, 3]);
    expect(recent[0]?.output_tokens).toBe(20);
  });

  it('stores the rolling summary with its high-water mark', async () => {
    const session = await q.getOrCreateSession(db, BOOK.id, 'default');
    await q.updateRollingSummary(db, session.id, 'so far…', 'cccc', 2);

    const reloaded = await q.getOrCreateSession(db, BOOK.id, 'default');
    expect(reloaded.rolling_summary).toBe('so far…');
    expect(reloaded.summary_upto_seq).toBe(2);
  });
});

describe('progress', () => {
  beforeEach(async () => {
    await q.insertBook(db, BOOK);
    await q.insertUnits(db, BOOK.id, UNITS);
  });

  it('upserts to a single row per book', async () => {
    await q.saveProgress(db, BOOK.id, 'bbbb', 1);
    await q.saveProgress(db, BOOK.id, 'cccc', 2);

    const progress = await q.getProgress(db, BOOK.id);
    expect(progress?.unit_id).toBe('cccc');
    expect(progress?.seq).toBe(2);
  });

  it('returns null for a book that was never opened', async () => {
    expect(await q.getProgress(db, BOOK.id)).toBeNull();
  });
});

describe('notes and vocab', () => {
  beforeEach(async () => {
    await q.insertBook(db, BOOK);
    await q.insertUnits(db, BOOK.id, UNITS);
  });

  it('records all three capture sources', async () => {
    await q.insertNote(db, {
      bookId: BOOK.id,
      unitId: 'bbbb',
      selectedText: 'a truth',
      body: 'idiom',
      source: 'selection',
      sourceMessageId: null,
    });
    await q.insertNote(db, {
      bookId: BOOK.id,
      unitId: 'bbbb',
      selectedText: null,
      body: 'from the coach',
      source: 'chat',
      sourceMessageId: 'msg-1',
    });
    await q.insertNote(db, {
      bookId: null,
      unitId: null,
      selectedText: null,
      body: 'typed by hand',
      source: 'manual',
      sourceMessageId: null,
    });

    const notes = await q.listNotes(db, BOOK.id);
    expect(notes.map((n) => n.source).sort()).toEqual([
      'chat',
      'manual',
      'selection',
    ]);
    expect(notes.find((n) => n.source === 'manual')?.unit_id).toBeNull();
  });

  it('defaults SRS columns so v3 needs no migration', async () => {
    await q.insertVocab(db, {
      term: 'truth',
      glossZh: '真理',
      reading: null,
      exampleEn: 'It is a truth.',
      note: null,
      bookId: BOOK.id,
      unitId: 'bbbb',
      source: 'selection',
      sourceMessageId: null,
    });

    const [entry] = await q.listVocab(db, BOOK.id);
    expect(entry?.ease).toBe(2.5);
    expect(entry?.review_count).toBe(0);
    expect(entry?.due_at).toBeNull();
  });

  it('caps recent vocab for prompt context', async () => {
    for (const term of ['a', 'b', 'c']) {
      await q.insertVocab(db, {
        term,
        glossZh: term,
        reading: null,
        exampleEn: null,
        note: null,
        bookId: BOOK.id,
        unitId: null,
        source: 'manual',
        sourceMessageId: null,
      });
    }
    expect(await q.listRecentVocab(db, BOOK.id, 2)).toHaveLength(2);
  });
});
