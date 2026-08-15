"use client";

import type { McqStep as McqStepData } from "@movewise/exercise-schema";
import { StepFooter } from "./StepFooter";
import { STEP_XP, type ExerciseHandlers } from "./types";

export function McqStep({
  step,
  status,
  onCorrect,
  onIncorrect,
  onReset,
  isLastStep,
  onAdvance,
  feedback,
}: {
  step: McqStepData;
} & ExerciseHandlers & { isLastStep: boolean; onAdvance: () => void; feedback: string | null }) {
  function handlePick(index: number) {
    if (status === "correct") return;
    if (status === "incorrect") onReset();
    if (index === step.correctIndex) onCorrect(STEP_XP);
    else onIncorrect(String(index));
  }

  return (
    <>
      <p>{step.prompt}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {step.options.map((option, index) => (
          <button key={option} type="button" disabled={status === "correct"} onClick={() => handlePick(index)}>
            {option}
          </button>
        ))}
      </div>
      <StepFooter status={status} feedback={feedback} xp={STEP_XP} isLastStep={isLastStep} onAdvance={onAdvance} />
    </>
  );
}
