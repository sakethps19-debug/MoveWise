"use client";

import { useState } from "react";
import type { GameReview } from "../lib/gameAnalysis";
import { GameReviewPanel } from "./GameReviewPanel";
import { RetryPositionPanel } from "./RetryPositionPanel";

/**
 * A real GameReview plus its retry-position affordance — extracted from
 * components/PlayRunner.tsx so the game-history detail page (viewing a
 * stored, previously-analyzed game) can render the identical combination
 * instead of a second copy of the same small bit of state (which move,
 * if any, is being retried).
 */
export function GameReviewWithRetry({
  review,
  lessonTitleById,
  fenBeforeByPly,
}: {
  review: GameReview;
  lessonTitleById: Record<string, string>;
  /** FEN before each ply, aligned by index with review.moves — chess-rules' replayPgn (or a live game's own move list) already produces this shape. */
  fenBeforeByPly: string[];
}) {
  const [retryMoveIndex, setRetryMoveIndex] = useState<number | null>(null);
  const retryMove = retryMoveIndex !== null ? (review.moves[retryMoveIndex] ?? null) : null;
  const retryFenBefore = retryMoveIndex !== null ? (fenBeforeByPly[retryMoveIndex] ?? null) : null;

  return (
    <>
      <GameReviewPanel review={review} lessonTitleById={lessonTitleById} onRetryPosition={setRetryMoveIndex} />
      {retryMove && retryFenBefore && (
        <RetryPositionPanel
          fenBefore={retryFenBefore}
          move={retryMove}
          lessonTitleById={lessonTitleById}
          onClose={() => setRetryMoveIndex(null)}
        />
      )}
    </>
  );
}
