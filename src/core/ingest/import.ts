import type { DbDriver } from '../db/driver';
import {
  getBook,
  insertBook,
  insertChapters,
  insertUnits,
  listUnits,
  markUnitsOrphaned,
} from '../db/queries';
import type { BookFormat, BookRow } from '../db/schema';
import { parseEpub } from './epub';
import { computeBookId } from './hash';
import { NORMALIZE_VERSION } from './normalize';
import { acceptCandidate, rematchUnits } from './rematch';
import type { RematchCandidate } from './rematch';
import { parseTxt } from './txt';
import { assembleUnits } from './units';

/**
 * Takes bytes rather than a path so it stays free of IPC and testable under
 * Vitest. The renderer reads the file through src/main/fs.ts and calls this.
 */
export interface ImportInput {
  format: BookFormat;
  fileName: string;
  sourcePath: string | null;
  bytes?: Uint8Array;
  text?: string;
}

export interface ImportResult {
  book: BookRow;
  unitCount: number;
  isReimport: boolean;
  /** Medium-confidence re-match pairs awaiting the reader's decision. */
  review: RematchCandidate[];
}

export async function importBook(
  db: DbDriver,
  input: ImportInput,
  acceptedCandidates: readonly RematchCandidate[] = [],
): Promise<ImportResult> {
  const fallbackTitle = input.fileName
    .replace(/\.(epub|txt)$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();

  const parsed =
    input.format === 'epub'
      ? await parseEpub(requireBytes(input), fallbackTitle)
      : parseTxt(requireText(input), fallbackTitle);

  const bookId = await computeBookId(parsed.title, parsed.author);
  const existingBook = await getBook(db, bookId);
  const { chapters, units } = await assembleUnits(bookId, parsed);

  const existingUnits = existingBook ? await listUnits(db, bookId) : [];
  const matched = rematchUnits(units, existingUnits);

  let finalUnits = matched.units;
  for (const candidate of acceptedCandidates) {
    finalUnits = acceptCandidate(finalUnits, candidate);
  }

  await insertBook(db, {
    id: bookId,
    title: parsed.title,
    author: parsed.author,
    format: input.format,
    sourcePath: input.sourcePath,
    normalizeVersion: NORMALIZE_VERSION,
    unitCount: finalUnits.length,
  });
  await insertChapters(db, bookId, chapters);
  await insertUnits(db, bookId, finalUnits);
  // Never deleted: an orphaned unit still owns its notes, and a later
  // re-import may revive it.
  await markUnitsOrphaned(db, matched.orphanedUnitIds);

  const book = await getBook(db, bookId);
  if (!book) throw new Error('book insert did not round-trip');

  return {
    book,
    unitCount: finalUnits.length,
    isReimport: existingBook !== null,
    review: matched.review,
  };
}

function requireBytes(input: ImportInput): Uint8Array {
  if (!input.bytes) throw new Error('EPUB import requires bytes');
  return input.bytes;
}

function requireText(input: ImportInput): string {
  if (input.text === undefined) throw new Error('TXT import requires text');
  return input.text;
}
