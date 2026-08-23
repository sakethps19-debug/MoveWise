"use client";

import { useState } from "react";
import Link from "next/link";
import type { ExplainStep as ExplainStepData, Puzzle } from "@movewise/exercise-schema";
import { ExplainStep } from "./exercises/ExplainStep";
import { PuzzleRunner } from "./PuzzleRunner";

/**
 * docs/learner-model.md's struggling-learner remediation flow, steps 2-4:
 * a shortened reteach (the struggling concept's own `explain` steps, not
 * the whole sub-lesson replayed — same "reuse existing content" move
 * ADR-0007's per-exercise recovery interstitial already makes one level
 * down), then a short round of easier puzzles, then a link back to retry
 * the real thing. Deliberately built from existing pieces (`ExplainStep`,
 * `PuzzleRunner`) rather than a new exercise type — this is that same
 * idea one level up, for a whole concept instead of one exercise.
 *
 * Step 5 ("explain what improved") is only partially implemented here:
 * `PuzzleRunner`'s own completion screen already reports how many
 * puzzles were solved, and `completionMessage` below adds the concept-
 * level framing, but detecting and narrating the actual struggling ->
 * recovered transition in the moment would need a mastery re-check this
 * component doesn't make — that transition surfaces naturally next time
 * the learner sees the learning path instead (the "Review needed"
 * section drops the principle, `MasteryBadge` shows "Recovered").
 */
export function RemediationRunner({
  reteachSteps,
  puzzles,
  principleTitle,
  retryHref,
  onAttempt,
}: {
  reteachSteps: ExplainStepData[];
  puzzles: Puzzle[];
  principleTitle: string;
  /** Where "try it again" sends the learner back to — the principle's first sub-lesson, since no principle has its own distinct mastery-challenge lesson today (only whole units do). */
  retryHref: string;
  onAttempt?: (puzzleId: string, correct: boolean) => void;
}) {
  const [reteachIndex, setReteachIndex] = useState(0);
  const [reteachDone, setReteachDone] = useState(reteachSteps.length === 0);

  if (!reteachDone) {
    const step = reteachSteps[reteachIndex];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-4)", maxWidth: 600, margin: "0 auto" }}>
        <div className="mw-lesson-header">
          <Link href="/" className="mw-lesson-exit" aria-label="Exit review">
            ✕ Exit
          </Link>
          <span className="mw-lesson-title">Review: {principleTitle}</span>
        </div>
        <p className="mw-recovery-note">
          A few recent attempts on {principleTitle} went wrong — here&apos;s a quick refresher before trying again.
        </p>
        {step && (
          <ExplainStep
            key={step.id}
            step={step}
            onAdvance={() => {
              if (reteachIndex + 1 < reteachSteps.length) setReteachIndex((i) => i + 1);
              else setReteachDone(true);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <PuzzleRunner
      puzzles={puzzles}
      principleTitle={principleTitle}
      heading={`Review: ${principleTitle}`}
      onAttempt={onAttempt}
      completionTitle="Nice work!"
      completionMessage={`You've reviewed the ideas behind ${principleTitle} — ready to try it again?`}
      completionHref={retryHref}
      completionLinkText="Try it again"
    />
  );
}
