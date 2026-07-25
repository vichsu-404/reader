import type { VocabRow } from '../../core/db/schema';

interface VocabPanelProps {
  vocab: VocabRow[];
  onRemove: (vocabId: string) => void;
}

export function VocabPanel({ vocab, onRemove }: VocabPanelProps) {
  return (
    <section data-testid="vocab-panel">
      <h4>單字 ({vocab.length})</h4>
      <ul className="entry-list">
        {vocab.map((entry) => (
          <li
            key={entry.id}
            data-testid="vocab-entry"
            data-source={entry.source}
            data-unit-id={entry.unit_id ?? ''}
          >
            <div className="entry-body">
              <strong>{entry.term}</strong>
              {entry.gloss_zh ? <span>{entry.gloss_zh}</span> : null}
            </div>
            <button type="button" onClick={() => onRemove(entry.id)}>
              刪除
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
