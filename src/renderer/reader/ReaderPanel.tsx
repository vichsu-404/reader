import { useEffect, useRef } from 'react';

import type { UnitRow } from '../../core/db/schema';
import { ParagraphView } from './ParagraphView';
import { SelectionPopover } from './SelectionPopover';
import type { ReaderSelection } from './useReaderSelection';

interface ReaderPanelProps {
  title: string;
  units: UnitRow[];
  loading: boolean;
  currentUnitId: string | null;
  onFocusUnit: (unitId: string) => void;
  onExplain: (unit: UnitRow) => void;
  selection: ReaderSelection | null;
  onAddVocab: (selection: ReaderSelection) => void;
  onAddNote: (selection: ReaderSelection) => void;
  onBack: () => void;
}

export function ReaderPanel({
  title,
  units,
  loading,
  currentUnitId,
  onFocusUnit,
  onExplain,
  selection,
  onAddVocab,
  onAddNote,
  onBack,
}: ReaderPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentUnitId) return;
    scrollRef.current
      ?.querySelector(`[data-unit-id="${currentUnitId}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [currentUnitId]);

  return (
    <section className="reader">
      <header className="reader-header">
        <button type="button" onClick={onBack} data-testid="back-to-shelf">
          ← 書架
        </button>
        <h2>{title}</h2>
      </header>

      {loading ? <p className="dim">載入中…</p> : null}

      <div className="reader-scroll" ref={scrollRef} data-testid="reader-scroll">
        {units.map((unit) => (
          <ParagraphView
            key={unit.unit_id}
            unit={unit}
            isCurrent={unit.unit_id === currentUnitId}
            onFocus={onFocusUnit}
            onExplain={onExplain}
          />
        ))}
      </div>

      {selection ? (
        <SelectionPopover
          selection={selection}
          onAddVocab={onAddVocab}
          onAddNote={onAddNote}
        />
      ) : null}
    </section>
  );
}
