"use client";

import { useState } from "react";
import Link from "next/link";
import { legalTargetsFrom, moveMatches, tryMove, type Square } from "@movewise/chess-rules";
import type { MoveAnalysis } from "../lib/gameAnalysis";
import { Board } from "./Board";
import { Button } from "./ui/Button";

/**
 * docs/testing-strategy.md row 8: "from a game review, retry a critical
 * position, play the correct move." Reuses PuzzleRunner's own click-to-
 * move pattern (Board + legalTargetsFrom + tryMove) rather than a new
 * one — this is functionally the same "attempt a move against a known-
 * correct answer" interaction, just seeded from a real game's mistake
 * instead of an authored puzzle. Deliberately no progressive-hint ladder
 * (PuzzleRunner/lesson steps have one, tied to that content's authored
 * hint text) — a game position has no authored hints, only "show best
 * move," a smaller, honest scope for this first pass.
 */
export function RetryPositionPanel({
  fenBefore,
  move,
  lessonTitleById,
  onClose,
  flipped = false,
}: {
  fenBefore: string;
  move: MoveAnalysis;
  lessonTitleById: Record<string, string>;
  onClose: () => void;
  /** Matches the review board's own orientation — see Board's own doc comment. */
  flipped?: boolean;
}) {
  const [selected, setSelected] = useState<Square | null>(null);
  const [status, setStatus] = useState<"active" | "correct" | "incorrect">("active");
  const [revealed, setRevealed] = useState(false);

  const legalTargets = selected ? legalTargetsFrom(fenBefore, selected) : [];
  const recommendedLessonId = move.recommendedLessonIds[0];

  function handleClick(square: Square) {
    if (status === "correct") return;

    if (!selected) {
      setSelected(square);
      return;
    }
    if (selected === square) {
      setSelected(null);
      return;
    }
    const result = tryMove(fenBefore, { from: selected, to: square });
    setSelected(null);
    if (!result) return;
    setStatus(moveMatches(result.move, [move.bestMove]) ? "correct" : "incorrect");
  }

  return (
    <div className="mw-game-review-retry" role="region" aria-label="Retry this position">
      <p>
        Back to move {move.moveNumber}
        {move.color === "b" ? "…" : "."} — you played <code>{move.playedMove}</code>. Find a better move.
      </p>

      <div style={{ display: "flex", justifyContent: "center", margin: "var(--mw-space-2) 0" }}>
        <Board
          fen={fenBefore}
          selected={selected}
          legalTargets={legalTargets}
          onSquareClick={handleClick}
          maxWidth={480}
          flipped={flipped}
        />
      </div>

      {status === "correct" && (
        <p role="status" className="mw-feedback mw-feedback--success">
          That&apos;s it — <code>{move.bestMove}</code> was the strongest move here.
        </p>
      )}
      {status === "incorrect" && (
        <p role="alert" className="mw-feedback mw-feedback--error">
          Not the strongest option here. Try again, or reveal the best move.
        </p>
      )}
      {status !== "correct" && !revealed && (
        <Button variant="ghost" onClick={() => setRevealed(true)}>
          Show best move
        </Button>
      )}
      {revealed && status !== "correct" && (
        <p className="mw-feedback mw-feedback--neutral">
          The strongest move here was <code>{move.bestMove}</code>.
        </p>
      )}

      {recommendedLessonId && (
        <p>
          <Link href={`/learn/${recommendedLessonId}`} className="mw-game-review-rec-link">
            Review: {lessonTitleById[recommendedLessonId] ?? recommendedLessonId}
          </Link>
        </p>
      )}

      <Button variant="ghost" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}
