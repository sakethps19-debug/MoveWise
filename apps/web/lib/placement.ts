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
  { id: "placement.endgame-king-escort", tier: "advanced", conceptIds: ["opposition-key-squares"] },
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
  /** Concepts this assessment has real evidence for — safe to write as UserConceptMastery "proficient" rows and to bypass lesson-prerequisite/pool-unlock checks for, without ever calling them "completed". */
  demonstratedConceptIds: string[];
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

/**
 * Pure scoring function — no I/O, fully unit-testable. Never marks a
 * concept "demonstrated" from a single foundational-tier guess (see
 * FOUNDATIONAL_PASS_COUNT), and every core/advanced item that *was* asked
 * and answered correctly demonstrates its own concept(s) directly, since
 * those are genuine single-concept checks rather than a cluster.
 */
export function scorePlacement(answers: PlacementAnswer[]): PlacementResult {
  const demonstrated = new Set<string>();

  const foundationalAnswers = answers.filter((a) => FOUNDATIONAL_IDS.includes(a.itemId));
  const foundationalCorrect = foundationalAnswers.filter((a) => a.correct).length;
  if (foundationalCorrect >= FOUNDATIONAL_PASS_COUNT) {
    for (const conceptId of FOUNDATIONAL_CLUSTER_CONCEPTS) demonstrated.add(conceptId);
  }

  for (const answer of answers) {
    if (!answer.correct) continue;
    const item = ITEMS_BY_ID.get(answer.itemId);
    if (!item || item.tier === "foundational") continue;
    for (const conceptId of item.conceptIds) demonstrated.add(conceptId);
  }

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
