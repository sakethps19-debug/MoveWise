"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buildPgn, gameStatus, sanToSquares } from "@movewise/chess-rules";
import type { GameReview, MoveAnalysis, MoveClassification } from "../lib/gameAnalysis";
import { CLASSIFICATION_LABEL, MIN_LEARNER_MOVES_FOR_OVERALL_ASSESSMENT, learnerMoveCount } from "../lib/gameAnalysis";
import { identifyOpening } from "../lib/openingBook";
import { formatEval, formatEvalLoss } from "../lib/evalFormat";
import { Board } from "./Board";
import { Button } from "./ui/Button";
import { RetryPositionPanel } from "./RetryPositionPanel";

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

/** A big eval swing worth surfacing as a one-click "turning point" — the moves worth actually studying, not every ply. */
const TURNING_POINT_CLASSIFICATIONS: ReadonlySet<MoveClassification> = new Set(["blunder", "mistake", "brilliant"]);

/** Whether there's a genuinely better move worth practising — never offered for a move that already was the engine's own choice, or one with no real alternative. */
function hasBetterMove(move: MoveAnalysis): boolean {
  return move.classification !== "best" && move.classification !== "brilliant" && move.classification !== "forced";
}

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
 * The only other way PlayRunner ends a game besides the rules themselves
 * (checkmate/stalemate/draw) is resignation — and a resigned position is
 * indistinguishable from an ongoing one by the rules alone, so "the
 * final position isn't itself game-over" is the one reliable signal
 * available here without threading extra state through. Real games
 * only — an isDemo review's SAN sequence was never actually played, so
 * "resignation" doesn't meaningfully apply to it.
 */
function endedByResignation(finalFen: string, sanHistory: string[]): boolean {
  return gameStatus(finalFen, sanHistory) === "in-progress";
}

/**
 * Replaces the old static-table-only review (GameReviewPanel +
 * GameReviewWithRetry) with an interactive workspace: a real board that
 * steps through the game ply by ply, a compact selectable move list, and
 * a detail panel for whichever ply is selected. The board is always
 * driven from `positions` (stored FEN history — every ply's fenBefore/
 * fenAfter, already produced by chess-rules at the moment the move was
 * made or replayed, threaded through `lib/gameAnalysis.ts`'s
 * `positionsFromPlies`) — never from replaying `playedMove`'s SAN
 * against a guessed prior position.
 */
