"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Lesson } from "@movewise/exercise-schema";
import { useStockfishEngine } from "../lib/useStockfishEngine";
import { starsForPerformance, starsExplanation } from "../lib/mastery";
import { recordGuestCompletion } from "../lib/guestProgress";
import { markLessonStarted, clearLessonStarted } from "../lib/lessonProgressUI";
import { recordCompletionToday } from "../lib/streak";
import { Hearts } from "./ui/Hearts";
import { Stars } from "./ui/Stars";
import { Button } from "./ui/Button";
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

/** One row per exercise attempt — see ADR-0008/docs/learner-model.md and packages/db's ExerciseAttempt model. */
export interface AttemptRecord {
  stepId: string;
  correct: boolean;
  wrongAnswerKey: string | null;
}

interface LessonRunnerProps {
  lesson: Lesson;
  onComplete?: (xpEarned: number, mistakes: number, hintsUsed: number, attempts: AttemptRecord[]) => void;
  /** True when there's no signed-in session — persists this completion to localStorage instead of the DB. */
  isGuest?: boolean;
}

const START_HEARTS = 5;
/** Hearts restored after a learner completes the zero-heart recovery review — a partial refill, not a full reset. */
const RECOVERY_HEARTS = 3;

/**
 * Thin orchestrator: owns step navigation, status/feedback, XP, mistake
 * count, and hearts — all shared across exercise types. Each exercise
 * type's own interaction logic (and any per-step local state, e.g. a
 * guided-sequence's mutating board) lives in its own component under
 * exercises/, keyed by step.id so it remounts fresh on every new step
 * instead of needing manual reset effects.
 *
 * Hearts are a supportive signal, not a hard lockout — this is a
 * beginner-focused learning product, and a hard block on wrong answers
 * would be punitive, not supportive, for the audience it's for. Reaching
 * zero hearts instead triggers a guided recovery interstitial (below):
 * a brief reteach pulled from the lesson's own most recent explanation,
 * then the same exercise again once hearts are partially restored — the
 * "recovery exercise" is a real retry with fresh context, not a new
 * content type authored per-lesson.
 */
export function LessonRunner({ lesson, onComplete, isGuest }: LessonRunnerProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [status, setStatus] = useState<StepStatus>("active");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [xpEarned, setXpEarned] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [recovering, setRecovering] = useState(false);
  const [finished, setFinished] = useState<{ xp: number; mistakes: number; hintsUsed: number } | null>(null);

  const step = lesson.steps[stepIndex];
  const isLastStep = stepIndex === lesson.steps.length - 1;
  const hearts = Math.max(0, START_HEARTS - mistakes);

  // Phase 4's "in progress" learning-path status: a pure UI signal, not a
  // progress record (see lib/lessonProgressUI.ts) — marked as soon as a
  // learner opens the lesson, cleared once they actually finish it.
  useEffect(() => {
    markLessonStarted(lesson.id);
  }, [lesson.id]);

  const reteachText = useMemo(() => {
    for (let i = stepIndex; i >= 0; i--) {
      const s = lesson.steps[i];
      if (s?.type === "explain") return s.text;
    }
    return lesson.objectives[0] ?? "Take a moment to review this concept before trying again.";
  }, [lesson, stepIndex]);

  const hasMiniGame = useMemo(() => lesson.steps.some((s) => s.type === "mini-game"), [lesson]);
  const { engineRef, ready: engineReady, error: engineError } = useStockfishEngine(hasMiniGame);

  function advance() {
    setStatus("active");
    setFeedback(null);
    if (isLastStep) {
      const totalXp = xpEarned + lesson.xpReward;
      onComplete?.(totalXp, mistakes, hintsUsed, attempts);
      if (isGuest) recordGuestCompletion(lesson.id, totalXp, mistakes, hintsUsed);
      clearLessonStarted(lesson.id);
      recordCompletionToday();
      setFinished({ xp: totalXp, mistakes, hintsUsed });
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  function handleCorrect(xp: number) {
    setStatus("correct");
    setFeedback(null);
    setXpEarned((v) => v + xp);
    setAttempts((a) => [...a, { stepId: step.id, correct: true, wrongAnswerKey: null }]);
  }

  function handleIncorrect(key: string) {
    setAttempts((a) => [...a, { stepId: step.id, correct: false, wrongAnswerKey: key }]);
    const newMistakes = mistakes + 1;
    setMistakes(newMistakes);
    if (START_HEARTS - newMistakes <= 0) {
      // Hearts just hit zero — go straight to guided recovery instead of
      // showing ordinary wrong-answer feedback the learner would just
      // retry past without a reset.
      setRecovering(true);
      setStatus("active");
      setFeedback(null);
      return;
    }
    setStatus("incorrect");
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

  function handleHintUsed() {
    setHintsUsed((h) => h + 1);
  }

  function handleRecoveryComplete() {
    setMistakes(START_HEARTS - RECOVERY_HEARTS);
    setRecovering(false);
    setStatus("active");
    setFeedback(null);
  }

  const handlers = {
    status,
    onCorrect: handleCorrect,
    onIncorrect: handleIncorrect,
    onReset: handleReset,
    onHintUsed: handleHintUsed,
  };

  if (finished) {
    const stars = starsForPerformance(finished.mistakes, finished.hintsUsed);
    return (
      <div className="mw-completion" style={{ maxWidth: 440, margin: "var(--mw-space-7) auto" }}>
        <h1 className="mw-completion-title">Lesson complete!</h1>
        <div className="mw-completion-stars">
          <Stars count={stars} />
        </div>
        <p className="mw-completion-explanation">{starsExplanation(finished.mistakes, finished.hintsUsed)}</p>
        <p role="status" className="mw-completion-xp">
          +{finished.xp} XP
        </p>
        <Link href="/" className="mw-btn mw-btn--primary mw-btn--full">
          Back to learning path
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-4)", maxWidth: 600, margin: "0 auto" }}>
      <div className="mw-lesson-header">
        <Link href="/" className="mw-lesson-exit" aria-label="Exit lesson">
          ✕ Exit
        </Link>
        <span className="mw-lesson-title">{lesson.title}</span>
        <Hearts current={hearts} max={START_HEARTS} />
        <span className="mw-lesson-step-count">
          Step {stepIndex + 1}/{lesson.steps.length}
        </span>
      </div>

      {stepIndex === 0 && !recovering && (
        <p className="mw-lesson-objective">
          <strong>By the end of this lesson, you&apos;ll be able to</strong> {lesson.objectives[0]}
        </p>
      )}

      {recovering ? (
        <div role="status" className="mw-recovery">
          <h2>Let&apos;s review before continuing</h2>
          <p>{reteachText}</p>
          <p className="mw-recovery-note">
            You've used up your hearts on this lesson, but that's alright — a couple of hearts will come back so you
            can try this exercise again with the idea fresh.
          </p>
          <Button onClick={handleRecoveryComplete}>Try again</Button>
        </div>
      ) : (
        <>
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
            <MoveStep
              key={step.id}
              step={step}
              {...handlers}
              feedback={feedback}
              isLastStep={isLastStep}
              onAdvance={advance}
            />
          )}

          {step.type === "mcq" && (
            <McqStep
              key={step.id}
              step={step}
              {...handlers}
              feedback={feedback}
              isLastStep={isLastStep}
              onAdvance={advance}
            />
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
        </>
      )}
    </div>
  );
}
