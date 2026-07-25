import { useEffect, useState } from 'react';

import { getDb } from '../../core/db/client';
import { getProgress, saveProgress } from '../../core/db/queries';
import type { UnitRow } from '../../core/db/schema';

// Position is persisted by unit_id, so resume survives a re-import that shifts
// every paragraph's index (DECISIONS 001). Reading and writing are separate
// hooks because the current unit is derived from the resume point — combining
// them would make the dependency circular.

export function useResumePoint(bookId: string) {
  const [resumeUnitId, setResumeUnitId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const db = await getDb();
      const progress = await getProgress(db, bookId);
      if (cancelled) return;
      setResumeUnitId(progress?.unit_id ?? null);
      setLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [bookId]);

  return { resumeUnitId, loaded };
}

export function useSaveProgress(
  bookId: string,
  currentUnit: UnitRow | undefined,
  enabled: boolean,
) {
  const unitId = currentUnit?.unit_id;
  const seq = currentUnit?.seq;

  useEffect(() => {
    // Waiting on `enabled` keeps the first render from overwriting the saved
    // position with unit 0 before it has been read back.
    if (!enabled || unitId === undefined || seq === undefined) return;

    void (async () => {
      const db = await getDb();
      await saveProgress(db, bookId, unitId, seq);
    })();
  }, [bookId, enabled, unitId, seq]);
}
