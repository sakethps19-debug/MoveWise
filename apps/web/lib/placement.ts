import {
  conceptIdsAtOrAbove,
  BYPASS_EVIDENCE_LEVELS,
  type ConceptEvidence,
} from "./placementEvidence";

/**
 * P0 "real placement assessment": a rated or casual player who says so at
 * onboarding gets ~14 adaptive interactions (packages/content/puzzles/placement.json,
 * reusing the existing Puzzle schema — no new content type) instead of being
 * forced through piece-movement lessons before reaching anything that
 * respects their stated level.
 *
 * Deliberately small, honest adaptivity: with a 14-item bank, "adaptive"
 * means *which* items are shown, not fine-grained difficulty search. The
 * foundational tier (board/piece-movement recognition) is asked as a
 * cluster of 4 items rather than one per piece — a rated player answers a
 * couple of these correctly and the whole cluster is granted, instead of
 * being quizzed on how a rook moves one exercise at a time. The core tier
 * (check/mate/hanging pieces/forks/castling/decision-making) is the real
 * discriminator; a learner who struggles there never reaches the advanced
 * tier (calculation, opening principles, elementary endgames) at all — the
 * assessment ends early and recommends starting around the fundamentals,
 * rather than asking undiscriminating advanced questions of someone who
 * isn't ready for them.
 *
 * Scoring never grants a concept "demonstrated" from a single lucky guess:
 * a core/advanced-tier concept needs its own item answered correctly
 * (these are real single-concept checks, not trivial recognition), while
 * the *whole* foundational cluster needs at least 2 of its 4 items right
 * before any of its concepts count — one correct answer out of four is
 * exactly the "lucky answer" case the product brief calls out to guard
 * against.
 */

export type PlacementTier = "foundational" | "core" | "advanced";

export interface PlacementItemMeta {
  id: string;
  tier: PlacementTier;
  conceptIds: string[];
}

/**
 * Static ordering/grouping metadata for packages/content/puzzles/placement.json's
 * 14 items. Kept separate from the content file itself (whose `difficulty`
 * field describes each puzzle's own inherent difficulty honestly, 1-3) —
 * this tiering is about assessment *sequencing*, a different axis.
 */
export const PLACEMENT_ITEMS: PlacementItemMeta[] = [
  { id: "placement.movement-rook", tier: "foundational", conceptIds: ["rook-movement", "captures", "blocked-paths"] },
  { id: "placement.movement-bishop", tier: "foundational", conceptIds: ["bishop-movement"] },
  { id: "placement.movement-queen", tier: "foundational", conceptIds: ["queen-movement"] },
  { id: "placement.movement-knight", tier: "foundational", conceptIds: ["knight-movement"] },
  { id: "placement.recognize-check", tier: "core", conceptIds: ["check"] },
  { id: "placement.recognize-checkmate", tier: "core", conceptIds: ["checkmate"] },
  { id: "placement.hanging-piece", tier: "core", conceptIds: ["hanging-pieces"] },
  { id: "placement.knight-fork", tier: "core", conceptIds: ["knight-fork", "fork", "tactics"] },
  { id: "placement.king-safety-castling", tier: "core", conceptIds: ["king-safety-castling"] },
  { id: "placement.decision-capture-checker", tier: "core", conceptIds: ["decision-making"] },
  { id: "placement.trade-evaluation", tier: "advanced", conceptIds: ["trade-evaluation", "piece-values"] },
  { id: "placement.opening-development", tier: "advanced", conceptIds: ["queen-development-timing"] },
  { id: "placement.back-rank-safety", tier: "advanced", conceptIds: ["back-rank-safety"] },
  /**
   * P0 "honest placement evidence": this item's own conceptIds used to be
   * just `["opposition-key-squares"]` — a real, reproduced overclaim. The
   * accepted move (Kf6, walking the king in front of its own pawn) is a
   * single elementary escort move — real evidence for the narrower
   * `pawn-escort-technique` concept, but it is not a genuine test of real
   * opposition/key-square theory (corresponding squares, taking the
   * opposition, distant opposition) — that concept has its own dedicated
   * lesson (basic-tactics.05-the-opposition) and must be earned there, not
   * granted from this one move. Before this fix, a learner who passed
   * this single elementary item got `opposition-key-squares` marked
   * directly_demonstrated, which silently bypassed that entire lesson via
   * the demonstratedConceptIds prerequisite/pool-unlock bypass — "one
   * elementary Kf6 move must not certify comprehensive opposition
   * knowledge" (P0 requirement), and a real curriculum-skip, not just a
   * cosmetic mislabeling.
   *
   * Deliberately does NOT also attach `king-movement` here, even though
   * the accepted move is a real king move: king-movement already has a
   * safe, honest evidence source (the foundational cluster's 2-of-4
   * inference), and coupling it to THIS item's own pass/fail turned out to
   * actively regress that — a wrong answer here (e.g. moving the king
   * sideways instead of escorting) is very often still a fully legal king
   * move, but scorePlacement's per-item loop marks every one of an
   * incorrectly-answered item's conceptIds "unverified" and permanently
   * excludes them from the cluster-level fallback (`answeredDirectlyConceptIds`),
   * regardless of whether the *underlying mechanic* was actually
   * demonstrated. Confirmed live via e2e: a learner who aced all 4
   * foundational movement items (genuinely demonstrating king-movement)
   * but missed this one advanced judgment item lost king-movement's
   * cluster-inferred credit entirely, silently regressing the homepage's
   * "Meet the king" lesson from bypassed back to recommended. A concept
   * should only ever gain a *new*, more direct evidence source here — it
   * must never let an unrelated item's wrong answer erase evidence a
   * different, already-passed item legitimately established.
   */
  { id: "placement.endgame-king-escort", tier: "advanced", conceptIds: ["pawn-escort-technique"] },
];

