import { beforeEach, describe, expect, it } from 'vitest';

import type { DbDriver } from '../db/driver';
import { createTestDb } from '../db/node-driver';
import { getUnit, insertNote, listNotes, listUnits } from '../db/queries';
import { DEFAULT_FIXTURE_CHAPTERS, buildFixtureEpub } from './epub-fixture';
import type { FixtureChapter } from './epub-fixture';
import { importBook } from './import';

// End-to-end on the promise the whole hashing design exists to keep: re-import
// a book and your notes are still attached to the right paragraphs.

let db: DbDriver;

beforeEach(async () => {
  db = await createTestDb();
});

async function importFixture(chapters?: FixtureChapter[]) {
  return importBook(db, {
    format: 'epub',
    fileName: 'pride.epub',
    sourcePath: '/books/pride.epub',
    bytes: await buildFixtureEpub(chapters ? { chapters } : {}),
  });
}

function edited(mutate: (chapters: FixtureChapter[]) => void): FixtureChapter[] {
  const copy = structuredClone(DEFAULT_FIXTURE_CHAPTERS);
  mutate(copy);
  return copy;
}

describe('re-import', () => {
  it('is idempotent for a byte-identical file', async () => {
    const first = await importFixture();
    expect(first.isReimport).toBe(false);

    const second = await importFixture();
    expect(second.isReimport).toBe(true);
    expect(second.book.id).toBe(first.book.id);
    expect(second.unitCount).toBe(first.unitCount);
    expect(second.review).toEqual([]);

    const units = await listUnits(db, second.book.id);
    expect(units).toHaveLength(first.unitCount);
    expect(units.every((u) => u.is_orphaned === 0)).toBe(true);
  });

  it('keeps a note attached when an unrelated paragraph changes', async () => {
    const { book } = await importFixture();
    const units = await listUnits(db, book.id);
    const annotated = units[4]!;

    await insertNote(db, {
      bookId: book.id,
      unitId: annotated.unit_id,
      selectedText: 'earliest',
      body: '這裡的語氣是反諷',
      source: 'selection',
      sourceMessageId: null,
    });

    // Rewrite a paragraph in the *first* chapter, shifting nothing about ch2.
    await importFixture(
      edited((chapters) => {
        chapters[0]!.paragraphs[1] = 'A completely rewritten opening remark.';
      }),
    );

    const note = (await listNotes(db, book.id))[0];
    expect(note?.unit_id).toBe(annotated.unit_id);

    const stillThere = await getUnit(db, annotated.unit_id);
    expect(stillThere?.is_orphaned).toBe(0);
    expect(stillThere?.text).toBe(annotated.text);
  });

  it('carries the anchor forward through a light edit to the annotated paragraph', async () => {
    const { book } = await importFixture();
    const original = (await listUnits(db, book.id))[2]!;

    await insertNote(db, {
      bookId: book.id,
      unitId: original.unit_id,
      selectedText: null,
      body: '第一章第二段',
      source: 'selection',
      sourceMessageId: null,
    });

    await importFixture(
      edited((chapters) => {
        // A typographic fix — the kind of edition difference re-match exists for.
        chapters[0]!.paragraphs[1] =
          `${chapters[0]!.paragraphs[1]!.replace(/\.$/, '')}, indeed.`;
      }),
    );

    const units = await listUnits(db, book.id);
    const successor = units.find(
      (unit) => unit.matched_from_unit_id === original.unit_id,
    );

    expect(successor).toBeDefined();
    // The new text gets its own hash — the old id is provenance, not identity.
    expect(successor?.unit_id).not.toBe(original.unit_id);

    // The original row is never deleted, so the note still resolves.
    const kept = await getUnit(db, original.unit_id);
    expect(kept).not.toBeNull();
    expect((await listNotes(db, book.id))[0]?.unit_id).toBe(original.unit_id);
  });

  it('orphans a deleted paragraph instead of deleting the row', async () => {
    const { book } = await importFixture();
    const units = await listUnits(db, book.id);
    const doomed = units[2]!;

    await importFixture(
      edited((chapters) => {
        chapters[0]!.paragraphs.splice(1, 1);
      }),
    );

    const survivor = await getUnit(db, doomed.unit_id);
    expect(survivor).not.toBeNull();
    expect(survivor?.is_orphaned).toBe(1);

    // Orphans drop out of the reading flow but keep their identity.
    const visible = await listUnits(db, book.id);
    expect(visible.map((u) => u.unit_id)).not.toContain(doomed.unit_id);
  });

  it('reports medium-confidence pairs for review rather than guessing', async () => {
    await importFixture();

    const result = await importFixture(
      edited((chapters) => {
        chapters[1]!.paragraphs[0] =
          'Mr. Bennet was in fact among the very first of the gentlemen who chose to call upon Mr. Bingley that season.';
      }),
    );

    expect(result.review.length).toBeGreaterThan(0);
    const candidate = result.review[0]!;
    expect(candidate.similarity).toBeGreaterThanOrEqual(0.6);
    expect(candidate.similarity).toBeLessThanOrEqual(0.9);
    // Nothing was linked while awaiting the reader's decision.
    expect(candidate.incoming.matchedFromUnitId).toBeUndefined();
  });
});
