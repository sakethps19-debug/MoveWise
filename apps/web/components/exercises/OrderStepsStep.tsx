"use client";

import { useState } from "react";
import type { OrderStepsStep as OrderStepsStepData } from "@movewise/exercise-schema";
import { StepFooter } from "./StepFooter";
import { STEP_XP, type ExerciseHandlers } from "./types";

export function OrderStepsStep({
  step,
  status,
  onCorrect,
  onIncorrect,
  onReset,
  isLastStep,
  onAdvance,
  feedback,
}: {
  step: OrderStepsStepData;
} & ExerciseHandlers & { isLastStep: boolean; onAdvance: () => void; feedback: string | null }) {
  const [orderProgress, setOrderProgress] = useState<number[]>([]);

  function handlePick(index: number) {
    if (status === "correct") return;
    if (status === "incorrect") onReset();

    const expectedIndex = step.correctOrder[orderProgress.length];
    if (index !== expectedIndex) {
      onIncorrect("default");
      setOrderProgress([]);
      return;
    }
    const next = [...orderProgress, index];
    setOrderProgress(next);
    if (next.length === step.correctOrder.length) onCorrect(STEP_XP);
  }

  return (
    <>
      <p>Tap them in the correct order.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {step.items.map((item, index) => {
          const placedAt = orderProgress.indexOf(index);
          const isPlaced = placedAt !== -1;
          return (
            <button
              key={item}
              type="button"
              disabled={isPlaced || status === "correct"}
              onClick={() => handlePick(index)}
            >
              {isPlaced ? `${placedAt + 1}. ` : ""}
              {item}
            </button>
          );
        })}
      </div>
      <StepFooter status={status} feedback={feedback} xp={STEP_XP} isLastStep={isLastStep} onAdvance={onAdvance} />
    </>
  );
}
