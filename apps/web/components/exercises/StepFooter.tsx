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
}: {
  status: StepStatus;
  feedback: string | null;
  /** Why the correct answer is correct — shown alongside the XP banner so "Correct!" is never the whole explanation. */
  successExplanation?: string;
  xp: number;
  isLastStep: boolean;
  onAdvance: () => void;
}) {
  if (status === "incorrect" && feedback) {
    return (
      <p role="alert" className="mw-feedback mw-feedback--error">
        <strong>Not quite. </strong>
        {feedback}
      </p>
    );
  }
  if (status === "correct") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-3)" }}>
        <p role="status" className="mw-feedback mw-feedback--success">
          <strong>Correct! </strong>
          {successExplanation ?? `+${xp} XP`}
        </p>
        <Button onClick={onAdvance} fullWidth>
          {isLastStep ? "Finish lesson" : "Continue"}
        </Button>
      </div>
    );
  }
  return null;
}
