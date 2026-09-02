"use client";

import { useEffect, useState } from "react";
import type { MasteryStatus } from "./masteryModel";
import { PROFICIENT_STATUSES } from "./masteryModel";
import { readPlacementResult } from "./placementProgress";
import {
  readGuestContradictingConceptIds,
  readGuestConfirmedConceptIds,
  readGuestConfirmationContradictedConceptIds,
} from "./guestProgress";

/**
 * The pure (non-hook) half of the guest-evidence computation below —
 * every synchronous localStorage read `useDemonstratedConcepts` needs for
 * a guest, factored out so a one-shot, non-reactive caller (e.g.
 * components/LessonGate.tsx's direct-URL route guard) can compute the
 * exact same demonstrated-concept set the reactive hook derives for
 * on-screen cards, without needing to be a hook itself or wait on an
 * extra render cycle. This is "the one availability resolver's" guest
 * evidence-gathering step — both `useDemonstratedConcepts` and
 * `LessonGate` must call this and nothing else, so the two can never
 * silently drift into different definitions of "demonstrated" for a
 * guest again the way they did before this function existed (the real,
 * confirmed bug: LessonGate used to check only literal lesson
 * completions, ignoring placement evidence entirely, so a lesson the
 * homepage correctly recommended as available still bounced a guest back
 * to "/" as locked).
 */
export function computeGuestDemonstratedConceptIds(): Set<string> {
  const placementDemonstrated = readPlacementResult()?.demonstratedConceptIds ?? [];
  // P1 "allow later evidence to correct an inaccurate placement":
  // a guest has no server-side mastery recompute to self-correct
  // through, so a concept with real, repeated wrong practice
  // attempts on this device overrides an earlier placement result —
  // see readGuestContradictingConceptIds's own doc comment.
  const contradicted = readGuestContradictingConceptIds();
  const confirmationContradicted = readGuestConfirmationContradictedConceptIds();
  const confirmed = readGuestConfirmedConceptIds();
  const demonstrated = new Set(
    placementDemonstrated.filter((id) => !contradicted.has(id) && !confirmationContradicted.has(id)),
  );
  for (const id of confirmed) demonstrated.add(id);
  return demonstrated;
}

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
export function useDemonstratedConcepts(
  conceptMastery: Map<string, MasteryStatus> | null,
  /** P1 "make confirmation evidence meaningful": a concept whose evidenceLevel is confirmation_passed (or another BYPASS_EVIDENCE_LEVELS value — see lib/placementEvidence.ts) counts as demonstrated even if `status` alone hasn't yet earned it through ordinary accuracy math. Optional and additive — every existing caller that doesn't pass this keeps its exact prior behavior. */
  evidenceLevels?: Map<string, string> | null,
): Set<string> {
  const [guestDemonstrated, setGuestDemonstrated] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (conceptMastery === null) {
      setGuestDemonstrated(computeGuestDemonstratedConceptIds());
    }
  }, [conceptMastery]);

  if (conceptMastery !== null) {
    const demonstrated = new Set<string>();
    for (const [conceptId, status] of conceptMastery) {
      if (PROFICIENT_STATUSES.has(status)) demonstrated.add(conceptId);
    }
    if (evidenceLevels) {
      for (const [conceptId, level] of evidenceLevels) {
        if (level === "confirmation_passed" || level === "directly_demonstrated" || level === "inferred_high_confidence") {
          demonstrated.add(conceptId);
        }
      }
    }
    return demonstrated;
  }
  return guestDemonstrated;
}
