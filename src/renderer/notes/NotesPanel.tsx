import type { NoteRow, VocabRow } from '../../core/db/schema';
import { ManualEntryForm } from './ManualEntryForm';
import { VocabPanel } from './VocabPanel';

interface NotesPanelProps {
  notes: NoteRow[];
  vocab: VocabRow[];
  onAddNote: (body: string) => void;
  onAddVocab: (term: string, glossZh: string) => void;
  onRemoveNote: (noteId: string) => void;
  onRemoveVocab: (vocabId: string) => void;
}

export function NotesPanel({
  notes,
  vocab,
  onAddNote,
  onAddVocab,
  onRemoveNote,
  onRemoveVocab,
}: NotesPanelProps) {
  return (
    <aside className="notes" data-testid="notes-panel">
      <ManualEntryForm onAddNote={onAddNote} onAddVocab={onAddVocab} />

      <VocabPanel vocab={vocab} onRemove={onRemoveVocab} />

      <section>
        <h4>筆記 ({notes.length})</h4>
        <ul className="entry-list">
          {notes.map((note) => (
            <li
              key={note.id}
              data-testid="note-entry"
              data-source={note.source}
              data-unit-id={note.unit_id ?? ''}
            >
              <div className="entry-body">
                {note.selected_text ? (
                  <q className="dim">{note.selected_text}</q>
                ) : null}
                <span>{note.body}</span>
              </div>
              <button type="button" onClick={() => onRemoveNote(note.id)}>
                刪除
              </button>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
