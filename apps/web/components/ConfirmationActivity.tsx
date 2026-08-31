"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { Puzzle } from "@movewise/exercise-schema";
import { PuzzleRunner } from "./PuzzleRunner";
import { confirmConceptAction } from "../app/actions";
import { recordGuestConfirmedConcept, recordGuestContradictedConcept } from "../lib/guestProgress";
import { ReflectIcon, StepDoneIcon } from "./icons/StepIcons";

/**
 * P1 "make confirmation evidence meaningful": the short, concept-specific
 * check offered from PracticeHub.tsx for a pool that's unlocked purely
 * from an inferred (never directly checked) placement signal
 * (lib/placementEvidence.ts's `inferred_high_confidence`). Reuses
 * PuzzleRunner's own solving UI rather than building a second one.
 *
 * Solving every puzzle first-try (no wrong answer along the way)
 * upgrades the concept's evidence to `confirmation_passed` — a real
 * direct check, but deliberately never messaged as "mastered": lasting
 * skill mastery still only ever comes from computeMasteryStatus seeing
 * real accuracy over time (app/actions.ts's confirmConceptAction routes
 * these same attempts through that identical pipeline). A wrong answer
 * marks the concept `later_contradicted` instead — explained to the
 * learner as placement being *refined*, not as a failure — and points to
 * the concept's own lesson/practice pool, which stays exactly as
 * reachable as it already was either way.
 */
export function ConfirmationActivity({
  puzzles,
  conceptId,
  conceptTitle,
  poolTitle,
  poolHref,
  lessonHref,
  isSignedIn,
}: {
  puzzles: Puzzle[];
  conceptId: string;
  conceptTitle: string;
  poolTitle: string;
  poolHref: string;
  /** Where to send the learner to build this concept up for real, offered specifically when confirmation didn't pass. */
  lessonHref: string | null;
  isSignedIn: boolean;
}) {
  const correctCountRef = useRef(0);
  const finishedRef = useRef(false);
  const attemptsRef = useRef<{ puzzleId: string; correct: boolean }[]>([]);
  const [passed, setPassed] = useState<boolean | null>(null);

  function handleAttempt(puzzleId: string, correct: boolean) {
    attemptsRef.current.push({ puzzleId, correct });
    if (!correct) return;
    correctCountRef.current += 1;
    if (correctCountRef.current < puzzles.length || finishedRef.current) return;
    finishedRef.current = true;
    // First-try-perfect across every puzzle is the confirmation bar — the
    // same attempts array (wrong sub-attempts included) is still fully
    // persisted for the record either way.
    const attempts = attemptsRef.current;
    const wrongAttemptCount = attempts.filter((a) => !a.correct).length;
    const allFirstTry = wrongAttemptCount === 0;
    setPassed(allFirstTry);
    if (isSignedIn) {
      void confirmConceptAction(conceptId, attempts);
    } else if (allFirstTry) {
      recordGuestConfirmedConcept(conceptId);
    } else {
      recordGuestContradictedConcept(conceptId);
    }
  }

  const completionTitle = passed === false ? "Thanks — this needs a closer look" : "Thanks — confirmed";
  const completionMessage =
    passed === false
      ? `We're refining what we know about your placement here, not marking anything as failed. ${poolTitle} is still just as reachable — a bit more practice on ${conceptTitle.toLowerCase()} will help it stick.`
      : `${conceptTitle} is now a directly confirmed strength, not just an inferred one.`;
  // Two deliberately different tones for two honestly different outcomes —
  // success (green, a checkmark) vs. info (blue, a magnifying glass —
  // reusing the exact glyph TodayPlan's own "reflect" step uses, since
  // "needs a closer look" is the same idea) — never error/red, since a
  // failed confirmation is explicitly never framed as a failure.
  const completionIcon =
    passed === false ? (
      <span className="mw-completion-icon mw-completion-icon--info">
        <ReflectIcon />
      </span>
    ) : (
      <span className="mw-completion-icon mw-completion-icon--success">
        <StepDoneIcon />
      </span>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-4)", maxWidth: 600, margin: "0 auto" }}>
      <div className="mw-page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="mw-page-title" style={{ fontSize: 20 }}>
            Confirm: {conceptTitle}
          </h1>
          <p className="mw-page-subtitle">
            Your placement result unlocked &ldquo;{poolTitle}&rdquo; from a related pattern, not a direct check of{" "}
            {conceptTitle.toLowerCase()} itself. Solve these correctly to confirm it — {poolTitle} stays unlocked
            either way.
          </p>
        </div>
      </div>
      <PuzzleRunner
        puzzles={puzzles}
        principleTitle={conceptTitle}
        heading={`Confirm: ${conceptTitle}`}
        onAttempt={handleAttempt}
        completionTitle={completionTitle}
        completionMessage={completionMessage}
        completionHref={poolHref}
        completionLinkText={`Back to ${poolTitle}`}
        completionIcon={completionIcon}
      />
      {passed === false && lessonHref && (
        <p className="mw-page-subtitle" style={{ textAlign: "center" }}>
          <Link href={lessonHref} className="mw-btn mw-btn--ghost">
            Review the lesson for {conceptTitle.toLowerCase()}
          </Link>
        </p>
      )}
    </div>
  );
}
