import { useCallback, useEffect, useState } from 'react';

import { getDb } from '../../core/db/client';
import {
  deleteNote,
  deleteVocab,
  insertNote,
  insertVocab,
  listNotes,
  listVocab,
} from '../../core/db/queries';
import type { CaptureSource, NoteRow, VocabRow } from '../../core/db/schema';

export interface CaptureTarget {
  unitId: string | null;
  selectedText: string | null;
  sourceMessageId: string | null;
  source: CaptureSource;
}

export function useNotesVocab(bookId: string | null) {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [vocab, setVocab] = useState<VocabRow[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!bookId) return;
    let cancelled = false;

    void (async () => {
      const db = await getDb();
      const [loadedNotes, loadedVocab] = await Promise.all([
        listNotes(db, bookId),
        listVocab(db, bookId),
      ]);
      if (cancelled) return;
      setNotes(loadedNotes);
      setVocab(loadedVocab);
    })();

    return () => {
      cancelled = true;
    };
  }, [bookId, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const addNote = useCallback(
    async (target: CaptureTarget, body: string) => {
      const db = await getDb();
      await insertNote(db, {
        bookId,
        unitId: target.unitId,
        selectedText: target.selectedText,
        body,
        source: target.source,
        sourceMessageId: target.sourceMessageId,
      });
      reload();
    },
    [bookId, reload],
  );

  const addVocab = useCallback(
    async (target: CaptureTarget, term: string, glossZh: string) => {
      const db = await getDb();
      await insertVocab(db, {
        term,
        glossZh,
        reading: null,
        exampleEn: target.selectedText,
        note: null,
        bookId,
        unitId: target.unitId,
        source: target.source,
        sourceMessageId: target.sourceMessageId,
      });
      reload();
    },
    [bookId, reload],
  );

  const removeNote = useCallback(
    async (noteId: string) => {
      const db = await getDb();
      await deleteNote(db, noteId);
      reload();
    },
    [reload],
  );

  const removeVocab = useCallback(
    async (vocabId: string) => {
      const db = await getDb();
      await deleteVocab(db, vocabId);
      reload();
    },
    [reload],
  );

  return { notes, vocab, addNote, addVocab, removeNote, removeVocab };
}
