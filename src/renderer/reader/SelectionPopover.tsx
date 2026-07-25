import type { ReaderSelection } from './useReaderSelection';

interface SelectionPopoverProps {
  selection: ReaderSelection;
  onAddVocab: (selection: ReaderSelection) => void;
  onAddNote: (selection: ReaderSelection) => void;
}

export function SelectionPopover({
  selection,
  onAddVocab,
  onAddNote,
}: SelectionPopoverProps) {
  return (
    <div className="selection-popover" data-testid="selection-popover">
      <span className="selected-text">「{selection.text}」</span>
      <button
        type="button"
        onClick={() => onAddVocab(selection)}
        data-testid="add-vocab"
      >
        加入單字
      </button>
      <button
        type="button"
        onClick={() => onAddNote(selection)}
        data-testid="add-note"
      >
        加入筆記
      </button>
    </div>
  );
}
