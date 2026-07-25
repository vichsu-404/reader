import { useState } from 'react';

interface ManualEntryFormProps {
  onAddNote: (body: string) => void;
  onAddVocab: (term: string, glossZh: string) => void;
}

/**
 * The third capture path. Entries made here carry no unit_id — they belong to
 * the book, not to a paragraph.
 */
export function ManualEntryForm({
  onAddNote,
  onAddVocab,
}: ManualEntryFormProps) {
  const [kind, setKind] = useState<'note' | 'vocab'>('vocab');
  const [term, setTerm] = useState('');
  const [gloss, setGloss] = useState('');

  return (
    <form
      className="manual-entry"
      data-testid="manual-entry"
      onSubmit={(event) => {
        event.preventDefault();
        if (kind === 'note') {
          if (gloss.trim().length === 0) return;
          onAddNote(gloss.trim());
        } else {
          if (term.trim().length === 0 || gloss.trim().length === 0) return;
          onAddVocab(term.trim(), gloss.trim());
        }
        setTerm('');
        setGloss('');
      }}
    >
      <div className="manual-kind">
        <label>
          <input
            type="radio"
            name="manual-kind"
            checked={kind === 'vocab'}
            onChange={() => setKind('vocab')}
            data-testid="manual-kind-vocab"
          />
          單字
        </label>
        <label>
          <input
            type="radio"
            name="manual-kind"
            checked={kind === 'note'}
            onChange={() => setKind('note')}
            data-testid="manual-kind-note"
          />
          筆記
        </label>
      </div>

      {kind === 'vocab' ? (
        <input
          type="text"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="英文單字"
          data-testid="manual-term"
        />
      ) : null}

      <input
        type="text"
        value={gloss}
        onChange={(event) => setGloss(event.target.value)}
        placeholder={kind === 'vocab' ? '中文解釋' : '筆記內容'}
        data-testid="manual-body"
      />

      <button type="submit" data-testid="manual-submit">
        新增
      </button>
    </form>
  );
}
