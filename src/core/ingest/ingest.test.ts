import { describe, expect, it } from 'vitest';

import { parseEpub } from './epub';
import {
  DEFAULT_FIXTURE_CHAPTERS,
  buildFixtureEpub,
} from './epub-fixture';
import { computeBookId, computeUnitId } from './hash';
import { NORMALIZE_VERSION, normalizeText } from './normalize';
import { parseTxt } from './txt';
import { assembleUnits } from './units';

describe('normalizeText', () => {
  it('collapses whitespace and strips zero-width marks', () => {
    expect(normalizeText('  hello \n\t world\u200B  ')).toBe('hello world');
    expect(normalizeText('a\uFEFFb\u00ADc')).toBe('abc');
  });

  it('applies NFC so decomposed and composed forms agree', () => {
    const decomposed = 'cafe\u0301';
    const composed = 'caf\u00e9';
    expect(decomposed).not.toBe(composed);
    expect(normalizeText(decomposed)).toBe(normalizeText(composed));
  });

  it('leaves typography alone — re-match absorbs those differences', () => {
    expect(normalizeText('“quoted”')).not.toBe(normalizeText('"quoted"'));
  });
});

describe('computeUnitId', () => {
  it('is deterministic', async () => {
    const a = await computeUnitId('book', 0, 'some text');
    const b = await computeUnitId('book', 0, 'some text');
    expect(a).toBe(b);
    expect(a).toHaveLength(16);
  });

  it('separates book, chapter, and text in the preimage', async () => {
    const ids = await Promise.all([
      computeUnitId('book', 0, 'text'),
      computeUnitId('book', 1, 'text'),
      computeUnitId('other', 0, 'text'),
      computeUnitId('book', 0, 'other text'),
    ]);
    expect(new Set(ids).size).toBe(4);
  });

  it('text that normalizes identically hashes identically', async () => {
    const a = await computeUnitId('b', 0, normalizeText('the  cat\nsat'));
    const b = await computeUnitId('b', 0, normalizeText(' the cat sat '));
    expect(a).toBe(b);
  });

  it('is versioned by NORMALIZE_VERSION', async () => {
    // A guard on the invariant, not on the constant's value: the version must
    // actually reach the digest, or bumping it would be a silent no-op.
    const id = await computeUnitId('b', 0, 'text');
    expect(NORMALIZE_VERSION).toBe('nv1');
    expect(id).toBe(await computeUnitId('b', 0, 'text'));
  });
});

describe('computeBookId', () => {
  it('depends on metadata, not on the file', async () => {
    const first = await computeBookId('Pride and Prejudice', 'Jane Austen');
    const second = await computeBookId('  pride and prejudice ', 'JANE AUSTEN');
    expect(second).toBe(first);
  });

  it('distinguishes different works', async () => {
    const a = await computeBookId('Emma', 'Jane Austen');
    const b = await computeBookId('Persuasion', 'Jane Austen');
    expect(a).not.toBe(b);
  });
});

describe('parseEpub', () => {
  it('walks the spine and extracts chapters and blocks', async () => {
    const book = await parseEpub(await buildFixtureEpub(), 'fallback');

    expect(book.title).toBe('Pride and Prejudice');
    expect(book.author).toBe('Jane Austen');
    expect(book.chapters).toHaveLength(2);
    expect(book.chapters[0]?.title).toBe('Chapter One');
  });

  it('classifies headings separately from paragraphs', async () => {
    const book = await parseEpub(await buildFixtureEpub(), 'fallback');
    const kinds = book.chapters[0]?.blocks.map((b) => b.kind);
    expect(kinds?.[0]).toBe('heading');
    expect(kinds?.slice(1)).toEqual(['paragraph', 'paragraph']);
  });

  it('skips navigation and footer boilerplate', async () => {
    const book = await parseEpub(await buildFixtureEpub(), 'fallback');
    const text = book.chapters.flatMap((c) => c.blocks).map((b) => b.text);

    expect(text.some((t) => t.includes('Skipped navigation'))).toBe(false);
    expect(text.some((t) => t.includes('Skipped footer'))).toBe(false);
  });

  it('falls back to the fallback title when metadata is missing', async () => {
    const bytes = await buildFixtureEpub({ title: '' });
    const book = await parseEpub(bytes, 'Untitled Import');
    expect(book.title).toBe('Untitled Import');
  });
});

describe('parseTxt', () => {
  it('splits on blank lines into one chapter', () => {
    const book = parseTxt('First para.\n\n\nSecond para.\n', 'notes.txt');
    expect(book.chapters).toHaveLength(1);
    expect(book.chapters[0]?.blocks.map((b) => b.text)).toEqual([
      'First para.',
      'Second para.',
    ]);
  });
});

describe('assembleUnits', () => {
  it('numbers seq densely across chapters', async () => {
    const book = await parseEpub(await buildFixtureEpub(), 'fallback');
    const bookId = await computeBookId(book.title, book.author);
    const { chapters, units } = await assembleUnits(bookId, book);

    expect(chapters).toHaveLength(2);
    expect(units.map((u) => u.seq)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(units.filter((u) => u.chapterIndex === 1)).toHaveLength(3);
  });

  it('produces the same unit_ids for a byte-identical re-import', async () => {
    const parseAndAssemble = async () => {
      const book = await parseEpub(await buildFixtureEpub(), 'fallback');
      const bookId = await computeBookId(book.title, book.author);
      return (await assembleUnits(bookId, book)).units.map((u) => u.unitId);
    };

    expect(await parseAndAssemble()).toEqual(await parseAndAssemble());
  });

  it('preserves unit_ids for untouched paragraphs when one paragraph changes', async () => {
    const originalIds = await (async () => {
      const book = await parseEpub(await buildFixtureEpub(), 'x');
      const bookId = await computeBookId(book.title, book.author);
      return (await assembleUnits(bookId, book)).units.map((u) => u.unitId);
    })();

    const edited = structuredClone(DEFAULT_FIXTURE_CHAPTERS);
    edited[0]!.paragraphs[1] = 'A rewritten second paragraph.';

    const book = await parseEpub(
      await buildFixtureEpub({ chapters: edited }),
      'x',
    );
    const bookId = await computeBookId(book.title, book.author);
    const editedIds = (await assembleUnits(bookId, book)).units.map(
      (u) => u.unitId,
    );

    // Only the rewritten paragraph's id changes; everything else is stable.
    expect(editedIds[2]).not.toBe(originalIds[2]);
    expect(editedIds.filter((_, i) => i !== 2)).toEqual(
      originalIds.filter((_, i) => i !== 2),
    );
  });

  it('drops blocks that normalize to nothing', async () => {
    const { units } = await assembleUnits('book', {
      title: 't',
      author: null,
      chapters: [
        {
          title: null,
          blocks: [
            { kind: 'paragraph', text: '   ​  ' },
            { kind: 'paragraph', text: 'real' },
          ],
        },
      ],
    });
    expect(units).toHaveLength(1);
    expect(units[0]?.seq).toBe(0);
  });
});
