"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Lesson } from "@movewise/exercise-schema";
import { useStockfishEngine } from "../lib/useStockfishEngine";
import { starsForMistakes } from "../lib/mastery";
import { recordGuestCompletion } from "../lib/guestProgress";
import { ExplainStep } from "./exercises/ExplainStep";
import { ClickSquareStep } from "./exercises/ClickSquareStep";
import { MoveStep } from "./exercises/MoveStep";
import { McqStep } from "./exercises/McqStep";
import { TrueFalseStep } from "./exercises/TrueFalseStep";
import { OrderStepsStep } from "./exercises/OrderStepsStep";
import { GuidedSequenceStep } from "./exercises/GuidedSequenceStep";
import { MiniGameStep } from "./exercises/MiniGameStep";
import { ReviewStep } from "./exercises/ReviewStep";
import type { StepStatus } from "./exercises/types";

interface LessonRunnerProps {
  lesson: Lesson;
  onComplete?: (xpEarned: number, mistakes: number) => void;
  /** True when there's no signed-in session — persists this completion to localStorage instead of the DB. */
  isGuest?: boolean;
}

const START_HEARTS = 5;

/**
 * Thin orchestrator: owns step navigation, status/feedback, XP, mistake
 * count, and hearts — all shared across exercise types. Each exercise
 * type's own interaction logic (and any per-step local state, e.g. a
 * guided-sequence's mutating board) lives in its own component under
 * exercises/, keyed by step.id so it remounts fresh on every new step
 * instead of needing manual reset effects.
 *
 * Hearts are a per-attempt visual signal only (floor at 0, no lockout) —
 * this is a beginner-focused learning product; a hard block on wrong
 * answers would be punitive, not supportive, for the audience it's for.
 */
export function LessonRunner({ lesson, onComplete, isGuest }: LessonRunnerProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [status, setStatus] = useState<StepStatus>("active");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [xpEarned, setXpEarned] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [finished, setFinished] = useState<{ xp: number; mistakes: number } | null>(null);

  const step = lesson.steps[stepIndex];
  const isLastStep = stepIndex === lesson.steps.length - 1;
  const hearts = Math.max(0, START_HEARTS - mistakes);

  const hasMiniGame = useMemo(() => lesson.steps.some((s) => s.type === "mini-game"), [lesson]);
  const { engineRef, ready: engineReady, error: engineError } = useStockfishEngine(hasMiniGame);

  function advance() {
    setStatus("active");
    setFeedback(null);
    if (isLastStep) {
      const totalXp = xpEarned + lesson.xpReward;
      onComplete?.(totalXp, mistakes);
      if (isGuest) recordGuestCompletion(lesson.id, totalXp, mistakes);
      setFinished({ xp: totalXp, mistakes });
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  function handleCorrect(xp: number) {
    setStatus("correct");
    setFeedback(null);
    setXpEarned((v) => v + xp);
  }

  function handleIncorrect(key: string) {
    setStatus("incorrect");
    setMistakes((m) => m + 1);
    if ("feedback" in step) {
      const map = step.feedback as Record<string, string> | undefined;
      setFeedback(map?.[key] ?? map?.default ?? "Not quite — try again.");
    } else {
      setFeedback("Not quite — try again.");
    }
  }

  function handleReset() {
    setStatus("active");
    setFeedback(null);
  }

  const handlers = { status, onCorrect: handleCorrect, onIncorrect: handleIncorrect, onReset: handleReset };

  if (finished) {
    const stars = starsForMistakes(finished.mistakes);
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          maxWidth: 480,
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <h1>Lesson complete!</h1>
        <p style={{ fontSize: 32, color: "#c68a00" }} aria-label={`${stars} of 3 stars`}>
          {"★".repeat(stars)}
          <span style={{ opacity: 0.3 }}>{"★".repeat(3 - stars)}</span>
        </p>
        <p role="status">+{finished.xp} XP</p>
        <Link href="/" style={{ padding: "10px 16px", background: "#4c3fd6", color: "#fff", borderRadius: 8 }}>
          Back to learning path
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 480, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, opacity: 0.7 }}>
        <span>{lesson.title}</span>
        <span aria-label={`${hearts} of ${START_HEARTS} hearts remaining`}>
          {"♥".repeat(hearts)}
          {"♡".repeat(START_HEARTS - hearts)}
        </span>
        <span>
          Step {stepIndex + 1} / {lesson.steps.length}
        </span>
      </div>

      {step.type === "explain" && <ExplainStep key={step.id} step={step} onAdvance={advance} />}

      {(step.type === "select-square" || step.type === "find-check" || step.type === "find-checkmate") && (
        <ClickSquareStep
          key={step.id}
          step={step}
          {...handlers}
          feedback={feedback}
          isLastStep={isLastStep}
          onAdvance={advance}
        />
      )}

      {(step.type === "move-piece" || step.type === "capture" || step.type === "find-legal-move") && (
        <MoveStep key={step.id} step={step} {...handlers} feedback={feedback} isLastStep={isLastStep} onAdvance={advance} />
      )}

      {step.type === "mcq" && (
        <McqStep key={step.id} step={step} {...handlers} feedback={feedback} isLastStep={isLastStep} onAdvance={advance} />
      )}

      {step.type === "true-false" && (
        <TrueFalseStep
          key={step.id}
          step={step}
          {...handlers}
          feedback={feedback}
          isLastStep={isLastStep}
          onAdvance={advance}
        />
      )}

      {step.type === "order-steps" && (
        <OrderStepsStep
          key={step.id}
          step={step}
          {...handlers}
          feedback={feedback}
          isLastStep={isLastStep}
          onAdvance={advance}
        />
      )}

      {step.type === "guided-sequence" && (
        <GuidedSequenceStep
          key={step.id}
          step={step}
          {...handlers}
          feedback={feedback}
          isLastStep={isLastStep}
          onAdvance={advance}
        />
      )}

      {step.type === "mini-game" && (
        <MiniGameStep
          key={step.id}
          step={step}
          status={status}
          onCorrect={handleCorrect}
          isLastStep={isLastStep}
          onAdvance={advance}
          engineRef={engineRef}
          engineReady={engineReady}
          engineError={engineError}
        />
      )}

      {step.type === "review" && <ReviewStep key={step.id} step={step} onAdvance={advance} />}
    </div>
  );
}