/**
 * Every concept the foundational cluster's 4 items collectively stand in
 * for — including king/pawn movement and board-reading concepts that have
 * no dedicated placement item, since those are a strict subset of the
 * skill the 4 tested pieces already demonstrate (a learner who can capture
 * a blocking pawn with a rook and navigate a bishop's diagonal can read a
 * board well enough to move a king or pawn one square).
 */
const FOUNDATIONAL_CLUSTER_CONCEPTS = [
  "board-orientation",
  "square-identification",
  "rook-movement",
  "bishop-movement",
  "queen-movement",
  "knight-movement",
  "king-movement",
  "pawn-movement",
  "captures",
  "blocked-paths",
];

/** How many of the 4 foundational items must be answered correctly before the whole cluster counts as demonstrated — never fewer than 2, so one lucky guess can't grant it. */
const FOUNDATIONAL_PASS_COUNT = 2;

/** Consecutive wrong core-tier answers that end the assessment early rather than continuing into the advanced tier a struggling learner isn't ready for. */
const CORE_EARLY_EXIT_STREAK = 3;

const ITEMS_BY_ID = new Map(PLACEMENT_ITEMS.map((item) => [item.id, item]));
const FOUNDATIONAL_IDS = PLACEMENT_ITEMS.filter((i) => i.tier === "foundational").map((i) => i.id);
const CORE_IDS = PLACEMENT_ITEMS.filter((i) => i.tier === "core").map((i) => i.id);
const ADVANCED_IDS = PLACEMENT_ITEMS.filter((i) => i.tier === "advanced").map((i) => i.id);

export interface PlacementAnswer {
  itemId: string;
  correct: boolean;
}

/**
 * Given every answer so far (in order), returns the next item id to show,
 * or `null` once the assessment is complete — either every item has been
 * asked, or the core-tier early-exit rule fired.
 */
export function nextPlacementItemId(answers: PlacementAnswer[]): string | null {
  const answeredIds = new Set(answers.map((a) => a.itemId));

  const nextFoundational = FOUNDATIONAL_IDS.find((id) => !answeredIds.has(id));
  if (nextFoundational) return nextFoundational;

  // Core tier: stop early if the last CORE_EARLY_EXIT_STREAK core answers
  // (not counting foundational ones) were all wrong — this learner isn't
  // ready for core-tier content yet, let alone advanced.
  const coreAnswersSoFar = answers.filter((a) => CORE_IDS.includes(a.itemId));
  if (coreAnswersSoFar.length >= CORE_EARLY_EXIT_STREAK) {
    const lastN = coreAnswersSoFar.slice(-CORE_EARLY_EXIT_STREAK);
    if (lastN.every((a) => !a.correct)) return null;
  }

  const nextCore = CORE_IDS.find((id) => !answeredIds.has(id));
  if (nextCore) return nextCore;

  // Only enter the advanced tier if the learner did reasonably well on
  // core — otherwise end the assessment rather than asking calculation/
  // opening-principle/endgame questions of someone still shaky on
  // check/checkmate/hanging pieces.
  const coreCorrect = coreAnswersSoFar.filter((a) => a.correct).length;
  if (coreCorrect < Math.ceil(CORE_IDS.length / 2)) return null;

  return ADVANCED_IDS.find((id) => !answeredIds.has(id)) ?? null;
}

