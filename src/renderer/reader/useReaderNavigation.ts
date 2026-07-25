import { useCallback, useEffect } from 'react';
import { useState } from 'react';

import type { UnitRow } from '../../core/db/schema';

/**
 * Position is tracked by unit_id, never by array index — an index shifts
 * whenever a book is re-imported. The current unit is derived rather than
 * synced in an effect, so a resumed unit_id that is not (yet) in `units`
 * falls back cleanly instead of racing the load.
 */
export function useReaderNavigation(
  units: UnitRow[],
  initialUnitId: string | null,
) {
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  const isPresent = (unitId: string | null) =>
    unitId !== null && units.some((unit) => unit.unit_id === unitId);

  const currentUnitId = isPresent(selectedUnitId)
    ? selectedUnitId
    : (isPresent(initialUnitId) ? initialUnitId : units[0]?.unit_id) ?? null;

  const index = units.findIndex((unit) => unit.unit_id === currentUnitId);
  const currentUnit = index >= 0 ? units[index] : undefined;

  const move = useCallback(
    (delta: number) => {
      if (index < 0) return;
      const next = Math.min(Math.max(index + delta, 0), units.length - 1);
      const target = units[next];
      if (target) setSelectedUnitId(target.unit_id);
    },
    [index, units],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;

      if (event.key === 'ArrowDown' || event.key === 'j') move(1);
      else if (event.key === 'ArrowUp' || event.key === 'k') move(-1);
      else return;
      event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [move]);

  return {
    currentUnitId,
    currentUnit,
    setCurrentUnitId: setSelectedUnitId,
    next: useCallback(() => move(1), [move]),
    previous: useCallback(() => move(-1), [move]),
    hasNext: index >= 0 && index < units.length - 1,
    hasPrevious: index > 0,
  };
}
