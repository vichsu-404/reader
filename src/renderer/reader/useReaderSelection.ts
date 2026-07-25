import { useCallback, useEffect, useState } from 'react';

export interface ReaderSelection {
  text: string;
  unitId: string | null;
}

function resolveUnitId(node: Node | null): string | null {
  const element =
    node?.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : (node?.parentElement ?? null);
  return element?.closest('[data-unit-id]')?.getAttribute('data-unit-id') ?? null;
}

/**
 * Watches text selection inside the reader and resolves the paragraph it landed
 * in back to a unit_id, so a captured note anchors to content rather than to a
 * scroll position.
 */
export function useReaderSelection(enabled: boolean) {
  const [selection, setSelection] = useState<ReaderSelection | null>(null);

  const clear = useCallback(() => setSelection(null), []);

  useEffect(() => {
    if (!enabled) return;

    const onSelectionChange = () => {
      const active = document.getSelection();
      const text = active?.toString().trim() ?? '';
      if (!active || text.length === 0) {
        setSelection(null);
        return;
      }

      const unitId = resolveUnitId(active.anchorNode);
      if (!unitId) {
        setSelection(null);
        return;
      }
      setSelection({ text, unitId });
    };

    document.addEventListener('selectionchange', onSelectionChange);
    return () =>
      document.removeEventListener('selectionchange', onSelectionChange);
  }, [enabled]);

  return { selection, clear };
}