export type PlacementLevel = "new" | "beginner" | "intermediate" | "advanced";

export interface PlacementResult {
  /** Concepts at directly_demonstrated or inferred_high_confidence evidence level — safe to write as UserConceptMastery "proficient" rows and to bypass lesson-prerequisite/pool-unlock checks for, without ever calling them "completed". Derived from `conceptEvidence`; kept for callers that only need the flat unlock set. */
  demonstratedConceptIds: string[];
  /** The full per-concept evidence-level breakdown — see lib/placementEvidence.ts's ConceptEvidence for what each level means and why untested foundational-cluster members (king/pawn movement) are never conflated with a concept whose own item was actually answered. */
  conceptEvidence: ConceptEvidence[];
  level: PlacementLevel;
  /** 0-1 — how many of the items actually answered (not skipped by early exit) were correct. */
  confidence: number;
  /** Which unit's lessons this learner should still be offered to review voluntarily, even though nothing forces them through it — always non-null; reviewing fundamentals is always available. */
  recommendedReviewUnitId: string;
  /** The unit whose practice pools should unlock immediately from this result, or null if even the foundational cluster wasn't demonstrated (recommend starting from the beginning instead). */
  recommendedStartUnitId: "meet-the-pieces" | "check-and-checkmate" | "basic-tactics" | null;
  itemsAnswered: number;
  itemsCorrect: number;
}

/** Every concept id any placement item (foundational cluster included) can produce evidence about — the universe `scorePlacement` reports a `ConceptEvidence` row for, so a concept never tested at all is still explicitly "unverified" rather than silently absent. */
const ALL_EVIDENCE_CONCEPT_IDS: string[] = Array.from(
  new Set([...FOUNDATIONAL_CLUSTER_CONCEPTS, ...PLACEMENT_ITEMS.flatMap((i) => i.conceptIds)]),
);

/**
 * Pure scoring function — no I/O, fully unit-testable. Never marks a
 * concept `directly_demonstrated` from a single foundational-tier guess
 * (see FOUNDATIONAL_PASS_COUNT) — the foundational cluster's own
 * concepts are always `inferred_high_confidence` at best (a cluster-level
 * inference), even at a perfect 4/4, since no foundational item tests
 * any *individual* concept on its own; every core/advanced item that
 * *was* asked and answered correctly directly demonstrates its own
 * concept(s), since those are genuine single-concept checks.
 */
