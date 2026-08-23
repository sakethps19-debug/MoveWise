"use client";

import { useEffect, useState } from "react";
import { clearGuestProgress, readGuestProgress } from "./guestProgress";

export type CompletionRecord = { xpEarned: number; mistakes: number; hintsUsed: number };

/**
 * Extracted from components/LearningPath.tsx so a second surface
 * (components/PracticeHub.tsx) can fall back to guest progress the same
 * way, instead of re-implementing the effect. Server-rendered
 * `completions` is only non-null for a signed-in user; for a guest, this
 * falls back to whatever this browser has recorded locally (read after
 * mount, so the first paint matches the server's guest render and avoids
 * a hydration mismatch). Once signed in, any lingering local guest data
 * has already been migrated into the account (migrateGuestProgress in
 * app/actions.ts) and is now stale, so it's cleared rather than left to
 * resurface after a future logout.
 */
export function useEffectiveCompletions(completions: Map<string, CompletionRecord> | null) {
  const [guestCompletions, setGuestCompletions] = useState<Map<string, CompletionRecord> | null>(null);

  useEffect(() => {
    if (completions === null) {
      setGuestCompletions(new Map(Object.entries(readGuestProgress())));
    } else {
      clearGuestProgress();
    }
  }, [completions]);

  const effectiveCompletions = completions ?? guestCompletions;
  const completedIds = effectiveCompletions ? new Set(effectiveCompletions.keys()) : null;
  return { effectiveCompletions, completedIds };
}
