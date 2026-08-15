"use client";

import { useState } from "react";
import type { SelectSquareStep, FindCheckStep } from "@movewise/exercise-schema";
import type { Square } from "@movewise/chess-rules";
import { Board } from "../Board";
import { StepFooter } from "./StepFooter";
import { STEP_XP, type ExerciseHandlers } from "./types";

/** select-square, find-check, and find-checkmate all share the same "click one square" interaction. */
export function ClickSquareStep({
  step,
  status,
  onCorrect,
  onIncorrect,
  onReset,
  isLastStep,
  onAdvance,
  feedback,
}: {
  step: SelectSquareStep | FindCheckStep;
} & ExerciseHandlers & { isLastStep: boolean; onAdvance: () => void; feedback: string | null }) {
  const [hintLevel, setHintLevel] = useState(0);

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
    if (step.correctSquares.includes(square)) onCorrect(STEP_XP);
    else onIncorrect(square);
  }

  return (
    <>
      {(step.type === "find-check" || step.type === "find-checkmate") && (
        <p>
          {step.type === "find-checkmate"
            ? "Click the square where you can deliver checkmate."
            : "Click the square where you can put the opponent in check."}
        </p>
      )}
      <Board
        fen={step.fen}
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
