import { useCallback } from 'react';

import type { MessageRow, UnitRow } from '../../core/db/schema';
import { ChatPanel } from '../coach/ChatPanel';
import { useCoachChat } from '../coach/useCoachChat';
import { NotesPanel } from '../notes/NotesPanel';
import { useNotesVocab } from '../notes/useNotesVocab';
import { ReaderPanel } from './ReaderPanel';
import { useBookUnits } from './useBookUnits';
import { useResumePoint, useSaveProgress } from './useProgress';
import { useReaderNavigation } from './useReaderNavigation';
import { useReaderSelection } from './useReaderSelection';
import type { ReaderSelection } from './useReaderSelection';

interface ReaderViewProps {
  bookId: string;
  onBack: () => void;
}

export function ReaderView({ bookId, onBack }: ReaderViewProps) {
  const { book, units, loading } = useBookUnits(bookId);
  const { resumeUnitId, loaded: progressLoaded } = useResumePoint(bookId);

  // Units are withheld until the saved position is known, so navigation never
  // settles on unit 0 and then jumps.
  const { currentUnitId, currentUnit, setCurrentUnitId } = useReaderNavigation(
    progressLoaded ? units : [],
    resumeUnitId,
  );

  useSaveProgress(bookId, currentUnit, progressLoaded);

  const { selection, clear } = useReaderSelection(!loading);
  const { notes, vocab, addNote, addVocab, removeNote, removeVocab } =
    useNotesVocab(bookId);
  const { messages, streaming, error, explain, ask } = useCoachChat(book);

  const addVocabFromSelection = useCallback(
    (picked: ReaderSelection) => {
      void addVocab(
        {
          unitId: picked.unitId,
          selectedText: picked.text,
          sourceMessageId: null,
          source: 'selection',
        },
        picked.text,
        '',
      );
      clear();
    },
    [addVocab, clear],
  );

  const addNoteFromSelection = useCallback(
    (picked: ReaderSelection) => {
      void addNote(
        {
          unitId: picked.unitId,
          selectedText: picked.text,
          sourceMessageId: null,
          source: 'selection',
        },
        picked.text,
      );
      clear();
    },
    [addNote, clear],
  );

  const saveCoachMessage = useCallback(
    (message: MessageRow) => {
      void addNote(
        {
          unitId: message.unit_id,
          selectedText: null,
          sourceMessageId: message.id,
          source: 'chat',
        },
        message.content,
      );
    },
    [addNote],
  );

  const addManualNote = useCallback(
    (body: string) => {
      void addNote(
        {
          unitId: null,
          selectedText: null,
          sourceMessageId: null,
          source: 'manual',
        },
        body,
      );
    },
    [addNote],
  );

  const addManualVocab = useCallback(
    (term: string, glossZh: string) => {
      void addVocab(
        {
          unitId: null,
          selectedText: null,
          sourceMessageId: null,
          source: 'manual',
        },
        term,
        glossZh,
      );
    },
    [addVocab],
  );

  const onExplain = useCallback(
    (unit: UnitRow) => {
      setCurrentUnitId(unit.unit_id);
      void explain(unit);
    },
    [explain, setCurrentUnitId],
  );

  return (
    <div className="reader-layout">
      <ReaderPanel
        title={book?.title ?? '…'}
        units={units}
        loading={loading}
        currentUnitId={currentUnitId}
        onFocusUnit={setCurrentUnitId}
        onExplain={onExplain}
        selection={selection}
        onAddVocab={addVocabFromSelection}
        onAddNote={addNoteFromSelection}
        onBack={onBack}
      />

      <ChatPanel
        messages={messages}
        streaming={streaming}
        error={error}
        currentUnit={currentUnit}
        onAsk={(unit, question) => void ask(unit, question)}
        onSaveMessage={saveCoachMessage}
      />

      <NotesPanel
        notes={notes}
        vocab={vocab}
        onAddNote={addManualNote}
        onAddVocab={addManualVocab}
        onRemoveNote={(id) => void removeNote(id)}
        onRemoveVocab={(id) => void removeVocab(id)}
      />
    </div>
  );
}
