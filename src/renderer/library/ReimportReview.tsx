import type { RematchCandidate } from '../../core/ingest/rematch';

interface ReimportReviewProps {
  candidates: RematchCandidate[];
  onResolve: (accepted: RematchCandidate[]) => void;
  onCancel: () => void;
}

/**
 * Shown only for medium-confidence re-match pairs (0.6–0.9). Above that the
 * anchor is carried forward automatically; below it the paragraph is treated as
 * new. Nothing here can delete a unit.
 */
export function ReimportReview({
  candidates,
  onResolve,
  onCancel,
}: ReimportReviewProps) {
  return (
    <section className="reimport-review" data-testid="reimport-review">
      <h2>確認段落對應</h2>
      <p className="dim">
        這些段落和舊版本相似但不完全相同。確認後，原本的筆記與單字會跟著保留。
      </p>

      <ul className="entry-list">
        {candidates.map((candidate) => (
          <li key={candidate.incoming.unitId} data-testid="review-candidate">
            <div className="entry-body">
              <span className="dim">
                相似度 {(candidate.similarity * 100).toFixed(0)}%
              </span>
              <q>{candidate.existing.text}</q>
              <strong>{candidate.incoming.text}</strong>
            </div>
          </li>
        ))}
      </ul>

      <div className="review-actions">
        <button
          type="button"
          className="primary"
          onClick={() => onResolve(candidates)}
          data-testid="review-accept-all"
        >
          全部視為同一段
        </button>
        <button
          type="button"
          onClick={() => onResolve([])}
          data-testid="review-reject-all"
        >
          全部視為新段落
        </button>
        <button type="button" onClick={onCancel} data-testid="review-cancel">
          取消
        </button>
      </div>
    </section>
  );
}
