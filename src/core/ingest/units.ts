import type { NewChapter, NewUnit } from '../db/queries';
import type { UnitKind } from '../db/schema';
import { computeUnitId } from './hash';
import { normalizeText } from './normalize';

/** A block of text as extracted from a source file, before normalization. */
export interface ParsedBlock {
  kind: UnitKind;
  text: string;
}

export interface ParsedChapter {
  title: string | null;
  blocks: ParsedBlock[];
}

export interface ParsedBook {
  title: string;
  author: string | null;
  chapters: ParsedChapter[];
}

export interface AssembledBook {
  chapters: NewChapter[];
  units: NewUnit[];
}

/**
 * Turns parsed blocks into hashed units with a book-wide `seq`. Blocks that
 * normalize to nothing are dropped; `seq` counts only surviving units, so it
 * stays dense.
 */
export async function assembleUnits(
  bookId: string,
  book: ParsedBook,
): Promise<AssembledBook> {
  const chapters: NewChapter[] = [];
  const units: NewUnit[] = [];
  let seq = 0;

  for (const [chapterIndex, chapter] of book.chapters.entries()) {
    chapters.push({ chapterIndex, title: chapter.title });

    for (const block of chapter.blocks) {
      const text = normalizeText(block.text);
      if (text.length === 0) continue;

      units.push({
        unitId: await computeUnitId(bookId, chapterIndex, text),
        chapterIndex,
        seq,
        kind: block.kind,
        text,
      });
      seq += 1;
    }
  }

  return { chapters, units };
}
