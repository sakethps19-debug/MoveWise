"use client";

import { useState } from "react";
import type { GuidedSequenceStep as GuidedSequenceStepData } from "@movewise/exercise-schema";
import { legalTargetsFrom, moveMatches, parseUci, tryMove, type Square } from "@movewise/chess-rules";
import { Board } from "../Board";
import { StepFooter } from "./StepFooter";
import { STEP_XP, type ExerciseHandlers } from "./types";

export function GuidedSequenceStep({
  step,
  status,
  onCorrect,
  onIncorrect,
  onReset,
  isLastStep,
  onAdvance,
  feedback,
  finishLabel,
}: {
  step: GuidedSequenceStepData;
} & ExerciseHandlers & {
    isLastStep: boolean;
    onAdvance: () => void;
    feedback: string | null;
    finishLabel?: string;
  }) {
  // The parent keys this component by step.id, so a fresh mount (and
  // fresh lazy-initialized state) happens automatically on every new step.
  const [fen, setFen] = useState(step.fen);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Square | null>(null);

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
    const result = tryMove(fen, { from: selected, to: square });
    setSelected(null);
    if (!result || !moveMatches(result.move, [step.playerMoves[index]])) {
      onIncorrect("default");
      return;
    }

    let nextFen = result.fenAfter;
    const reply = step.forcedReplies[index];
    if (reply !== undefined) {
      const replyResult = tryMove(nextFen, parseUci(reply));
      if (replyResult) nextFen = replyResult.fenAfter;
    }
    setFen(nextFen);
    const nextIndex = index + 1;
    setIndex(nextIndex);
    if (nextIndex >= step.playerMoves.length) onCorrect(STEP_XP);
  }

  const promptId = `${step.id}-prompt`;

  return (
    <>
      <p id={promptId} className="movewise-exercise-prompt">
        {step.prompt}
      </p>
      <p className="mw-hint-text">
        Move {Math.min(index + 1, step.playerMoves.length)} of {step.playerMoves.length}.
      </p>
      <div style={{ display: "flex", justifyContent: "center", margin: "var(--mw-space-2) 0" }}>
        <Board
          fen={fen}
          selected={selected}
          legalTargets={selected ? legalTargetsFrom(fen, selected) : []}
          onSquareClick={handleClick}
          interactive={status === "active"}
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
        finishLabel={finishLabel}
      />
    </>
  );
}
