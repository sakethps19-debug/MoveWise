"use client";

import Link from "next/link";
import type { GameReview, MoveClassification } from "../lib/gameAnalysis";
import { CLASSIFICATION_LABEL } from "../lib/gameAnalysis";
import { formatEvalLoss } from "../lib/evalFormat";
import { Button } from "./ui/Button";

const CLASSIFICATION_BADGE_VARIANT: Record<MoveClassification, "success" | "warning" | "error" | "neutral"> = {
  brilliant: "success",
  best: "success",
  excellent: "success",
  good: "neutral",
  inaccuracy: "warning",
  mistake: "warning",
  blunder: "error",
  forced: "neutral",
};

/** A short, real summary line built only from `review.summary`'s actual counts — never a fabricated compliment. */
function summaryLine(summary: GameReview["summary"]): string {
  const { blunder, mistake, inaccuracy, brilliant, best } = summary;
  const problems: string[] = [];
  if (blunder > 0) problems.push(`${blunder} blunder${blunder === 1 ? "" : "s"}`);
  if (mistake > 0) problems.push(`${mistake} mistake${mistake === 1 ? "" : "s"}`);
  if (inaccuracy > 0) problems.push(`${inaccuracy} inaccurac${inaccuracy === 1 ? "y" : "ies"}`);

  if (problems.length === 0) {
    const strong = brilliant + best;
    return strong > 0 ? `Clean game — no blunders or mistakes, ${strong} best-or-better move${strong === 1 ? "" : "s"}.` : "Clean game — no blunders or mistakes found.";
  }
  return `${problems.join(", ")} to learn from below.`;
}

/**
 * Renders a `GameReview` — demo or real, distinguished only by
 * `review.isDemo` (previously two separate concerns bundled into one
 * demo-only component, `GameReviewDemo.tsx`, generalized here now that a
 * real engine-driven review exists too). The "DEMO" banner is load-
 * bearing, not decorative, when `isDemo` is true — Phase 6's own
 * instruction: "do not present mock results as genuine engine analysis."
 * A real review never shows it.
 */
export function GameReviewPanel({
  review,
  lessonTitleById,
  onRetryPosition,
}: {
  review: GameReview;
  lessonTitleById: Record<string, string>;
  /** Only offered for a real (non-demo) review — retrying a sample position teaches nothing about the learner's own game. */
  onRetryPosition?: (moveIndex: number) => void;
}) {
  return (
    <div className="mw-game-review">
      {review.isDemo && (
        <div className="mw-game-review-demo-banner" role="status">
          <span className="mw-badge mw-badge--warning">DEMO</span>
          <span>
            Sample analysis with illustrative data — not a real engine review of the game you just played. See what
            full game review will look like once it&apos;s built.
          </span>
        </div>
      )}

      <h3 className="mw-game-review-heading">2. Review the game{review.isDemo ? " (sample)" : ""}</h3>
      <p className="mw-game-review-summary" role="status">
        {summaryLine(review.summary)}
      </p>
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
              {onRetryPosition && <th scope="col">Retry</th>}
            </tr>
          </thead>
          <tbody>
            {review.moves.map((move, index) => (
              <tr key={`${move.moveNumber}-${move.color}`}>
                <td className="mw-game-review-mono">
                  {move.moveNumber}
                  {move.color === "b" ? "…" : "."}
                </td>
                <td className="mw-game-review-mono">
                  <code>{move.playedMove}</code>
                </td>
                <td className="mw-game-review-mono">
                  <code>{move.bestMove}</code>
                </td>
                <td className="mw-game-review-mono">
                  {formatEvalLoss(move.evalBefore, move.evalAfter, move.color, move.playedMove.endsWith("#"))}
                </td>
                <td>
                  <span className={`mw-badge mw-badge--${CLASSIFICATION_BADGE_VARIANT[move.classification]}`}>
                    {CLASSIFICATION_LABEL[move.classification]}
                  </span>
                </td>
                <td className="mw-game-review-explanation">{move.explanation}</td>
                {onRetryPosition &&
                  (move.classification === "mistake" || move.classification === "blunder" ? (
                    <td>
                      <Button variant="ghost" onClick={() => onRetryPosition(index)}>
                        Retry
                      </Button>
                    </td>
                  ) : (
                    <td />
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mw-game-review-heading">3. Recommended lessons</h3>
      {review.recommendedLessonIds.length === 0 ? (
        <p className="mw-game-review-empty">
          {review.isDemo ? "No specific recommendations from this sample game." : "No specific recommendations from this game."}
        </p>
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
