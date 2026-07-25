import type { DbDriver } from '../db/driver';
import { getUnit, listUnitsBefore, updateRollingSummary } from '../db/queries';
import type { SessionRow } from '../db/schema';
import type { CoachProvider } from './provider';

/** Regenerate once the reader is this far past the summary's high-water mark. */
export const SUMMARY_INTERVAL = 10;
const SUMMARY_WINDOW = 20;

export function needsSummary(session: SessionRow, currentSeq: number): boolean {
  if (session.summary_upto_seq === null) return currentSeq >= SUMMARY_INTERVAL;
  return currentSeq - session.summary_upto_seq >= SUMMARY_INTERVAL;
}

/**
 * Regenerates the rolling summary if the reader has moved far enough.
 * Deliberately fire-and-forget from the caller's perspective: a coach reply
 * must never wait on this, and a failed summary is recoverable — the next
 * advance simply tries again.
 */
export async function maybeRefreshSummary(
  db: DbDriver,
  provider: CoachProvider,
  session: SessionRow,
  bookId: string,
  currentUnitId: string,
): Promise<string | null> {
  const currentUnit = await getUnit(db, currentUnitId);
  if (!currentUnit) return null;
  if (!needsSummary(session, currentUnit.seq)) return session.rolling_summary;

  const window = await listUnitsBefore(
    db,
    bookId,
    currentUnit.seq + 1,
    SUMMARY_WINDOW,
  );
  if (window.length === 0) return session.rolling_summary;

  const summary = await provider.summarize(
    window.map((unit) => unit.text),
    session.rolling_summary,
  );

  await updateRollingSummary(
    db,
    session.id,
    summary,
    currentUnit.unit_id,
    currentUnit.seq,
  );
  return summary;
}
