"use client";

import Link from "next/link";
import type { GameReview, MoveClassification } from "../lib/gameAnalysis";
import { CLASSIFICATION_LABEL } from "../lib/gameAnalysis";

const CLASSIFICATION_BADGE_VARIANT: Record<MoveClassification, "success" | "warning" | "error" | "neutral"> = {
  brilliant: "success",
  great: "success",
  best: "success",
  good: "neutral",
  inaccuracy: "warning",
  mistake: "warning",
  blunder: "error",
};

/**
 * Phase 6: "build the interface ... for [post-game intelligence], create
 * a clearly labelled mock/demo analysis using deterministic sample data
 * only, do not present mock results as genuine engine analysis." The
 * "DEMO" banner below is not decorative — it's load-bearing: nothing else
 * in this component's copy claims this is analysis of the game the
 * learner just played (see lib/gameAnalysis.ts's buildDemoGameReview doc
 * comment for why the sample data is deliberately NOT derived from their
 * real moves).
 */
export function GameReviewDemo({
  review,
  lessonTitleById,
}: {
  review: GameReview;
  lessonTitleById: Record<string, string>;
}) {
  return (
    <div className="mw-game-review">
      <div className="mw-game-review-demo-banner" role="status">
        <span className="mw-badge mw-badge--warning">DEMO</span>
        <span>
          Sample analysis with illustrative data — not a real engine review of the game you just played. See what
          full game review will look like once it&apos;s built.
        </span>
      </div>

      <h3 className="mw-game-review-heading">2. Review the game (sample)</h3>
      <div className="mw-game-review-table-wrap">
        <table className="mw-game-review-table">
          <thead>
            <tr>
              <th scope="col">Move</th>
              <th scope="col">Played</th>
              <th scope="col">Best</th>
              <th scope="col">Eval loss</th>
              <th scope="col">Rating</th>
              <th scope="col">Why</th>
            </tr>
          </thead>
          <tbody>
            {review.moves.map((move) => (
              <tr key={`${move.moveNumber}-${move.color}`}>
                <td>
                  {move.moveNumber}
                  {move.color === "b" ? "…" : "."}
                </td>
                <td>
                  <code>{move.playedMove}</code>
                </td>
                <td>
                  <code>{move.bestMove}</code>
                </td>
                <td>{move.evalLoss > 0 ? `-${move.evalLoss}cp` : "—"}</td>
                <td>
                  <span className={`mw-badge mw-badge--${CLASSIFICATION_BADGE_VARIANT[move.classification]}`}>
                    {CLASSIFICATION_LABEL[move.classification]}
                  </span>
                </td>
                <td className="mw-game-review-explanation">{move.explanation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mw-game-review-heading">3. Recommended lessons</h3>
      {review.recommendedLessonIds.length === 0 ? (
        <p className="mw-game-review-empty">No specific recommendations from this sample game.</p>
      ) : (
        <ul className="mw-game-review-recs">
          {review.recommendedLessonIds.map((lessonId) => (
            <li key={lessonId}>
              <Link href={`/learn/${lessonId}`} className="mw-game-review-rec-link">
                {lessonTitleById[lessonId] ?? lessonId}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