export function GameReviewWorkspace({
  review,
  lessonTitleById,
  positions,
  learnerColor,
}: {
  review: GameReview;
  lessonTitleById: Record<string, string>;
  /** positions[0] = before any move, positions[k] = after the k-th move — positions.length === review.moves.length + 1. */
  positions: string[];
  /** Which side the learner played, when known — enables the learner-only filter and de-emphasises the opponent's moves as context. Omitted (e.g. a stand-alone stored review with no game-side context) means every move is shown as an equally real, gradable entry. */
  learnerColor?: "w" | "b";
}) {
  const [selectedPly, setSelectedPly] = useState(0);
  const [filter, setFilter] = useState<"learner" | "full">(learnerColor ? "learner" : "full");
  const [tryingBetterMove, setTryingBetterMove] = useState(false);
  const [pgnCopied, setPgnCopied] = useState(false);
  // Real, reproduced defect this fixes: review always rendered White-
  // oriented, even for a game played as Black — mismatched against the
  // game itself (and, before the Play & Learn fix, against nothing, since
  // that board didn't flip either). Defaults to match the side actually
  // played; independent afterward and stays put across ply navigation
  // (goTo never touches this state), same as Play & Learn's own control.
  const [flipped, setFlipped] = useState(learnerColor === "b");

  const lastPly = review.moves.length;
  const currentMove = selectedPly > 0 ? review.moves[selectedPly - 1] : null;
  const fenBeforeCurrent = selectedPly > 0 ? positions[selectedPly - 1] : null;
  const currentFen = positions[selectedPly] ?? positions[0];

  // A newly-selected ply starts fresh — a "try the better move" attempt
  // from the previous ply must never carry over onto this one's position.
  useEffect(() => {
    setTryingBetterMove(false);
  }, [selectedPly]);

  // Real, confirmed gap: the Start/Previous/Next buttons were the only way
  // to step through a review — Board.tsx's own squares are keyboard-
  // operable (Tab/Enter, see e2e/keyboard-interaction.spec.ts), but this
  // workspace's own ply navigation had no keyboard equivalent at all.
  // Left/Right arrow keys mirror ← Previous / Next → exactly (same
  // goTo clamp, so this can never move outside [0, lastPly]). Ignored
  // while focus is on an editable element so this never hijacks arrow-key
  // text-cursor movement — moot today (this component renders no text
  // inputs) but a safe, standard guard regardless.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goTo(selectedPly - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goTo(selectedPly + 1);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- goTo itself only ever depends on lastPly (fixed per review), re-declared fresh each render
  }, [selectedPly, lastPly]);

  const playedSquares = currentMove && fenBeforeCurrent ? sanToSquares(fenBeforeCurrent, currentMove.playedMove) : null;
  const bestSquares =
    currentMove && fenBeforeCurrent && currentMove.playedMove !== currentMove.bestMove
      ? sanToSquares(fenBeforeCurrent, currentMove.bestMove)
      : null;

  function goTo(ply: number) {
    setSelectedPly(Math.max(0, Math.min(lastPly, ply)));
  }

  /**
   * P1 "PGN copy/export" — reconstructed from the moves this review
   * already has (each ply's own played SAN, chess-rules' own `buildPgn`),
   * not a second, separately-maintained copy of the game. Real games
   * only (an `isDemo` review's SAN sequence isn't a game that was
   * actually played, so exporting it as if it were would be exactly the
   * kind of fabricated-data problem this pass exists to remove).
   */
  async function copyPgn() {
    const pgn = buildPgn(review.moves.map((m) => m.playedMove));
    try {
      await navigator.clipboard.writeText(pgn);
      setPgnCopied(true);
      setTimeout(() => setPgnCopied(false), 2500);
    } catch {
      // Clipboard access can be denied/unavailable — the button itself
      // silently not confirming is preferable to throwing at the learner.
    }
  }

  const turningPoints = review.moves
    .map((move, i) => ({ move, ply: i + 1 }))
    .filter(({ move }) => TURNING_POINT_CLASSIFICATIONS.has(move.classification));

  // P1 "honest short-game review" — real, reproduced defect: a 3-move
  // game (2 learner moves) resigned early was summarized as "Clean game
  // — no blunders or mistakes, 2 best-or-better moves," a confident
  // overall-quality claim from a sample size that can't support one.
  // Demo data is explicitly illustrative already (the DEMO banner above)
  // and was never actually played, so this only ever applies to a real
  // review. Per-move analysis (the board, move list, and each move's own
  // classification/explanation below) is unaffected either way.
  const reliableSampleSize = review.isDemo || learnerMoveCount(review.moves, learnerColor) >= MIN_LEARNER_MOVES_FOR_OVERALL_ASSESSMENT;
  const finalFen = positions[positions.length - 1] ?? positions[0];
  const resigned = !review.isDemo && review.moves.length > 0 && endedByResignation(finalFen, review.moves.map((m) => m.playedMove));
  const opening = review.isDemo ? null : identifyOpening(review.moves.map((m) => m.playedMove));

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
      {reliableSampleSize ? (
        <p className="mw-game-review-summary" role="status">
          {summaryLine(review.summary)}
        </p>
      ) : (
        <div className="mw-game-review-summary mw-game-review-summary--short" role="status">
          <p style={{ margin: 0 }}>
            Too few moves ({learnerMoveCount(review.moves, learnerColor)}) for a reliable overall assessment — every
            move below still has its own real analysis, but a "clean game" or accuracy claim from a game this short
            wouldn&apos;t mean much.
          </p>
          {resigned && (
            <p style={{ margin: 0 }}>
              This game ended by resignation, not by a forced result — the position itself hadn&apos;t reached
              checkmate or a draw.
            </p>
          )}
          {opening && (
            <p style={{ margin: 0 }}>
              Opening: <strong>{opening.name}</strong>. {opening.idea}
            </p>
          )}
        </div>
      )}

      {!review.isDemo && review.moves.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--mw-space-3)" }}>
          <Button variant="ghost" onClick={copyPgn}>
            Copy PGN
          </Button>
          {pgnCopied && (
            <span role="status" style={{ margin: 0, fontSize: 14.5, color: "var(--mw-text-dim)" }}>
              Copied to clipboard.
            </span>
          )}
        </div>
      )}

      {learnerColor && (
        <div className="mw-segmented mw-review-filter" role="group" aria-label="Which moves to review">
          <button
            type="button"
            className={`mw-segmented-option${filter === "learner" ? " mw-segmented-option--active" : ""}`}
            aria-pressed={filter === "learner"}
            onClick={() => setFilter("learner")}
          >
            Your moves
          </button>
          <button
            type="button"
            className={`mw-segmented-option${filter === "full" ? " mw-segmented-option--active" : ""}`}
            aria-pressed={filter === "full"}
            onClick={() => setFilter("full")}
          >
            Full game
          </button>
        </div>
      )}

      {turningPoints.length > 0 && (
        <div className="mw-review-turning-points" role="group" aria-label="Key turning points">
          {turningPoints.map(({ move, ply }) => (
            <button
              key={ply}
              type="button"
              className={`mw-badge mw-badge--${CLASSIFICATION_BADGE_VARIANT[move.classification]} mw-review-turning-point`}
              onClick={() => goTo(ply)}
            >
              {move.moveNumber}
              {move.color === "b" ? "…" : "."} {move.playedMove} — {CLASSIFICATION_LABEL[move.classification]}
            </button>
          ))}
        </div>
      )}

      <div className="mw-review-workspace">
        <div className="mw-review-board-col">
          <Board
            fen={currentFen}
            lastMove={playedSquares}
            arrow={bestSquares}
            interactive={false}
            maxWidth={420}
            flipped={flipped}
          />
          <Button
            variant="ghost"
            onClick={() => setFlipped((f) => !f)}
            aria-pressed={flipped}
            aria-label={flipped ? "Flip board to White's view" : "Flip board to Black's view"}
          >
            ⇅ Flip board
          </Button>
          <div className="mw-review-nav" role="group" aria-label="Move navigation">
            <Button variant="ghost" onClick={() => goTo(0)} disabled={selectedPly === 0}>
              Start
            </Button>
            <Button variant="ghost" onClick={() => goTo(selectedPly - 1)} disabled={selectedPly === 0}>
              ← Previous
            </Button>
            <span className="mw-review-nav-position" role="status">
              {selectedPly === 0 ? "Starting position" : `Ply ${selectedPly} of ${lastPly}`}
            </span>
            <Button variant="ghost" onClick={() => goTo(selectedPly + 1)} disabled={selectedPly === lastPly}>
              Next →
            </Button>
          </div>

          {/* Kept in the SAME column as the board, not a separately-
              scrolling one — an iPad-landscape viewer must be able to see
              the board, the selected move, and its explanation together
              without scrolling between them. Only the move list (below,
              in the other column) scrolls independently for a long game. */}
          {currentMove ? (
            <div className="mw-review-detail" key={selectedPly}>
              <div className="mw-review-detail-head">
                <span className="mw-game-review-mono">
                  {currentMove.moveNumber}
                  {currentMove.color === "b" ? "…" : "."} <code>{currentMove.playedMove}</code>
                </span>
                <span className={`mw-badge mw-badge--${CLASSIFICATION_BADGE_VARIANT[currentMove.classification]}`}>
                  {CLASSIFICATION_LABEL[currentMove.classification]}
                </span>
              </div>
              <div className="mw-review-detail-evals">
                <span>
                  Before <span className="mw-game-review-mono">{formatEval(currentMove.evalBefore)}</span>
                </span>
                <span>
                  After <span className="mw-game-review-mono">{formatEval(currentMove.evalAfter)}</span>
                </span>
                {currentMove.playedMove !== currentMove.bestMove && (
                  <span className="mw-review-detail-best">
                    Best <code>{currentMove.bestMove}</code>
                  </span>
                )}
                {/* Real, previously-fixed production bug this restores visibility
                    for: a move whose played SAN equals its best SAN (byte-for-byte
                    the engine's own choice) must never show a nonzero "Eval loss"
                    here — `evalLoss` is already the exact number the classification
                    badge above was decided from (lib/moveClassification.ts's
                    computeEvalLoss), so this can never independently disagree with
                    it the way the old static table's own re-derived value once did. */}
                <span className="mw-review-detail-eval-loss">
                  Eval loss{" "}
                  <span className="mw-game-review-mono">
                    {formatEvalLoss(
                      currentMove.evalBefore,
                      currentMove.evalAfter,
                      currentMove.color,
                      currentMove.playedMove.endsWith("#"),
                      currentMove.evalLoss,
                    )}
                  </span>
                </span>
              </div>
              <p className="mw-review-detail-explanation">{currentMove.explanation}</p>

              {!tryingBetterMove && hasBetterMove(currentMove) && fenBeforeCurrent && (
                <Button variant="ghost" onClick={() => setTryingBetterMove(true)}>
                  Try the better move
                </Button>
              )}
              {tryingBetterMove && fenBeforeCurrent && (
                <RetryPositionPanel
                  fenBefore={fenBeforeCurrent}
                  move={currentMove}
                  lessonTitleById={lessonTitleById}
                  onClose={() => setTryingBetterMove(false)}
                  flipped={flipped}
                />
              )}

              {currentMove.recommendedLessonIds[0] && !tryingBetterMove && (
                <Link href={`/learn/${currentMove.recommendedLessonIds[0]}`} className="mw-game-review-rec-link">
                  Review: {lessonTitleById[currentMove.recommendedLessonIds[0]] ?? currentMove.recommendedLessonIds[0]}
                </Link>
              )}
            </div>
          ) : (
            <p className="mw-review-detail-explanation">Select a move to see the board, the engine&apos;s evaluation, and what to learn from it.</p>
          )}
        </div>

        <div className="mw-review-move-list-col">
          <div className="mw-game-review-table-wrap">
            <div className="mw-game-review-table">
              <div className="mw-review-move-list-head" aria-hidden="true">
                <span>Move</span>
                <span>Played</span>
                <span>Eval</span>
                <span>Rating</span>
              </div>
              {review.moves.map((move, index) => {
                const ply = index + 1;
                const isLearnerMove = !learnerColor || move.color === learnerColor;
                if (!isLearnerMove && filter === "learner") return null;
                return (
                  <button
                    key={ply}
                    type="button"
                    className={`mw-review-move-row${selectedPly === ply ? " mw-review-move-row--selected" : ""}${!isLearnerMove ? " mw-review-move-row--context" : ""}`}
                    aria-pressed={selectedPly === ply}
                    onClick={() => goTo(ply)}
                  >
                    <span className="mw-game-review-mono">
                      {move.moveNumber}
                      {move.color === "b" ? "…" : "."}
                    </span>
                    <span className="mw-game-review-mono">
                      <code>{move.playedMove}</code>
                    </span>
                    <span className="mw-game-review-mono">{formatEval(move.evalAfter)}</span>
                    <span>
                      {isLearnerMove ? (
                        <span className={`mw-badge mw-badge--${CLASSIFICATION_BADGE_VARIANT[move.classification]}`}>
                          {CLASSIFICATION_LABEL[move.classification]}
                        </span>
                      ) : (
                        <span className="mw-review-context-label">Stockfish</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
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
