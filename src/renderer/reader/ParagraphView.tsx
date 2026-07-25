import type { UnitRow } from '../../core/db/schema';

interface ParagraphViewProps {
  unit: UnitRow;
  isCurrent: boolean;
  onFocus: (unitId: string) => void;
  onExplain: (unit: UnitRow) => void;
}

const TAG_BY_KIND = {
  heading: 'h2',
  quote: 'blockquote',
  list_item: 'li',
  paragraph: 'p',
} as const;

/**
 * One DOM node per unit, carrying data-unit-id. Selection resolution, progress,
 * and every e2e assertion depend on that attribute being here.
 */
export function ParagraphView({
  unit,
  isCurrent,
  onFocus,
  onExplain,
}: ParagraphViewProps) {
  const Tag = TAG_BY_KIND[unit.kind];

  return (
    <div
      className={`unit${isCurrent ? ' current' : ''}`}
      data-unit-id={unit.unit_id}
      data-seq={unit.seq}
      onClick={() => onFocus(unit.unit_id)}
    >
      <Tag className="unit-text">{unit.text}</Tag>
      <button
        type="button"
        className="explain"
        data-testid="explain-button"
        data-explain-unit={unit.unit_id}
        onClick={(event) => {
          event.stopPropagation();
          onExplain(unit);
        }}
      >
        解釋這段
      </button>
    </div>
  );
}
