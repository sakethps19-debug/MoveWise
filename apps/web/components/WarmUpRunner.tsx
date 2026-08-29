"use client";

import { useEffect, useMemo, useState } from "react";
import type { MasteryStatus } from "../lib/masteryModel";
import { frontierUnitId, pickWarmUpPuzzles, easierDifficulty, harderDifficulty, type WarmUpCandidate } from "../lib/warmUp";
import { readWarmUpDifficultyOverride, saveWarmUpDifficultyOverride, type WarmUpDifficultyPreference } from "../lib/warmUpProgress";
import { useDemonstratedConcepts } from "../lib/useDemonstratedConcepts";
import { PuzzleRunner } from "./PuzzleRunner";
import { recordPuzzleAttemptAction } from "../app/actions";

const DIFFICULTY_LABEL: Record<WarmUpDifficultyPreference, string> = { 1: "Easy", 2: "Medium", 3: "Hard" };

/**
 * P0 "personalize the Daily Warm-up": real, confirmed bug — this route
 * always served the exact same two king-move puzzles to every learner,
 * rated players included. `candidates` covers every curated unit's
 * puzzle pool (not just meet-the-pieces'), and `frontierUnitId` picks the
 * learner's actual current chapter from real evidence (placement result
 * or ordinary proficiency — lib/useDemonstratedConcepts.ts), the same
 * concept-level evidence lib/lessonStatus.ts's bypass already uses. A
 * manual difficulty selector and "Too easy"/"Too hard" feedback are
 * always available regardless of what was auto-selected.
 */
export function WarmUpRunner({
  candidates,
  units,
  conceptMastery,
  isSignedIn,
}: {
  candidates: WarmUpCandidate[];
  units: { id: string; principles: { conceptId: string }[] }[];
  conceptMastery: Map<string, MasteryStatus> | null;
  isSignedIn: boolean;
}) {
  const knownConceptIds = useDemonstratedConcepts(conceptMastery);
  const frontier = useMemo(() => frontierUnitId(units, knownConceptIds), [units, knownConceptIds]);
  const defaultDifficulty: WarmUpDifficultyPreference =
    frontier === "check-and-checkmate" ? 2 : frontier === "basic-tactics" ? 3 : 1;

  const [override, setOverride] = useState<WarmUpDifficultyPreference | null>(null);
  useEffect(() => {
    setOverride(readWarmUpDifficultyOverride());
  }, []);

  const difficulty = override ?? defaultDifficulty;

  function setDifficulty(next: WarmUpDifficultyPreference) {
    saveWarmUpDifficultyOverride(next);
    setOverride(next);
  }

  const poolForFrontier = candidates.filter((c) => c.unitId === frontier);
  const pool = poolForFrontier.length > 0 ? poolForFrontier : candidates;
  const puzzles = pickWarmUpPuzzles(pool, difficulty, 2);

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
