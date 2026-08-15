"use client";

import type { TrueFalseStep as TrueFalseStepData } from "@movewise/exercise-schema";
import { StepFooter } from "./StepFooter";
import { STEP_XP, type ExerciseHandlers } from "./types";

export function TrueFalseStep({
  step,
  status,
  onCorrect,
  onIncorrect,
  onReset,
  isLastStep,
  onAdvance,
  feedback,
}: {
  step: TrueFalseStepData;
} & ExerciseHandlers & { isLastStep: boolean; onAdvance: () => void; feedback: string | null }) {
  function handlePick(value: boolean) {
    if (status === "correct") return;
    if (status === "incorrect") onReset();
    if (value === step.correct) onCorrect(STEP_XP);
    else onIncorrect("default");
  }

  return (
    <>
      <p>{step.prompt}</p>
      <div style={{ display: "flex", gap: 8 }}>
        {[true, false].map((value) => (
          <button
            key={String(value)}
            type="button"
            disabled={status === "correct"}
            onClick={() => handlePick(value)}
          >
            {value ? "True" : "False"}
          </button>
        ))}
      </div>
      <StepFooter status={status} feedback={feedback} xp={STEP_XP} isLastStep={isLastStep} onAdvance={onAdvance} />
    </>
  );
}
