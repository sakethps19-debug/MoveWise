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
  finishLabel,
}: {
  step: OrderStepsStepData;
} & ExerciseHandlers & {
    isLastStep: boolean;
    onAdvance: () => void;
    feedback: string | null;
    finishLabel?: string;
  }) {
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
      <p className="movewise-exercise-prompt">{step.prompt}</p>
      <div className="mw-order-list">
        {step.items.map((item, index) => {
          const placedAt = orderProgress.indexOf(index);
          const isPlaced = placedAt !== -1;
          return (
            <button
              key={item}
              type="button"
              className="mw-order-item"
              disabled={isPlaced || status === "correct"}
              onClick={() => handlePick(index)}
            >
              {isPlaced ? `${placedAt + 1}. ` : ""}
              {item}
            </button>
          );
        })}
      </div>
      <StepFooter
        status={status}
        feedback={feedback}
        successExplanation={step.successExplanation}
        xp={STEP_XP}
        isLastStep={isLastStep}
        onAdvance={onAdvance}
        finishLabel={finishLabel}
      />
    </>
  );
}
