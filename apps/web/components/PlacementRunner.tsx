"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Puzzle } from "@movewise/exercise-schema";
import { legalTargetsFrom, moveMatches, tryMove, type Square } from "@movewise/chess-rules";
import {
  nextPlacementItemId,
  scorePlacement,
  earlyExitReason,
  PLACEMENT_ASSESSMENT_VERSION,
  type PlacementAnswer,
  type PlacementResult,
} from "../lib/placement";
import { savePlacementResult } from "../lib/placementProgress";
import { Board } from "./Board";
import { Button } from "./ui/Button";
import type { StepStatus } from "./exercises/types";

/**
 * P0's real placement assessment: ~14 adaptive interactions (see
 * lib/placement.ts for the sequencing/scoring rules) instead of a rated
 * player being forced through piece-movement lessons. Deliberately built
 * on the same board-interaction pattern as PuzzleRunner.tsx (click a
 * piece, click a destination, tryMove/moveMatches decide correctness
 * locally) rather than introducing a second board-input mechanism — this
 * is still exactly a Puzzle under the hood (packages/content/puzzles/placement.json),
 * just sequenced adaptively instead of pool-in-order.
 */
export function PlacementRunner({
  puzzlesById,
  conceptTitles,
  isGuest,
  onSubmit,
}: {
  puzzlesById: Record<string, Puzzle>;
  conceptTitles: Record<string, string>;
  isGuest: boolean;
  /** Bound server action (submitPlacementAction) for a signed-in learner — writes real UserConceptMastery rows and a PlacementAttempt evidence record. Guests score and store locally instead (lib/placementProgress.ts), same "session-local only" rule as the rest of guest progress. */
  onSubmit?: (answers: PlacementAnswer[], startedAt?: number) => Promise<PlacementResult>;
}) {
  const [answers, setAnswers] = useState<PlacementAnswer[]>([]);
  const [status, setStatus] = useState<StepStatus>("active");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingAnswer, setPendingAnswer] = useState<PlacementAnswer | null>(null);
  const [result, setResult] = useState<PlacementResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [startedAt] = useState(() => Date.now());

  const currentItemId = useMemo(() => nextPlacementItemId(answers), [answers]);
  const puzzle = currentItemId ? puzzlesById[currentItemId] : undefined;

  const [fen, setFen] = useState(puzzle?.fen ?? "");
  useEffect(() => {
    if (puzzle) setFen(puzzle.fen);
  }, [puzzle]);

  const legalTargets = useMemo(
    () => (selected && puzzle ? legalTargetsFrom(puzzle.fen, selected) : []),
    [selected, puzzle],
  );

  useEffect(() => {
    if (currentItemId !== null || result || submitting) return;
    // Assessment finished — score it. Signed in: server action writes the
    // real UserConceptMastery rows and returns the authoritative result.
    // Guest: score locally (same pure function the server uses) and
    // persist to this browser only.
    setSubmitting(true);
    (async () => {
      const finalResult = onSubmit ? await onSubmit(answers, startedAt) : scorePlacement(answers);
      if (isGuest) {
        savePlacementResult({
          demonstratedConceptIds: finalResult.demonstratedConceptIds,
          level: finalResult.level,
          confidence: finalResult.confidence,
          recommendedStartUnitId: finalResult.recommendedStartUnitId,
          assessmentVersion: PLACEMENT_ASSESSMENT_VERSION,
          startedAt,
          itemResponses: answers,
          conceptEvidence: finalResult.conceptEvidence,
          earlyExitReason: earlyExitReason(answers),
        });
      }
      setResult(finalResult);
      setSubmitting(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItemId, result, submitting]);

  if (result) {
    return <PlacementResultScreen result={result} conceptTitles={conceptTitles} />;
  }

  if (submitting || !puzzle) {
    return <p className="mw-page-subtitle">Scoring your placement result…</p>;
  }

  function advance() {
    if (pendingAnswer) setAnswers((prev) => [...prev, pendingAnswer]);
    setPendingAnswer(null);
    setStatus("active");
    setFeedback(null);
    setSelected(null);
  }

  function handleClick(square: Square) {
    if (status === "correct") return;
    if (status === "incorrect") {
      setStatus("active");
      setFeedback(null);
    }
    if (!puzzle) return;

    if (!selected) {
      setSelected(square);
      return;
    }
    if (selected === square) {
      setSelected(null);
      return;
    }
    const attempt = tryMove(puzzle.fen, { from: selected, to: square });
    setSelected(null);
    if (!attempt || !moveMatches(attempt.move, puzzle.correctMoves ?? [])) {
      setPendingAnswer({ itemId: puzzle.id, correct: false });
      setStatus("incorrect");
      setFeedback(puzzle.feedback.default ?? "Not quite — try again.");
      return;
    }
    setPendingAnswer({ itemId: puzzle.id, correct: true });
    setFen(attempt.fenAfter);
    setStatus("correct");
    setFeedback(null);
  }

  const isLastStep = pendingAnswer ? nextPlacementItemId([...answers, pendingAnswer]) === null : false;
  const promptId = `${puzzle.id}-prompt`;
  const askedSoFar = answers.length + 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-4)", maxWidth: 600, margin: "0 auto" }}>
      <div className="mw-lesson-header">
        <Link href="/" className="mw-lesson-exit" aria-label="Exit placement assessment">
          ✕ Exit
        </Link>
        <span className="mw-lesson-title">Placement assessment</span>
        <span className="mw-lesson-step-count">Question {askedSoFar}</span>
      </div>

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
      <PlacementItemFooter
        status={status}
        feedback={feedback}
        successExplanation={puzzle.successExplanation}
        isLastStep={isLastStep}
        onAdvance={advance}
      />
    </div>
  );
}

