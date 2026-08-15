"use client";

import type { ReviewStep as ReviewStepData } from "@movewise/exercise-schema";

export function ReviewStep({ step, onAdvance }: { step: ReviewStepData; onAdvance: () => void }) {
  return (
    <>
      <p>{step.summary}</p>
      <button type="button" onClick={onAdvance}>
        Complete unit
      </button>
    </>
  );
}
