"use client";

import type { ReviewStep as ReviewStepData } from "@movewise/exercise-schema";
import { Button } from "../ui/Button";

export function ReviewStep({
  step,
  onAdvance,
  finishLabel = "Finish lesson",
}: {
  step: ReviewStepData;
  onAdvance: () => void;
  finishLabel?: string;
}) {
  return (
    <>
      <div className="mw-review-card">
        <p className="mw-review-summary">{step.summary}</p>
      </div>
      <Button onClick={onAdvance} fullWidth>
        {finishLabel}
      </Button>
    </>
  );
}