/**
 * Unlike StepFooter (which shows no button at all on a wrong answer,
 * fine for a practice pool where "retry until correct" is the point —
 * see PuzzleRunner.tsx), a placement assessment must move on regardless
 * of the answer: this is a graded, one-shot assessment, not a retry loop.
 * A real, confirmed bug this fixes: reusing StepFooter as-is left a
 * learner who answered any item wrong with no way to reach the next
 * question at all.
 */
function PlacementItemFooter({
  status,
  feedback,
  successExplanation,
  isLastStep,
  onAdvance,
}: {
  status: StepStatus;
  feedback: string | null;
  successExplanation?: string;
  isLastStep: boolean;
  onAdvance: () => void;
}) {
  if (status === "incorrect") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-3)" }}>
        <p role="alert" className="mw-feedback mw-feedback--error">
          <span aria-hidden="true" className="mw-feedback-icon">
            ✕
          </span>
          <span>
            <strong>Not quite. </strong>
            {feedback}
          </span>
        </p>
        <Button onClick={onAdvance} fullWidth>
          {isLastStep ? "See my result" : "Next question"}
        </Button>
      </div>
    );
  }
  if (status === "correct") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-3)" }}>
        <p role="status" className="mw-feedback mw-feedback--success">
          <span aria-hidden="true" className="mw-feedback-icon">
            ✓
          </span>
          <span>
            <strong>Correct! </strong>
            {successExplanation}
          </span>
        </p>
        <Button onClick={onAdvance} fullWidth>
          {isLastStep ? "See my result" : "Continue"}
        </Button>
      </div>
    );
  }
  return null;
}

function PlacementResultScreen({
  result,
  conceptTitles,
}: {
  result: PlacementResult;
  conceptTitles: Record<string, string>;
}) {
  const levelLabel: Record<PlacementResult["level"], string> = {
    new: "New to chess",
    beginner: "Beginner",
    intermediate: "Intermediate",
    advanced: "Advanced",
  };
  const startHref =
    result.recommendedStartUnitId === "meet-the-pieces"
      ? "/learn/meet-the-pieces.01-welcome"
      : result.recommendedStartUnitId === "check-and-checkmate"
        ? "/learn/check-and-checkmate.01-what-is-check"
        : result.recommendedStartUnitId === "basic-tactics"
          ? "/learn/basic-tactics.01-the-knight-fork"
          : null;

  return (
    <div className="mw-completion" style={{ maxWidth: 480, margin: "var(--mw-space-7) auto" }}>
      <h1 className="mw-completion-title">Placement result: {levelLabel[result.level]}</h1>
      <p className="mw-completion-explanation">
        {result.itemsCorrect} of {result.itemsAnswered} answered correctly.
      </p>

      {result.demonstratedConceptIds.length > 0 && (
        <div style={{ margin: "var(--mw-space-4) 0" }}>
          <p className="mw-page-subtitle">Concepts you&apos;ve already demonstrated:</p>
          <ul style={{ margin: 0, paddingLeft: "var(--mw-space-5)" }}>
            {result.demonstratedConceptIds.map((id) => (
              <li key={id}>{conceptTitles[id] ?? id}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-3)", marginTop: "var(--mw-space-5)" }}>
        {result.recommendedStartUnitId === "basic-tactics" ? (
          <Link href="/practice" className="mw-btn mw-btn--primary mw-btn--full">
            Go to tactics practice
          </Link>
        ) : (
          startHref && (
            <Link href={startHref} className="mw-btn mw-btn--primary mw-btn--full">
              Continue from where you tested to
            </Link>
          )
        )}
        <Link href="/practice" className="mw-btn mw-btn--ghost mw-btn--full">
          Browse all practice pools
        </Link>
        <Link href="/learn/meet-the-pieces.01-welcome" className="mw-btn mw-btn--ghost mw-btn--full">
          Review the fundamentals anyway
        </Link>
        <Link href="/" className="mw-btn mw-btn--ghost mw-btn--full">
          Back to learning path
        </Link>
      </div>
    </div>
  );
}
