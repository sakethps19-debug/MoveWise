/**
 * P1 "make placement evidence honest": replaces the earlier flat
 * "demonstrated or not" model (a Set<string> of concept ids, all treated
 * identically regardless of how they were established) with an explicit
 * evidence level per concept. The earlier model's specific dishonesty:
 * the foundational cluster granted every one of its ~10 concepts —
 * including king-movement and pawn-movement, which have no dedicated
 * placement item at all — from the same "2 of 4 items correct" signal
 * used for rook/bishop/queen/knight movement, which genuinely ARE
 * tested. Both were labeled identically "demonstrated." They aren't
 * equally certain, and shouldn't read as if they were.
 */

export type ConceptEvidenceLevel =
  /** This concept's own placement item (or real practice/lesson evidence) was answered correctly — a direct, specific check. */
  | "directly_demonstrated"
  /** Inferred from a cluster-level signal (the foundational movement cluster's 2-of-4 rule) — a reasonable inference, not a direct check of this specific concept. */
  | "inferred_high_confidence"
  /** No evidence either way — never tested, or tested and the result didn't clear any threshold. */
  | "unverified"
  /** Close to the inference threshold (exactly 1 of 4 foundational items correct) — worth a quick confirmation before fully trusting it, rather than silently unverified or silently granted. */
  | "needs_confirmation"
  /** An inferred concept was directly checked afterward (components/ConfirmationActivity.tsx) and passed — a real, if small, direct check, distinct from a full placement item but still a genuine upgrade over inference alone. Deliberately never conflated with `directly_demonstrated` sourced from placement itself, or with lasting skill mastery (apps/web/lib/masteryModel.ts's `status` field) — see confirmConceptAction's own doc comment. */
  | "confirmation_passed"
  /** Was previously directly_demonstrated, inferred_high_confidence, or confirmation_passed, but real subsequent evidence (practice, a lesson, a game, or a failed confirmation attempt) contradicted it. */
  | "later_contradicted";

export interface ConceptEvidence {
  conceptId: string;
  level: ConceptEvidenceLevel;
  /** What produced this evidence — which placement item(s), or "cluster-inference", or the practice/lesson/game source that later contradicted it. */
  source: string;
}

/** Evidence levels a lesson-prerequisite / pool-unlock bypass may trust — never `needs_confirmation`, `unverified`, or `later_contradicted`. */
export const BYPASS_EVIDENCE_LEVELS: ReadonlySet<ConceptEvidenceLevel> = new Set([
  "directly_demonstrated",
  "inferred_high_confidence",
  "confirmation_passed",
]);

/** Evidence levels whose gated content should show a one-time "confirm this" activity before being treated as fully trusted — inference alone, never a direct check. */
export const NEEDS_CONFIRMATION_LEVELS: ReadonlySet<ConceptEvidenceLevel> = new Set(["inferred_high_confidence"]);

export function conceptIdsAtOrAbove(
  evidence: ConceptEvidence[],
  levels: ReadonlySet<ConceptEvidenceLevel>,
): Set<string> {
  return new Set(evidence.filter((e) => levels.has(e.level)).map((e) => e.conceptId));
}

/**
 * Applies later, real evidence (a signed-in learner's current
 * UserConceptMastery, or a guest's locally-tracked wrong-attempt
 * concepts) on top of a placement's own recorded evidence — downgrading
 * any placement-inferred or placement-demonstrated concept that later
 * evidence contradicts to `later_contradicted`, so a stale placement
 * result never keeps insisting a concept is fine once real practice says
 * otherwise. Never upgrades — correcting a placement result upward
 * (e.g. a `needs_confirmation` concept later answered correctly in
 * practice) is handled by that practice's own evidence path directly
 * (UserConceptMastery, or the guest practice-attempt log), not by
 * rewriting old placement rows.
 */
export function applyContradictingEvidence(
  evidence: ConceptEvidence[],
  contradictedConceptIds: ReadonlySet<string>,
): ConceptEvidence[] {
  if (contradictedConceptIds.size === 0) return evidence;
  return evidence.map((e) =>
    contradictedConceptIds.has(e.conceptId) && e.level !== "later_contradicted"
      ? { ...e, level: "later_contradicted" as const, source: "contradicted-by-later-practice" }
      : e,
  );
}
