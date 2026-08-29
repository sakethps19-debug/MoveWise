"use client";

import { useState } from "react";
import Link from "next/link";
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

type Step = "experience" | "path" | "goal" | "minutes";

/**
 * Onboarding (P1-A, expanded for P0's "functional onboarding paths"):
 * shown once, only to a genuinely fresh learner (see LearningPath.tsx's
 * gating), never blocking guest learning — "Skip for now" is visible on
 * every step and works identically to answering.
 *
 * A learner who says they're a casual or rated player gets a real branch
 * here (the "path" step below) — a placement assessment, a game to
 * analyze, jumping straight to tactics practice, or reviewing fundamentals
 * voluntarily — never just a secondary link alongside the same "Welcome
 * to the chessboard" everyone else sees. Every option here is something
 * this app can actually do today (no PGN-import step is offered — that
 * doesn't exist yet, and offering it would repeat the exact kind of
 * broken promise this pass exists to fix).
 *
 * None of these choices unlock or gate content by themselves — self-
 * reporting "rated player" never does that (see lib/onboarding.ts's own
 * doc comment). Only a placement assessment's actual answers
 * (lib/placement.ts) or real practice ever bypass a lesson prerequisite.
 */
export function OnboardingQuiz({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>("experience");
  const [experience, setExperience] = useState<ChessExperience | null>(null);
  const [goal, setGoal] = useState<LearningGoal | null>(null);
  const [ratingInput, setRatingInput] = useState("");

  function handleSkip() {
    skipOnboarding();
    onDone();
  }

  function parsedRating(): number | undefined {
    const n = Number(ratingInput);
    return ratingInput.trim() !== "" && Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
  }

  /** Used by the "path" step's direct-navigation options — saves what we know so far (with sensible defaults for the questions this learner chose to skip) before leaving the quiz entirely, so it doesn't reappear next visit. */
  function saveAndLeave() {
    if (!experience) return;
    saveOnboardingAnswers({
      experience,
      goal: goal ?? "improve-games",
      minutesPerDay: 10,
      approximateRating: parsedRating(),
    });
  }

  function finish(minutesPerDay: DailyMinutes) {
    if (!experience || !goal) {
      handleSkip(); // defensive — shouldn't be reachable without both set
      return;
    }
    saveOnboardingAnswers({ experience, goal, minutesPerDay, approximateRating: parsedRating() });
    onDone();
  }

  const showsPathStep = experience === "casual" || experience === "rated";
  const stepNumber = { experience: 1, path: 2, goal: showsPathStep ? 3 : 2, minutes: showsPathStep ? 4 : 3 }[step];
  const totalSteps = showsPathStep ? 4 : 3;

  return (
    <div className="mw-onboarding-card" role="region" aria-label="A few quick questions">
      <div className="mw-onboarding-progress">
        Step {stepNumber} of {totalSteps}
      </div>

      {step === "experience" && (
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
                  setStep(opt.value === "casual" || opt.value === "rated" ? "path" : "goal");
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}

      {step === "path" && (
        <>
          <h2 className="mw-onboarding-question">
            {experience === "rated" ? "How would you like to start?" : "Want to skip ahead?"}
          </h2>
          <p className="mw-page-subtitle" style={{ marginBottom: "var(--mw-space-3)" }}>
            None of these unlock anything by themselves — a placement assessment&apos;s real answers do, the rest are just
            ways to get where you want faster.
          </p>
          <div className="mw-onboarding-options">
            <Link href="/placement" className="mw-onboarding-option" onClick={saveAndLeave}>
              Take a placement assessment (recommended)
            </Link>
            <Link href="/play" className="mw-onboarding-option" onClick={saveAndLeave}>
              Play a game — we&apos;ll analyze it after
            </Link>
            <Link href="/practice" className="mw-onboarding-option" onClick={saveAndLeave}>
              Start with tactics practice
            </Link>
            <Link href="/learn/meet-the-pieces.01-welcome" className="mw-onboarding-option" onClick={saveAndLeave}>
              Review the fundamentals
            </Link>
            <button type="button" className="mw-onboarding-option" onClick={() => setStep("goal")}>
              Just ask me a couple quick questions
            </button>
          </div>

          {experience === "rated" && (
            <div style={{ marginTop: "var(--mw-space-4)" }}>
              <label htmlFor="mw-onboarding-rating" className="mw-page-subtitle" style={{ display: "block", marginBottom: "var(--mw-space-2)" }}>
                Approximate rating (optional — any platform or OTB, no username needed)
              </label>
              <input
                id="mw-onboarding-rating"
                type="number"
                inputMode="numeric"
                min={0}
                max={3500}
                placeholder="e.g. 1200"
                value={ratingInput}
                onChange={(e) => setRatingInput(e.target.value)}
                className="mw-onboarding-rating-input"
              />
            </div>
          )}

          <button type="button" className="mw-onboarding-back" onClick={() => setStep("experience")}>
            ← Back
          </button>
        </>
      )}

      {step === "goal" && (
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
                  setStep("minutes");
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button type="button" className="mw-onboarding-back" onClick={() => setStep(showsPathStep ? "path" : "experience")}>
            ← Back
          </button>
        </>
      )}

      {step === "minutes" && (
        <>
          <h2 className="mw-onboarding-question">How much time can you commit each day?</h2>
          <div className="mw-onboarding-options">
            {MINUTES_OPTIONS.map((minutes) => (
              <button key={minutes} type="button" className="mw-onboarding-option" onClick={() => finish(minutes)}>
                {minutes} minutes a day
              </button>
            ))}
          </div>
          <button type="button" className="mw-onboarding-back" onClick={() => setStep("goal")}>
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
