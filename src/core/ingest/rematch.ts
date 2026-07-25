import type { NewUnit } from '../db/queries';
import type { UnitRow } from '../db/schema';

// Re-import safety net (docs/DECISIONS.md 001). When an incoming paragraph's
// hash is not found, look nearby for the paragraph it probably used to be.

export const AUTO_ACCEPT = 0.9;
export const NEEDS_REVIEW = 0.6;
export const SEARCH_RADIUS = 3;

export type MatchDecision = 'new' | 'auto' | 'review';

export interface RematchCandidate {
  incoming: NewUnit;
  existing: UnitRow;
  similarity: number;
}

export interface RematchResult {
  /** Units to write, with `matchedFromUnitId` set on carried-forward anchors. */
  units: NewUnit[];
  /** Medium-confidence pairs for the reader to confirm or reject. */
  review: RematchCandidate[];
  /** Existing units nothing matched. Flagged, never deleted. */
  orphanedUnitIds: string[];
}

function wordBag(text: string): Map<string, number> {
  const bag = new Map<string, number>();
  // Punctuation is dropped on purpose: curly vs straight quotes and en vs em
  // dashes are exactly the edition differences this pass exists to absorb.
  for (const word of text.toLowerCase().split(/[^\p{L}\p{N}']+/u)) {
    if (word.length === 0) continue;
    bag.set(word, (bag.get(word) ?? 0) + 1);
  }
  return bag;
}

/** Bag-of-words cosine similarity, 0–1. */
export function similarity(a: string, b: string): number {
  const bagA = wordBag(a);
  const bagB = wordBag(b);
  if (bagA.size === 0 || bagB.size === 0) return 0;

  let dot = 0;
  for (const [word, countA] of bagA) {
    dot += countA * (bagB.get(word) ?? 0);
  }
  if (dot === 0) return 0;

  const norm = (bag: Map<string, number>) =>
    Math.sqrt([...bag.values()].reduce((sum, n) => sum + n * n, 0));

  // Clamped: floating-point error puts identical vectors just above 1.
  return Math.min(1, dot / (norm(bagA) * norm(bagB)));
}

export function classify(score: number): MatchDecision {
  if (score > AUTO_ACCEPT) return 'auto';
  if (score >= NEEDS_REVIEW) return 'review';
  return 'new';
}

/**
 * Pure. Takes the freshly parsed units and everything currently stored for the
 * book, and decides what to carry forward.
 */
export function rematchUnits(
  incoming: readonly NewUnit[],
  existing: readonly UnitRow[],
): RematchResult {
  const existingById = new Map(existing.map((unit) => [unit.unit_id, unit]));
  const claimed = new Set<string>();
  const units: NewUnit[] = [];
  const review: RematchCandidate[] = [];

  for (const unit of incoming) {
    // Unchanged text hashes identically — the common case, and free.
    if (existingById.has(unit.unitId)) {
      claimed.add(unit.unitId);
      units.push(unit);
      continue;
    }

    let best: UnitRow | null = null;
    let bestScore = 0;

    for (const candidate of existing) {
      if (claimed.has(candidate.unit_id)) continue;
      if (Math.abs(candidate.seq - unit.seq) > SEARCH_RADIUS) continue;

      const score = similarity(unit.text, candidate.text);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    const decision = best ? classify(bestScore) : 'new';

    if (decision === 'auto' && best) {
      claimed.add(best.unit_id);
      // The new text keeps its own hash; the old id is recorded as its
      // provenance. Reusing the old unit_id for changed text would silently
      // reattach notes to words that are no longer there.
      units.push({ ...unit, matchedFromUnitId: best.unit_id });
    } else if (decision === 'review' && best) {
      review.push({ incoming: unit, existing: best, similarity: bestScore });
      units.push(unit);
    } else {
      units.push(unit);
    }
  }

  const orphanedUnitIds = existing
    .filter((unit) => !claimed.has(unit.unit_id) && unit.is_orphaned === 0)
    .map((unit) => unit.unit_id);

  return { units, review, orphanedUnitIds };
}

/** Applies the reader's decision on a medium-confidence pair. */
export function acceptCandidate(
  units: readonly NewUnit[],
  candidate: RematchCandidate,
): NewUnit[] {
  return units.map((unit) =>
    unit.unitId === candidate.incoming.unitId
      ? { ...unit, matchedFromUnitId: candidate.existing.unit_id }
      : unit,
  );
}
