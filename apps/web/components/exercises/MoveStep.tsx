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
  // The position actually rendered: step.fen until a correct move is made,
  // then the resulting position — the board previously never reflected a
  // correct answer, leaving the piece rendered on its starting square even
  // after the step was marked correct.
  const [boardFen, setBoardFen] = useState(step.fen);

  const legalTargets = useMemo(() => (selected ? legalTargetsFrom(boardFen, selected) : []), [selected, boardFen]);

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
    const result = tryMove(boardFen, { from: selected, to: square });
    setSelected(null);
    if (!result) {
      onIncorrect("default");
      return;
    }
    // "acceptAnyLegalMove" (move-piece only): for a step whose prompt is
    // genuinely "any legal destination" rather than a specific target (a
    // capture, a named direction), any chess-legal move of the piece must
    // be accepted — the board already highlights every one of them as
    // legal, so a hand-authored whitelist can never stay complete/correct
    // (see docs/known-risks.md). "altValid" (move-piece only — capture/
    // find-legal-move steps test a single specific move) enumerates other
    // instructionally-correct destinations for steps that don't set that
    // flag, e.g. the farthest reach in each of a sliding piece's other
    // directions — chess-legality-checked by validate-chess.ts and
    // documented as covered in docs/testing-strategy.md, but never
    // actually read here, so every alternative answer was silently marked
    // wrong despite being highlighted as a legal destination on the board.
    const isCorrect =
      step.type === "move-piece" && step.acceptAnyLegalMove
        ? true
        : moveMatches(
            result.move,
            step.type === "find-legal-move" ? step.validMoves : [...step.expectedMoves, ...("altValid" in step ? step.altValid : [])],
          );
    if (isCorrect) {
      setBoardFen(result.fenAfter);
      onCorrect(STEP_XP);
    } else {
      onIncorrect("default");
    }
  }

  const promptId = `${step.id}-prompt`;

  return (
    <>
      <p id={promptId} className="movewise-exercise-prompt">
        {step.prompt}
      </p>
      <div style={{ display: "flex", justifyContent: "center", margin: "var(--mw-space-2) 0" }}>
        <Board
          fen={boardFen}
          selected={selected}
          legalTargets={legalTargets}
          highlightSquares={highlightSquares}
          arrow={activeArrow}
          onSquareClick={handleClick}
          interactive={status !== "correct"}
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
