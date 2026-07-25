import { useCallback } from 'react';

import { getDb } from '../../core/db/client';
import { insertNote, insertVocab } from '../../core/db/queries';
import type { UnitRow } from '../../core/db/schema';
import { ReaderPanel } from './ReaderPanel';
import { useBookUnits } from './useBookUnits';
import { useReaderNavigation } from './useReaderNavigation';
import { useReaderSelection } from './useReaderSelection';
import type { ReaderSelection } from './useReaderSelection';

interface ReaderViewProps {
  bookId: string;
  onBack: () => void;
}

export function ReaderView({ bookId, onBack }: ReaderViewProps) {
  const { book, units, loading } = useBookUnits(bookId);
  const { currentUnitId, setCurrentUnitId } = useReaderNavigation(units, null);
  const { selection, clear } = useReaderSelection(!loading);

  const addVocab = useCallback(
    (picked: ReaderSelection) => {
      void (async () => {
        const db = await getDb();
        await insertVocab(db, {
          term: picked.text,
          glossZh: '',
          reading: null,
          exampleEn: null,
          note: null,
          bookId,
          unitId: picked.unitId,
          source: 'selection',
          sourceMessageId: null,
        });
        clear();
      })();
    },
    [bookId, clear],
  );

  const addNote = useCallback(
    (picked: ReaderSelection) => {
      void (async () => {
        const db = await getDb();
        await insertNote(db, {
          bookId,
          unitId: picked.unitId,
          selectedText: picked.text,
          body: '',
          source: 'selection',
          sourceMessageId: null,
        });
        clear();
      })();
    },
    [bookId, clear],
  );

  const explain = useCallback((unit: UnitRow) => {
    setCurrentUnitId(unit.unit_id);
  }, [setCurrentUnitId]);

  return (
    <ReaderPanel
      title={book?.title ?? '…'}
      units={units}
      loading={loading}
      currentUnitId={currentUnitId}
      onFocusUnit={setCurrentUnitId}
      onExplain={explain}
      selection={selection}
      onAddVocab={addVocab}
      onAddNote={addNote}
      onBack={onBack}
    />
  );
}
