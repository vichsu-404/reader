import { describe, expect, it } from 'vitest';

import type { NewUnit } from '../db/queries';
import type { UnitRow } from '../db/schema';
import {
  acceptCandidate,
  classify,
  rematchUnits,
  similarity,
} from './rematch';

function stored(seq: number, unitId: string, text: string): UnitRow {
  return {
    unit_id: unitId,
    book_id: 'book',
    chapter_index: 0,
    seq,
    kind: 'paragraph',
    text,
    char_count: text.length,
    is_orphaned: 0,
    matched_from_unit_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function incoming(seq: number, unitId: string, text: string): NewUnit {
  return { unitId, chapterIndex: 0, seq, kind: 'paragraph', text };
}

describe('similarity', () => {
  it('is 1 for identical text and 0 for disjoint text', () => {
    expect(similarity('the cat sat', 'the cat sat')).toBe(1);
    expect(similarity('the cat sat', 'quantum entanglement physics')).toBe(0);
  });

  it('ignores punctuation and case, which differ between editions', () => {
    expect(similarity('“Hello,” he said.', '"hello" he said')).toBe(1);
  });

  it('scores a lightly edited sentence high and a rewrite low', () => {
    const original =
      'It is a truth universally acknowledged that a single man in possession of a good fortune must be in want of a wife';
    expect(
      similarity(original, `${original} indeed`),
    ).toBeGreaterThan(0.9);
    expect(
      similarity(original, 'Mr Bennet was among the earliest of those'),
    ).toBeLessThan(0.6);
  });

  it('handles empty input without dividing by zero', () => {
    expect(similarity('', 'text')).toBe(0);
  });
});

describe('classify', () => {
  it('splits at 0.9 and 0.6', () => {
    expect(classify(0.95)).toBe('auto');
    expect(classify(0.9)).toBe('review');
    expect(classify(0.6)).toBe('review');
    expect(classify(0.59)).toBe('new');
  });
});

describe('rematchUnits', () => {
  const original = [
    stored(0, 'aaaa', 'Chapter One'),
    stored(1, 'bbbb', 'It is a truth universally acknowledged that a single man'),
    stored(2, 'cccc', 'However little known the feelings or views of such a man'),
  ];

  it('carries unchanged units through untouched', () => {
    const result = rematchUnits(
      [
        incoming(0, 'aaaa', 'Chapter One'),
        incoming(1, 'bbbb', 'It is a truth universally acknowledged that a single man'),
        incoming(2, 'cccc', 'However little known the feelings or views of such a man'),
      ],
      original,
    );

    expect(result.review).toEqual([]);
    expect(result.orphanedUnitIds).toEqual([]);
    expect(result.units.every((u) => u.matchedFromUnitId === undefined)).toBe(
      true,
    );
  });

  it('auto-accepts a high-similarity edit and records its provenance', () => {
    const result = rematchUnits(
      [
        incoming(0, 'aaaa', 'Chapter One'),
        incoming(1, 'bbb2', 'It is a truth universally acknowledged that a single man,'),
        incoming(2, 'cccc', 'However little known the feelings or views of such a man'),
      ],
      original,
    );

    const edited = result.units.find((u) => u.unitId === 'bbb2');
    expect(edited?.matchedFromUnitId).toBe('bbbb');
    expect(result.review).toEqual([]);
    // The anchor is carried forward, so the old unit is not orphaned.
    expect(result.orphanedUnitIds).toEqual([]);
  });

  it('never reuses the old unit_id for changed text', () => {
    const result = rematchUnits(
      [incoming(1, 'bbb2', 'It is a truth universally acknowledged that a single man,')],
      original,
    );
    expect(result.units[0]?.unitId).toBe('bbb2');
  });

  it('asks the reader about medium-confidence pairs', () => {
    const result = rematchUnits(
      [
        incoming(
          1,
          'bbb3',
          'It is a truth acknowledged that a single gentleman of large estate',
        ),
      ],
      original,
    );

    expect(result.review).toHaveLength(1);
    expect(result.review[0]?.existing.unit_id).toBe('bbbb');
    expect(result.review[0]?.similarity).toBeGreaterThanOrEqual(0.6);
    expect(result.review[0]?.similarity).toBeLessThanOrEqual(0.9);
    // Not silently linked while awaiting the decision.
    expect(result.units[0]?.matchedFromUnitId).toBeUndefined();
  });

  it('treats an unrelated paragraph as new', () => {
    const result = rematchUnits(
      [incoming(1, 'zzzz', 'Quantum entanglement in superconducting circuits')],
      original,
    );
    expect(result.units[0]?.matchedFromUnitId).toBeUndefined();
    expect(result.review).toEqual([]);
  });

  it('will not match outside the seq window', () => {
    const far = [stored(50, 'ffff', 'It is a truth universally acknowledged that a single man')];
    const result = rematchUnits(
      [incoming(1, 'bbb2', 'It is a truth universally acknowledged that a single man,')],
      far,
    );
    expect(result.units[0]?.matchedFromUnitId).toBeUndefined();
    expect(result.orphanedUnitIds).toEqual(['ffff']);
  });

  it('does not let two incoming units claim the same anchor', () => {
    const result = rematchUnits(
      [
        incoming(1, 'x1', 'It is a truth universally acknowledged that a single man,'),
        incoming(2, 'x2', 'It is a truth universally acknowledged that a single man.'),
      ],
      original,
    );

    const claimed = result.units
      .map((u) => u.matchedFromUnitId)
      .filter((id): id is string => typeof id === 'string');
    expect(new Set(claimed).size).toBe(claimed.length);
  });

  it('reports dropped paragraphs as orphaned rather than deleting them', () => {
    const result = rematchUnits([incoming(0, 'aaaa', 'Chapter One')], original);
    expect(result.orphanedUnitIds.sort()).toEqual(['bbbb', 'cccc']);
  });

  it('does not re-report units already flagged orphaned', () => {
    const withOrphan = [...original, { ...stored(3, 'dddd', 'gone'), is_orphaned: 1 }];
    const result = rematchUnits([incoming(0, 'aaaa', 'Chapter One')], withOrphan);
    expect(result.orphanedUnitIds).not.toContain('dddd');
  });
});

describe('acceptCandidate', () => {
  it('links only the reviewed unit', () => {
    const units = [incoming(0, 'a', 'one'), incoming(1, 'b', 'two')];
    const linked = acceptCandidate(units, {
      incoming: units[1]!,
      existing: stored(1, 'old-b', 'two-ish'),
      similarity: 0.75,
    });

    expect(linked[0]?.matchedFromUnitId).toBeUndefined();
    expect(linked[1]?.matchedFromUnitId).toBe('old-b');
  });
});
