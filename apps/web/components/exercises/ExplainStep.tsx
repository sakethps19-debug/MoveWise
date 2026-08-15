"use client";

import type { ExplainStep as ExplainStepData } from "@movewise/exercise-schema";
import type { Square } from "@movewise/chess-rules";
import { Board } from "../Board";

export function ExplainStep({ step, onAdvance }: { step: ExplainStepData; onAdvance: () => void }) {
  return (
    <>
      {step.boardFen && (
        <Board fen={step.boardFen} highlightSquares={(step.highlights ?? []) as Square[]} interactive={false} />
      )}
      <p>{step.text}</p>
      <button type="button" onClick={onAdvance}>
        Continue
      </button>
    </>
  );
}
