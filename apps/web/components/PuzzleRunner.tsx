"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Puzzle } from "@movewise/exercise-schema";
import { legalTargetsFrom, moveMatches, tryMove, type Square } from "@movewise/chess-rules";
import { recordGuestPracticeAttempt, recordGuestWarmUpCompletion } from "../lib/guestProgress";
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
  completionIcon,
  isWarmUp = false,
}: {
  puzzles: Puzzle[];
  principleTitle: string;
  /** Bound server action recording (puzzleId, correct) — omitted for a guest, whose puzzle practice isn't persisted server-side (see app/actions.ts's recordPuzzleAttemptAction); a guest's attempts are instead recorded locally below (lib/guestProgress.ts), same "visible on this device only" rule as the rest of guest state. */
  onAttempt?: (puzzleId: string, correct: boolean) => void;
  /** Overrides the header's "{principleTitle} — Practice" label — used by the remediation flow (RemediationRunner.tsx), which reuses this same puzzle-solving UI for its easier-puzzle round under a "Review" framing instead. */
  heading?: string;
  /** The four completion-screen overrides below default to the plain practice-pool experience; RemediationRunner overrides them to close its own flow with a "try it again" link back to the lesson instead of home. */
  completionTitle?: string;
  completionMessage?: string;
  completionHref?: string;
  completionLinkText?: string;
  /** Optional icon-in-circle shown above the completion title — only ConfirmationActivity passes this (a success or info tone, since its two outcomes need to read as visually distinct at a glance, never a shared generic look), so every other caller's completion screen renders exactly as before. */
  completionIcon?: React.ReactNode;
  /** Only the Daily warm-up route sets this — drives the guest "Warm-ups completed" Progress stat, distinct from an ordinary puzzle-pool completion. */
  isWarmUp?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<StepStatus>("active");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [solved, setSolved] = useState(0);
  // Real, confirmed bug this fixes: the completion screen's own "X of Y
  // solved on the first try" text used `solved` above, which counts every
  // puzzle eventually completed — since finishing a set requires solving
  // each one (there's no skip), `solved` always equals `puzzles.length` by
  // the time this screen renders, regardless of how many retries it took.
  // A learner who got puzzle 1 wrong, retried, then solved puzzle 2 clean
  // saw "2 of 2 solved on the first try" — directly contradicting
  // ConfirmationActivity's own, separately-computed "this needs a closer
  // look" outcome (which correctly tracks every attempt, not just the
  // final one). `firstTry` is a genuinely distinct count, incremented only
  // when the puzzle now finishing was never previously marked incorrect —
  // `missedThisPuzzleRef` resets per puzzle below.
  const [firstTry, setFirstTry] = useState(0);
  const missedThisPuzzleRef = useRef(false);
  const [finished, setFinished] = useState(false);
  const [syncError, setSyncError] = useState(false);

  const puzzle = puzzles[index];
  const isLastPuzzle = index === puzzles.length - 1;

  // The board's own displayed position — real, confirmed defect: this
  // component always rendered `puzzle.fen` (the fixed starting position)
  // directly, so a correct answer never actually showed the piece having
  // moved; the "Correct!" banner appeared with the board frozen at its
  // pre-move square. Every other exercise runner in this codebase
  // (MoveStep, MiniGameStep, GuidedSequenceStep) tracks its own fen state
  // and updates it to `result.fenAfter` on a real move — this brings
  // PuzzleRunner in line with that same pattern.
  //
  // Deliberately NOT re-synced via a `useEffect` keyed on `puzzle.id` —
  // that was a second, real bug: an effect only runs *after* the render
  // that already advanced `index`, so for one paint the next puzzle's
  // prompt (derived directly from `puzzle`, no state) was visible with
  // the board still showing the previous puzzle's position. `advance()`
  // below now sets the next puzzle's `fen` (and resets
  // `missedThisPuzzleRef`) synchronously in the same call that advances
  // `index`, so they always land in the same React commit.
  const [fen, setFen] = useState(puzzle.fen);

  // Only a "move" puzzle has legal-move targets to highlight — a
  // "select-square" puzzle (no piece-movement rule required, e.g. Board
  // Basics' orientation/coordinate puzzles) never selects a piece to move.
  const legalTargets = useMemo(
    () => (puzzle.kind === "move" && selected && puzzle ? legalTargetsFrom(puzzle.fen, selected) : []),
    [selected, puzzle],
  );

  if (puzzles.length === 0) {
    return <p className="mw-feedback mw-feedback--error">No puzzles are available for this principle yet.</p>;
  }

  if (finished) {
    return (
      <div className="mw-completion" style={{ maxWidth: 440, margin: "var(--mw-space-7) auto" }}>
        {completionIcon}
        <h1 className="mw-completion-title">{completionTitle}</h1>
        {completionMessage && <p className="mw-completion-explanation">{completionMessage}</p>}
        <p className="mw-completion-explanation">
          {firstTry} of {puzzles.length} solved on the first try.
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
      if (!onAttempt && isWarmUp) recordGuestWarmUpCompletion();
    } else {
      const nextIndex = index + 1;
      missedThisPuzzleRef.current = false;
      setFen(puzzles[nextIndex].fen);
      setIndex(nextIndex);
    }
  }

  function recordAttempt(correct: boolean) {
    if (onAttempt) Promise.resolve(onAttempt(puzzle.id, correct)).catch(() => setSyncError(true));
    else recordGuestPracticeAttempt(correct, correct ? undefined : puzzle.conceptIds);
  }

  function handleClick(square: Square) {
    if (status === "correct") return;
    if (status === "incorrect") {
      setStatus("active");
      setFeedback(null);
    }

    // A "select-square" puzzle (Board Basics' orientation/coordinate
    // content, e.g.) is answered by a single tap — no piece is selected
    // or moved, since that content is deliberately scoped to never
    // require a piece-movement rule that hasn't been taught yet.
    if (puzzle.kind === "select-square") {
      const correct = (puzzle.correctSquares ?? []).includes(square);
      recordAttempt(correct);
      if (!correct) {
        missedThisPuzzleRef.current = true;
        setStatus("incorrect");
        setFeedback(puzzle.feedback.default ?? "Not quite — try again.");
        return;
      }
      setSolved((s) => s + 1);
      if (!missedThisPuzzleRef.current) setFirstTry((f) => f + 1);
      setStatus("correct");
      setFeedback(null);
      return;
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
    // Correctness itself is decided locally (tryMove/moveMatches, no
    // network round-trip) — the immediate Correct/Not-quite feedback
    // below is real and shouldn't wait on onAttempt's persistence call.
    // That call previously fired without a .catch(), so a dropped
    // connection silently lost the ExerciseAttempt row (and the
    // UserConceptMastery signal it feeds — see recomputeMasteryForConcepts
    // in app/actions.ts) with zero indication to the learner. It still
    // shouldn't block the puzzle flow on failure, but it also shouldn't
    // be silent — see the syncError notice below.
    if (!result || !moveMatches(result.move, puzzle.correctMoves ?? [])) {
      recordAttempt(false);
      missedThisPuzzleRef.current = true;
      setStatus("incorrect");
      setFeedback(puzzle.feedback.default ?? "Not quite — try again.");
      return;
    }
    recordAttempt(true);
    setFen(result.fenAfter);
    setSolved((s) => s + 1);
    if (!missedThisPuzzleRef.current) setFirstTry((f) => f + 1);
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

      {syncError && (
        <p role="alert" className="mw-feedback mw-feedback--error">
          Your progress on this puzzle set may not be saving — check your connection. What you see here is still
          accurate for this session either way.
        </p>
      )}

      <p id={promptId} className="movewise-exercise-prompt">
        {puzzle.prompt}
      </p>
      <div style={{ display: "flex", justifyContent: "center", margin: "var(--mw-space-2) 0" }}>
        <Board
          fen={fen}
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
