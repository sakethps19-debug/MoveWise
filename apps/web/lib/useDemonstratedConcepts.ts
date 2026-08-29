"use client";

import { useEffect, useState } from "react";
import type { MasteryStatus } from "./masteryModel";
import { PROFICIENT_STATUSES } from "./masteryModel";
import { readPlacementResult } from "./placementProgress";

/**
 * The set of concept ids `statusOf`/`unlockReason`/PracticeHub's own
 * pool-unlock check treat as bypassing lesson prerequisites and the
 * principle-proficiency gate (lib/lessonStatus.ts) — never from a
 * completed lesson, only from real evidence: either a signed-in
 * UserConceptMastery row already at a PROFICIENT_STATUSES value (from
 * placement, from puzzle/game practice, or from lesson exercises — any
 * source), or a guest's locally-stored placement result. Guest read
 * happens after mount, same hydration-safe pattern as
 * useEffectiveCompletions.ts: the server's first paint (and a guest's
 * very first paint) has no local data yet.
 */
export function useDemonstratedConcepts(conceptMastery: Map<string, MasteryStatus> | null): Set<string> {
  const [guestDemonstrated, setGuestDemonstrated] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (conceptMastery === null) {
      setGuestDemonstrated(new Set(readPlacementResult()?.demonstratedConceptIds ?? []));
    }
  }, [conceptMastery]);

  if (conceptMastery !== null) {
    const demonstrated = new Set<string>();
    for (const [conceptId, status] of conceptMastery) {
      if (PROFICIENT_STATUSES.has(status)) demonstrated.add(conceptId);
    }
    return demonstrated;
  }
  return guestDemonstrated;
}
