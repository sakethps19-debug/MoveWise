"use client";

import { useState } from "react";
import {
  saveOnboardingAnswers,
  skipOnboarding,
  type ChessExperience,
  type LearningGoal,
  type DailyMinutes,
} from "../lib/onboarding";

const EXPERIENCE_OPTIONS: { value: ChessExperience; label: string }[] = [
  { value: "new", label: "Completely new to chess" },
  { value: "knows-pieces", label: "I know how the pieces move" },
  { value: "casual", label: "Casual player" },
  { value: "rated", label: "Rated player" },
];
const GOAL_OPTIONS: { value: LearningGoal; label: string }[] = [
  { value: "from-scratch", label: "Learn chess from scratch" },
  { value: "stop-blundering", label: "Stop blundering pieces" },
  { value: "improve-tactics", label: "Improve my tactics" },
  { value: "improve-games", label: "Improve my complete games" },
];
const MINUTES_OPTIONS: DailyMinutes[] = [5, 10, 20];

/**
 * Lightweight, skippable, three-question onboarding (P1-A) — shown once,
 * only to a genuinely fresh learner (see LearningPath.tsx's gating), and
 * never blocking guest learning: "Skip for now" is visible on every step
 * and works identically to answering. Answers only shape which CTA and
 * copy the homepage leads with (see readOnboardingAnswers's callers) —
 * they never unlock or gate content, since nothing here is real evidence
 * of mastery the way an actual completed lesson is.
 */
export function OnboardingQuiz({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [experience, setExperience] = useState<ChessExperience | null>(null);
  const [goal, setGoal] = useState<LearningGoal | null>(null);

  function handleSkip() {
    skipOnboarding();
    onDone();
  }

  function finish(minutesPerDay: DailyMinutes) {
    if (!experience || !goal) {
      handleSkip(); // defensive — shouldn't be reachable without both set
      return;
    }
    saveOnboardingAnswers({ experience, goal, minutesPerDay });
    onDone();
  }

  return (
    <div className="mw-onboarding-card" role="region" aria-label="A few quick questions">
      <div className="mw-onboarding-progress">Step {step + 1} of 3</div>

      {step === 0 && (
        <>
          <h2 className="mw-onboarding-question">What&apos;s your chess experience?</h2>
          <div className="mw-onboarding-options">
            {EXPERIENCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className="mw-onboarding-option"
                onClick={() => {
                  setExperience(opt.value);
                  setStep(1);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <h2 className="mw-onboarding-question">What do you want to get out of MoveWise?</h2>
          <div className="mw-onboarding-options">
            {GOAL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className="mw-onboarding-option"
                onClick={() => {
                  setGoal(opt.value);
                  setStep(2);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button type="button" className="mw-onboarding-back" onClick={() => setStep(0)}>
            ← Back
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <h2 className="mw-onboarding-question">How much time can you commit each day?</h2>
          <div className="mw-onboarding-options">
            {MINUTES_OPTIONS.map((minutes) => (
              <button key={minutes} type="button" className="mw-onboarding-option" onClick={() => finish(minutes)}>
                {minutes} minutes a day
              </button>
            ))}
          </div>
          <button type="button" className="mw-onboarding-back" onClick={() => setStep(1)}>
            ← Back
          </button>
        </>
      )}

      <button type="button" className="mw-onboarding-skip" onClick={handleSkip}>
        Skip for now
      </button>
    </div>
  );
}
