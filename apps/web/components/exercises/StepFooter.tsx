"use client";

import type { StepStatus } from "./types";

/** Shared feedback/correct-banner/continue chrome, rendered after every answerable exercise's interactive content. */
export function StepFooter({
  status,
  feedback,
  xp,
  isLastStep,
  onAdvance,
}: {
  status: StepStatus;
  feedback: string | null;
  xp: number;
  isLastStep: boolean;
  onAdvance: () => void;
}) {
  if (status === "incorrect" && feedback) {
    return (
      <p role="alert" style={{ color: "#b3261e" }}>
        {feedback}
      </p>
    );
  }
  if (status === "correct") {
    return (
      <>
        <p role="status" style={{ color: "#1e7a34" }}>
          Correct! +{xp} XP
        </p>
        <button type="button" onClick={onAdvance}>
          {isLastStep ? "Finish lesson" : "Continue"}
        </button>
      </>
    );
  }
  return null;
}
