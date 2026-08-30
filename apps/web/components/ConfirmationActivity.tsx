"use client";

import { useRef } from "react";
import type { Puzzle } from "@movewise/exercise-schema";
import { PuzzleRunner } from "./PuzzleRunner";
import { confirmConceptAction } from "../app/actions";
import { recordGuestConfirmedConcept } from "../lib/guestProgress";

/**
 * P1 "complete placement confirmation": the short, concept-specific check
 * offered from PracticeHub.tsx for a pool that's unlocked purely from an
 * inferred (never directly checked) placement signal
 * (lib/placementEvidence.ts's `inferred_high_confidence`). Reuses
 * PuzzleRunner's own solving UI rather than building a second one — this
 * is genuinely just "a few puzzles for this one concept", the same
 * interaction a puzzle pool already offers, with a different framing and
 * outcome (promoting evidence) instead of ordinary practice XP.
 *
 * Solving every puzzle without ever answering one wrong promotes the
 * concept to real, directly-demonstrated evidence (a UserConceptMastery
 * "proficient" row, or the guest-local equivalent) — the same standard a
 * placement item itself is held to. A single wrong answer along the way
 * means the activity ends without promoting anything: nothing is taken
 * away (the pool stays exactly as unlocked as it already was), it simply
 * doesn't get upgraded to confirmed — "never punish the learner for a
 * failed confirmation".
 */
export function ConfirmationActivity({
  puzzles,
  conceptId,
  conceptTitle,
  poolTitle,
  poolHref,
  isSignedIn,
}: {
  puzzles: Puzzle[];
  conceptId: string;
  conceptTitle: string;
  poolTitle: string;
  poolHref: string;
  isSignedIn: boolean;
}) {
  const correctCountRef = useRef(0);
  const everWrongRef = useRef(false);
  const finishedRef = useRef(false);

  function handleAttempt(_puzzleId: string, correct: boolean) {
    if (!correct) {
      everWrongRef.current = true;
      return;
    }
    correctCountRef.current += 1;
    if (correctCountRef.current < puzzles.length || finishedRef.current) return;
    finishedRef.current = true;
    const allCorrect = !everWrongRef.current;
    if (isSignedIn) {
      void confirmConceptAction(conceptId, allCorrect);
    } else if (allCorrect) {
      recordGuestConfirmedConcept(conceptId);
    }
  }

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
        completionTitle="Thanks — confirmed"
        completionMessage={`${conceptTitle} is now a directly demonstrated strength, not just an inferred one.`}
        completionHref={poolHref}
        completionLinkText={`Back to ${poolTitle}`}
      />
    </div>
  );
}
