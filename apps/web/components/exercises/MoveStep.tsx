"use client";

import { useMemo, useState } from "react";
import type { MovePieceStep, CaptureStep, FindLegalMoveStep } from "@movewise/exercise-schema";
import { legalTargetsFrom, moveMatches, tryMove, type Square } from "@movewise/chess-rules";
import { Board } from "../Board";
import { StepFooter } from "./StepFooter";
import { STEP_XP, type ExerciseHandlers } from "./types";

/** move-piece, capture, and find-legal-move all share the same "select then move" interaction. */
export function MoveStep({
  step,
  status,
  onCorrect,
  onIncorrect,
  onReset,
  isLastStep,
  onAdvance,
  feedback,
}: {
  step: MovePieceStep | CaptureStep | FindLegalMoveStep;
} & ExerciseHandlers & { isLastStep: boolean; onAdvance: () => void; feedback: string | null }) {
  const [selected, setSelected] = useState<Square | null>(null);
  const [hintLevel, setHintLevel] = useState(0);

  const legalTargets = useMemo(() => (selected ? legalTargetsFrom(step.fen, selected) : []), [selected, step.fen]);

  const activeHint = "hints" in step ? step.hints.find((h) => h.level === hintLevel) : undefined;
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

  return (
    <>
      <Board
        fen={step.fen}
        selected={selected}
        legalTargets={legalTargets}
        highlightSquares={highlightSquares}
        arrow={activeArrow}
        onSquareClick={handleClick}
      />
      <StepFooter status={status} feedback={feedback} xp={STEP_XP} isLastStep={isLastStep} onAdvance={onAdvance} />
      {status !== "correct" && "hints" in step && (
        <button type="button" onClick={() => setHintLevel((l) => Math.min(4, l + 1))} disabled={hintLevel >= 4}>
          {hintLevel >= 4 ? "Solution shown" : `Hint ${hintLevel + 1}`}
        </button>
      )}
      {activeHint && <p style={{ fontStyle: "italic" }}>{activeHint.text}</p>}
    </>
  );
}
