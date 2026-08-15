"use client";

import type { ExplainStep as ExplainStepData } from "@movewise/exercise-schema";
import type { Square } from "@movewise/chess-rules";
import { Board } from "../Board";
import { Button } from "../ui/Button";

export function ExplainStep({ step, onAdvance }: { step: ExplainStepData; onAdvance: () => void }) {
  return (
    <>
      {step.boardFen && (
        <div style={{ display: "flex", justifyContent: "center", margin: "var(--mw-space-2) 0" }}>
          <Board fen={step.boardFen} highlightSquares={(step.highlights ?? []) as Square[]} interactive={false} />
        </div>
      )}
      <p className="mw-explain-text">{step.text}</p>
      <Button onClick={onAdvance} fullWidth>
        Continue
      </Button>
    </>
  );
}