export function scorePlacement(answers: PlacementAnswer[]): PlacementResult {
  const evidenceByConceptId = new Map<string, ConceptEvidence>(
    ALL_EVIDENCE_CONCEPT_IDS.map((conceptId) => [conceptId, { conceptId, level: "unverified", source: "not-asked" }]),
  );

  // Direct, per-item evidence first — including foundational-tier items:
  // rook/bishop/queen/knight movement each have their own dedicated item,
  // so a correct answer directly demonstrates THAT concept specifically,
  // exactly like a core/advanced item does. Only concepts with no
  // dedicated item at all (king-movement, pawn-movement, board-
  // orientation, square-identification, captures, blocked-paths) are left
  // for the cluster-level inference below to fill in — this is the exact
  // distinction the earlier "2 of 4 grants the whole cluster" model
  // erased by treating every cluster concept identically regardless of
  // whether it was actually asked about.
  const answeredDirectlyConceptIds = new Set<string>();
  for (const answer of answers) {
    const item = ITEMS_BY_ID.get(answer.itemId);
    if (!item) continue;
    for (const conceptId of item.conceptIds) {
      answeredDirectlyConceptIds.add(conceptId);
      evidenceByConceptId.set(conceptId, {
        conceptId,
        level: answer.correct ? "directly_demonstrated" : "unverified",
        source: answer.itemId,
      });
    }
  }

  const foundationalAnswers = answers.filter((a) => FOUNDATIONAL_IDS.includes(a.itemId));
  const foundationalCorrect = foundationalAnswers.filter((a) => a.correct).length;
  // Only fill in concepts with no dedicated item at all — one that WAS
  // directly asked about (correct or not) keeps its own direct evidence;
  // a cluster-level inference must never overwrite a concept we have
  // real, specific evidence is actually wrong.
  const untestedClusterConcepts = FOUNDATIONAL_CLUSTER_CONCEPTS.filter(
    (conceptId) => !answeredDirectlyConceptIds.has(conceptId),
  );
  if (foundationalCorrect >= FOUNDATIONAL_PASS_COUNT) {
    for (const conceptId of untestedClusterConcepts) {
      evidenceByConceptId.set(conceptId, {
        conceptId,
        level: "inferred_high_confidence",
        source: `foundational-cluster (${foundationalCorrect}/${FOUNDATIONAL_IDS.length} correct)`,
      });
    }
  } else if (foundationalCorrect === 1 && foundationalAnswers.length === FOUNDATIONAL_IDS.length) {
    // One correct out of four — too close to the inference threshold to
    // call "unverified" outright, but not enough to trust either. Only
    // meaningful once every foundational item has actually been asked
    // (an early state with fewer answers so far isn't "1 of 4 final").
    for (const conceptId of untestedClusterConcepts) {
      evidenceByConceptId.set(conceptId, {
        conceptId,
        level: "needs_confirmation",
        source: `foundational-cluster (1/${FOUNDATIONAL_IDS.length} correct)`,
      });
    }
  }

  const conceptEvidence = Array.from(evidenceByConceptId.values());
  const demonstrated = conceptIdsAtOrAbove(conceptEvidence, BYPASS_EVIDENCE_LEVELS);

  const coreAnswers = answers.filter((a) => CORE_IDS.includes(a.itemId));
  const advancedAnswers = answers.filter((a) => ADVANCED_IDS.includes(a.itemId));
  const coreCorrect = coreAnswers.filter((a) => a.correct).length;
  const advancedCorrect = advancedAnswers.filter((a) => a.correct).length;

  const itemsAnswered = answers.length;
  const itemsCorrect = answers.filter((a) => a.correct).length;
  const confidence = itemsAnswered > 0 ? itemsCorrect / itemsAnswered : 0;

  let level: PlacementLevel;
  let recommendedStartUnitId: PlacementResult["recommendedStartUnitId"];
  if (foundationalCorrect < FOUNDATIONAL_PASS_COUNT) {
    level = "new";
    recommendedStartUnitId = null;
  } else if (coreAnswers.length === 0 || coreCorrect < Math.ceil(CORE_IDS.length / 2)) {
    level = "beginner";
    recommendedStartUnitId = "meet-the-pieces";
  } else if (advancedAnswers.length === 0 || advancedCorrect < Math.ceil(ADVANCED_IDS.length / 2)) {
    level = "intermediate";
    recommendedStartUnitId = "check-and-checkmate";
  } else {
    level = "advanced";
    recommendedStartUnitId = "basic-tactics";
  }

  return {
    demonstratedConceptIds: Array.from(demonstrated),
    conceptEvidence,
    level,
    confidence,
    // Reviewing fundamentals voluntarily is always offered, regardless of
    // level — a rated player who wants to double-check board basics is
    // never blocked from it, this just never *forces* them there.
    recommendedReviewUnitId: "meet-the-pieces",
    recommendedStartUnitId,
    itemsAnswered,
    itemsCorrect,
  };
}

export function placementItemMeta(itemId: string): PlacementItemMeta | undefined {
  return ITEMS_BY_ID.get(itemId);
}

export const PLACEMENT_ITEM_COUNT = PLACEMENT_ITEMS.length;

/** Bumped whenever the item bank or scoring rules change meaningfully — persisted alongside every PlacementAttempt/guest result so a future content change can tell an old attempt's evidence apart from a new one, per P1's "versioned" requirement. */
export const PLACEMENT_ASSESSMENT_VERSION = 1;

/** A human-readable reason the assessment ended before every item was asked — null when it ran to completion. */
export function earlyExitReason(answers: PlacementAnswer[]): string | null {
  if (answers.length >= PLACEMENT_ITEM_COUNT) return null;
  if (nextPlacementItemId(answers) !== null) return null; // shouldn't happen — still has items left, wasn't actually an early exit
  const coreAnswers = answers.filter((a) => CORE_IDS.includes(a.itemId));
  const lastThree = coreAnswers.slice(-CORE_EARLY_EXIT_STREAK);
  if (lastThree.length === CORE_EARLY_EXIT_STREAK && lastThree.every((a) => !a.correct)) {
    return `ended early — ${CORE_EARLY_EXIT_STREAK} consecutive incorrect core-tier answers`;
  }
  return "ended early — core-tier performance did not clear the threshold to continue into the advanced tier";
}
