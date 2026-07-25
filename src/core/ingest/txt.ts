import type { ParsedBook } from './units';

/**
 * v1 limitation: a .txt file is one chapter. There is no reliable, general way
 * to detect chapter breaks in plain text, and guessing wrong would shift
 * chapter_index — which is part of the unit_id preimage.
 */
export function parseTxt(content: string, fallbackTitle: string): ParsedBook {
  const blocks = content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => ({ kind: 'paragraph' as const, text: paragraph }));

  return {
    title: fallbackTitle,
    author: null,
    chapters: [{ title: null, blocks }],
  };
}
