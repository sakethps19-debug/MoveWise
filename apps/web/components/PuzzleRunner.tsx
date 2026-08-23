"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Puzzle } from "@movewise/exercise-schema";
import { legalTargetsFrom, moveMatches, tryMove, type Square } from "@movewise/chess-rules";
import { Board } from "./Board";
import { StepFooter } from "./exercises/StepFooter";
import type { StepStatus } from "./exercises/types";

const PUZZLE_XP = 5;

/**
 * A Principle's puzzle pool (ADR-0008) — deliberately simpler than
 * LessonRunner: no hearts, no mistake-driven recovery interstitial, no
 * hints (Puzzle has none, unlike a move-piece step — see
 * exercise-schema's PuzzleSchema). Puzzles are practice, not a graded
 * sequence with a pass/fail outcome; a wrong answer just resets so the
 * learner tries again, same as any other exercise's "try again" flow.
 */
export function PuzzleRunner({
  puzzles,
  principleTitle,
  onAttempt,
  heading,
  completionTitle = "Practice complete!",
  completionMessage,
  completionHref = "/",
  completionLinkText = "Back to learning path",
}: {
  puzzles: Puzzle[];
  principleTitle: string;
  /** Bound server action recording (puzzleId, correct) — omitted for a guest, whose puzzle practice is session-local only (see app/actions.ts's recordPuzzleAttemptAction). */
  onAttempt?: (puzzleId: string, correct: boolean) => void;
  /** Overrides the header's "{principleTitle} — Practice" label — used by the remediation flow (RemediationRunner.tsx), which reuses this same puzzle-solving UI for its easier-puzzle round under a "Review" framing instead. */
  heading?: string;
  /** The four completion-screen overrides below default to the plain practice-pool experience; RemediationRunner overrides them to close its own flow with a "try it again" link back to the lesson instead of home. */
  completionTitle?: string;
  completionMessage?: string;
  completionHref?: string;
  completionLinkText?: string;
}) {
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<StepStatus>("active");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [solved, setSolved] = useState(0);
  const [finished, setFinished] = useState(false);

  const puzzle = puzzles[index];
  const isLastPuzzle = index === puzzles.length - 1;

  const legalTargets = useMemo(
    () => (selected && puzzle ? legalTargetsFrom(puzzle.fen, selected) : []),
    [selected, puzzle],
  );

  if (puzzles.length === 0) {
    return <p className="mw-feedback mw-feedback--error">No puzzles are available for this principle yet.</p>;
  }

  if (finished) {
    return (
      <div className="mw-completion" style={{ maxWidth: 440, margin: "var(--mw-space-7) auto" }}>
        <h1 className="mw-completion-title">{completionTitle}</h1>
        {completionMessage && <p className="mw-completion-explanation">{completionMessage}</p>}
        <p className="mw-completion-explanation">
          {solved} of {puzzles.length} solved on the first try.
        </p>
        <p role="status" className="mw-completion-xp">
          +{solved * PUZZLE_XP} XP
        </p>
        <Link href={completionHref} className="mw-btn mw-btn--primary mw-btn--full">
          {completionLinkText}
        </Link>
      </div>
    );
  }

  function advance() {
    setStatus("active");
    setFeedback(null);
    setSelected(null);
    if (isLastPuzzle) {
      setFinished(true);
    } else {
      setIndex((i) => i + 1);
    }
  }

  function handleClick(square: Square) {
    if (status === "correct") return;
    if (status === "incorrect") {
      setStatus("active");
      setFeedback(null);
    }

    if (!selected) {
      setSelected(square);
      return;
    }
    if (selected === square) {
      setSelected(null);
      return;
    }
    const result = tryMove(puzzle.fen, { from: selected, to: square });
    setSelected(null);
    if (!result || !moveMatches(result.move, puzzle.correctMoves)) {
      onAttempt?.(puzzle.id, false);
      setStatus("incorrect");
      setFeedback(puzzle.feedback.default ?? "Not quite — try again.");
      return;
    }
    onAttempt?.(puzzle.id, true);
    setSolved((s) => s + 1);
    setStatus("correct");
    setFeedback(null);
  }

  const promptId = `${puzzle.id}-prompt`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-4)", maxWidth: 600, margin: "0 auto" }}>
      <div className="mw-lesson-header">
        <Link href="/" className="mw-lesson-exit" aria-label="Exit practice">
          ✕ Exit
        </Link>
        <span className="mw-lesson-title">{heading ?? `${principleTitle} — Practice`}</span>
        <span className="mw-lesson-step-count">
          Puzzle {index + 1}/{puzzles.length}
        </span>
      </div>

      <p id={promptId} className="movewise-exercise-prompt">
        {puzzle.prompt}
      </p>
      <div style={{ display: "flex", justifyContent: "center", margin: "var(--mw-space-2) 0" }}>
        <Board
          fen={puzzle.fen}
          selected={selected}
          legalTargets={legalTargets}
          highlightSquares={[]}
          arrow={null}
          onSquareClick={handleClick}
          describedBy={promptId}
        />
      </div>
      <StepFooter
        status={status}
        feedback={feedback}
        successExplanation={puzzle.successExplanation}
        xp={PUZZLE_XP}
        isLastStep={isLastPuzzle}
        onAdvance={advance}
        finishLabel="Finish practice"
      />
    </div>
  );
}
