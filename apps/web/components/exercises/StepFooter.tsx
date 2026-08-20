"use client";

import { Button } from "../ui/Button";
import type { StepStatus } from "./types";

/** Shared feedback/correct-banner/continue chrome, rendered after every answerable exercise's interactive content. */
export function StepFooter({
  status,
  feedback,
  successExplanation,
  xp,
  isLastStep,
  onAdvance,
  finishLabel = "Finish lesson",
}: {
  status: StepStatus;
  feedback: string | null;
  /** Why the correct answer is correct — shown alongside the XP banner so "Correct!" is never the whole explanation. */
  successExplanation?: string;
  xp: number;
  isLastStep: boolean;
  onAdvance: () => void;
  /** Button label on the last item — "Finish lesson" by default, overridden by non-lesson callers like PuzzleRunner ("Finish practice"). */
  finishLabel?: string;
}) {
  if (status === "incorrect" && feedback) {
    return (
      <p role="alert" className="mw-feedback mw-feedback--error">
        <span aria-hidden="true" className="mw-feedback-icon">
          ✕
        </span>
        <span>
          <strong>Not quite. </strong>
          {feedback}
        </span>
      </p>
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
            {successExplanation ? " " : ""}
            <span className="mw-feedback-xp">+{xp} XP</span>
          </span>
        </p>
        <Button onClick={onAdvance} fullWidth>
          {isLastStep ? finishLabel : "Continue"}
        </Button>
      </div>
    );
  }
  return null;
}
