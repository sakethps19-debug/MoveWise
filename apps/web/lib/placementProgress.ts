/**
 * Client-side-only persistence for a guest's placement-assessment result
 * (lib/placement.ts's `scorePlacement`) — same best-effort localStorage
 * pattern as guestProgress.ts/onboarding.ts, never thrown. A signed-in
 * learner's placement result instead becomes real UserConceptMastery
 * rows (app/actions.ts's `submitPlacementResultAction`), which already
 * flow through every existing conceptMastery-consuming surface; a guest
 * has no session for that table to attach to, so this is the guest-only
 * equivalent, reversible the same way (retaking the assessment just
 * overwrites this record) and cleared once signed in (migrateGuestProgress
 * covers lesson/game/practice data — this follows the same "don't let
 * stale guest data resurface after logout" rule).
 */

const PLACEMENT_KEY = "movewise_placement";

/**
 * P1 "for guests, persist a compatible versioned local representation":
 * a guest's stored record now carries the same evidence-grade fields a
 * signed-in learner's PlacementAttempt row does (packages/db/prisma/schema.prisma),
 * not just the flat summary — assessmentVersion, startedAt/completedAt,
 * itemResponses and conceptEvidence — so a guest's local history is
 * inspectable/correctable the same way, and a future assessment-version
 * bump can distinguish old records from new ones.
 */
export interface StoredPlacementResult {
  demonstratedConceptIds: string[];
  level: "new" | "beginner" | "intermediate" | "advanced";
  confidence: number;
  recommendedStartUnitId: "meet-the-pieces" | "check-and-checkmate" | "basic-tactics" | null;
  completedAt: number;
  assessmentVersion: number;
  startedAt: number;
  itemResponses: { itemId: string; correct: boolean }[];
  conceptEvidence: { conceptId: string; level: string; source: string }[];
  earlyExitReason: string | null;
}

export function readPlacementResult(): StoredPlacementResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PLACEMENT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as StoredPlacementResult) : null;
  } catch {
    return null;
  }
}

export function savePlacementResult(result: Omit<StoredPlacementResult, "completedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const stored: StoredPlacementResult = { ...result, completedAt: Date.now() };
    window.localStorage.setItem(PLACEMENT_KEY, JSON.stringify(stored));
  } catch {
    // Storage full or unavailable — the assessment result just won't be remembered.
  }
}

export function clearGuestPlacementResult(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PLACEMENT_KEY);
  } catch {
    // ignore
  }
}
