"use client";

import { useEffect, useMemo, useState } from "react";
import type { MasteryStatus } from "../lib/masteryModel";
import { easierDifficulty, harderDifficulty, type WarmUpCandidate } from "../lib/warmUp";
import {
  readWarmUpDifficultyOverride,
  saveWarmUpDifficultyOverride,
  readRecentWarmUpPuzzleIds,
  recordWarmUpPuzzlesShown,
  type WarmUpDifficultyPreference,
} from "../lib/warmUpProgress";
import { readPlacementResult } from "../lib/placementProgress";
import { readGuestConceptMistakeCounts } from "../lib/guestProgress";
import { useDemonstratedConcepts } from "../lib/useDemonstratedConcepts";
import { rankConceptsForPractice, buildPracticeQueue, type ConceptPracticeSignal, type RankedConcept } from "../lib/practiceScheduler";
import { PuzzleRunner } from "./PuzzleRunner";
import { recordPuzzleAttemptAction } from "../app/actions";

const DIFFICULTY_LABEL: Record<WarmUpDifficultyPreference, string> = { 1: "Easy", 2: "Medium", 3: "Hard" };

/**
 * P1 "build real personalized practice": the queue is now built by
 * lib/practiceScheduler.ts's priority function — review due dates, recent
 * mistakes, mastery status, and placement-evidence confidence, not just
 * "which unit is the learner's current chapter" (the old `frontierUnitId`
 * approach this replaced). A signed-in learner's ranking is computed
 * server-side (app/practice/warm-up/page.tsx, real UserConceptMastery +
 * ExerciseAttempt + PlacementAttempt data) and passed in as
 * `rankedConcepts`; a guest has no session for that, so this component
 * builds the equivalent ranking client-side from their local placement
 * result and mistake counts (lib/placementProgress.ts, lib/guestProgress.ts).
 * A manual difficulty selector and "Too easy"/"Too hard" feedback are
 * still always available on top of whatever was auto-selected.
 */
export function WarmUpRunner({
  candidates,
  conceptMastery,
  rankedConcepts,
  isSignedIn,
}: {
  candidates: WarmUpCandidate[];
  conceptMastery: Map<string, MasteryStatus> | null;
  /** Precomputed server-side for a signed-in learner; null for a guest, whose ranking is instead computed below from local data. */
  rankedConcepts: RankedConcept[] | null;
  isSignedIn: boolean;
}) {
  const knownConceptIds = useDemonstratedConcepts(conceptMastery);
  const [guestRanked, setGuestRanked] = useState<RankedConcept[] | null>(null);

  useEffect(() => {
    if (rankedConcepts !== null) return; // signed-in: server already ranked
    const placement = readPlacementResult();
    const evidenceByConceptId = new Map((placement?.conceptEvidence ?? []).map((e) => [e.conceptId, e.level]));
    const mistakeCounts = readGuestConceptMistakeCounts();
    const conceptIds = [...new Set(candidates.map((c) => c.conceptId))];
    const signals: ConceptPracticeSignal[] = conceptIds.map((conceptId) => {
      const level = (evidenceByConceptId.get(conceptId) as ConceptPracticeSignal["placementEvidenceLevel"]) ?? null;
      // Confidence is per-concept (from this concept's own evidence level),
      // never the whole assessment's single overall confidence number —
      // otherwise an untested concept would wrongly inherit a rated
      // learner's high overall score and never surface for practice.
      const exerciseConfidence =
        level === "directly_demonstrated" || level === "inferred_high_confidence"
          ? 1
          : level === "needs_confirmation"
            ? 0.5
            : 0;
      return {
        conceptId,
        status: null,
        exerciseConfidence,
        lastPracticedAt: null,
        nextDueAt: null,
        placementEvidenceLevel: level,
        recentIncorrectCount: mistakeCounts[conceptId] ?? 0,
      };
    });
    setGuestRanked(rankConceptsForPractice(signals));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankedConcepts]);

  const effectiveRanked = rankedConcepts ?? guestRanked;

  const defaultDifficulty: WarmUpDifficultyPreference = useMemo(() => {
    // A learner with nothing demonstrated at all defaults to Easy; one who's
    // cleared every foundational concept defaults to Hard — same "roughly
    // matches the learner's real level" intent `frontierUnitId` served
    // before, derived here from demonstrated-concept coverage instead of a
    // single current unit.
    const totalConcepts = new Set(candidates.map((c) => c.conceptId)).size;
    if (totalConcepts === 0) return 1;
    const knownFraction = [...knownConceptIds].filter((id) => candidates.some((c) => c.conceptId === id)).length / totalConcepts;
    return knownFraction >= 0.7 ? 3 : knownFraction >= 0.3 ? 2 : 1;
  }, [candidates, knownConceptIds]);

  const [override, setOverride] = useState<WarmUpDifficultyPreference | null>(null);
  useEffect(() => {
    setOverride(readWarmUpDifficultyOverride());
  }, []);

  const difficulty = override ?? defaultDifficulty;

  function setDifficulty(next: WarmUpDifficultyPreference) {
    saveWarmUpDifficultyOverride(next);
    setOverride(next);
  }

  const [recentlySeen, setRecentlySeen] = useState<Set<string>>(new Set());
  useEffect(() => {
    setRecentlySeen(readRecentWarmUpPuzzleIds());
  }, []);

  const queue = useMemo(
    () =>
      effectiveRanked
        ? buildPracticeQueue(candidates, effectiveRanked, { count: 2, preferredDifficulty: difficulty, recentlySeenPuzzleIds: recentlySeen })
        : [],
    [candidates, effectiveRanked, difficulty, recentlySeen],
  );
  const puzzles = queue.map((q) => q.puzzle);

  useEffect(() => {
    if (puzzles.length > 0) recordWarmUpPuzzlesShown(puzzles.map((p) => p.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzles.map((p) => p.id).join(",")]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-4)", maxWidth: 600, margin: "0 auto" }}>
      <div className="mw-warmup-controls">
        <span className="mw-page-subtitle" style={{ margin: 0 }}>
          Difficulty:
        </span>
        <div role="group" aria-label="Warm-up difficulty" style={{ display: "flex", gap: "var(--mw-space-2)" }}>
          {([1, 2, 3] as const).map((d) => (
            <button
              key={d}
              type="button"
              className={`mw-btn mw-btn--ghost mw-warmup-difficulty-btn${d === difficulty ? " mw-warmup-difficulty-btn--active" : ""}`}
              aria-pressed={d === difficulty}
              onClick={() => setDifficulty(d)}
            >
              {DIFFICULTY_LABEL[d]}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "var(--mw-space-2)" }}>
          <button type="button" className="mw-btn mw-btn--ghost" onClick={() => setDifficulty(easierDifficulty(difficulty))}>
            Too hard
          </button>
          <button type="button" className="mw-btn mw-btn--ghost" onClick={() => setDifficulty(harderDifficulty(difficulty))}>
            Too easy
          </button>
        </div>
      </div>

      {queue.length > 0 && (
        <p className="mw-page-subtitle mw-warmup-reason" style={{ margin: 0 }}>
          Today&apos;s pick: {queue[0]!.reason}
        </p>
      )}

      {puzzles.length === 0 ? (
        <p className="mw-feedback mw-feedback--error">No warm-up puzzles are available yet.</p>
      ) : (
        <PuzzleRunner
          key={puzzles.map((p) => p.id).join(",")}
          puzzles={puzzles}
          principleTitle="Daily warm-up"
          onAttempt={isSignedIn ? recordPuzzleAttemptAction : undefined}
          isWarmUp
        />
      )}
    </div>
  );
}
