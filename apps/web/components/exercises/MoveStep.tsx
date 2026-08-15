"use client";

import { useMemo, useState } from "react";
import type { MovePieceStep, CaptureStep, FindLegalMoveStep } from "@movewise/exercise-schema";
import { legalTargetsFrom, moveMatches, tryMove, type Square } from "@movewise/chess-rules";
import { Board } from "../Board";
import { StepFooter } from "./StepFooter";
import { Button } from "../ui/Button";
import { STEP_XP, type ExerciseHandlers } from "./types";

/** move-piece, capture, and find-legal-move all share the same "select then move" interaction. */
export function MoveStep({
  step,
  status,
  onCorrect,
  onIncorrect,
  onReset,
  onHintUsed,
  isLastStep,
  onAdvance,
  feedback,
}: {
  step: MovePieceStep | CaptureStep | FindLegalMoveStep;
} & ExerciseHandlers & { isLastStep: boolean; onAdvance: () => void; feedback: string | null }) {
  const [selected, setSelected] = useState<Square | null>(null);
  const [hintLevel, setHintLevel] = useState(0);

  const legalTargets = useMemo(() => (selected ? legalTargetsFrom(step.fen, selected) : []), [selected, step.fen]);

  // No stale hint highlight/arrow/text once the step is answered correctly.
  const activeHint = status !== "correct" ? step.hints?.find((h) => h.level === hintLevel) : undefined;
  const highlightSquares =
    activeHint && "highlightSquares" in activeHint ? (activeHint.highlightSquares as Square[]) : [];
  const activeArrow =
    activeHint && "arrowFrom" in activeHint
      ? { from: activeHint.arrowFrom as Square, to: activeHint.arrowTo as Square }
      : null;

  function handleClick(square: Square) {
    if (status === "correct") return;
    if (status === "incorrect") onReset();

    if (!selected) {
      setSelected(square);
      return;
    }
    if (selected === square) {
      setSelected(null);
      return;
    }
    const result = tryMove(step.fen, { from: selected, to: square });
    setSelected(null);
    if (!result) {
      onIncorrect("default");
      return;
    }
    const validSet = step.type === "find-legal-move" ? step.validMoves : step.expectedMoves;
    if (moveMatches(result.move, validSet)) onCorrect(STEP_XP);
    else onIncorrect("default");
  }

  const promptId = `${step.id}-prompt`;

  return (
    <>
      <p id={promptId} className="movewise-exercise-prompt">
        {step.prompt}
      </p>
      <div style={{ display: "flex", justifyContent: "center", margin: "var(--mw-space-2) 0" }}>
        <Board
          fen={step.fen}
          selected={selected}
          legalTargets={legalTargets}
          highlightSquares={highlightSquares}
          arrow={activeArrow}
          onSquareClick={handleClick}
          describedBy={promptId}
        />
      </div>
      <StepFooter
        status={status}
        feedback={feedback}
        successExplanation={step.successExplanation}
        xp={STEP_XP}
        isLastStep={isLastStep}
        onAdvance={onAdvance}
      />
      {status !== "correct" && step.hints && step.hints.length > 0 && (
        <Button
          variant="ghost"
          fullWidth
          onClick={() => {
            setHintLevel((l) => Math.min(4, l + 1));
            onHintUsed();
          }}
          disabled={hintLevel >= 4}
        >
          💡 {hintLevel >= 4 ? "Solution shown" : `Hint ${hintLevel + 1}`}
        </Button>
      )}
      {activeHint && <p className="mw-hint-text">{activeHint.text}</p>}
    </>
  );
}
