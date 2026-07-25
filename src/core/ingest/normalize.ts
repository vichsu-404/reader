/**
 * Part of the unit_id hash preimage (docs/DECISIONS.md 001).
 *
 * BUMP THIS whenever normalizeText's output could change for any input.
 * Changing normalization without bumping it silently detaches every existing
 * note, bookmark, and vocab entry from the paragraph it was attached to.
 */
export const NORMALIZE_VERSION = 'nv1';

// Zero-width space/non-joiner/joiner, BOM, soft hyphen.
const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u00AD]/g;
const WHITESPACE = /\s+/g;

/**
 * Canonical text for a unit: NFC, no zero-width marks, whitespace collapsed.
 * Used both for the hash preimage and as the stored/displayed text, so it must
 * stay lossless enough to read. Typographic differences between editions
 * (curly vs straight quotes, en vs em dashes) are deliberately left alone —
 * the re-match pass in rematch.ts absorbs those instead.
 */
export function normalizeText(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(ZERO_WIDTH, '')
    .replace(WHITESPACE, ' ')
    .trim();
}
