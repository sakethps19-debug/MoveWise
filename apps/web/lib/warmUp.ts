import type { Puzzle } from "@movewise/exercise-schema";

/**
 * P0 "personalize the Daily Warm-up": the route previously always served
 * the exact same two king-move puzzles (meet-the-pieces' board-basics
 * pool) to every learner regardless of level — the "rated learner's Daily
 * Warm-up isn't elementary king movement" bug the product brief calls
 * out by name. Pure, isomorphic selection logic (safe to run client-side
 * for a guest's localStorage-only placement result, or server-side for a
 * signed-in learner's real UserConceptMastery data) — no fs/db access
 * here, callers supply already-loaded candidates.
 */

export type WarmUpDifficulty = 1 | 2 | 3;

export interface WarmUpCandidate {
  puzzle: Puzzle;
  unitId: string;
  conceptId: string;
}

export interface WarmUpUnit {
  id: string;
  principles: { conceptId: string }[];
}

/**
 * The learner's current "chapter": the first unit (in canonical order)
 * that still has an undemonstrated principle. A learner with zero
 * progress lands on the first unit (meet-the-pieces), exactly as before.
 * A learner whose placement (or real practice) demonstrated every
 * principle in every unit falls through to the very last unit
 * (basic-tactics) rather than looping back to the first — there's
 * nothing left to call "not yet demonstrated", so the most advanced
 * content is the right one to keep warming up with.
 */
export function frontierUnitId(units: WarmUpUnit[], knownConceptIds: ReadonlySet<string>): string | null {
  if (units.length === 0) return null;
  for (const unit of units) {
    if (unit.principles.some((p) => !knownConceptIds.has(p.conceptId))) return unit.id;
  }
  return units[units.length - 1]!.id;
}

/**
 * Picks `count` puzzles from `candidates` matching `preferredDifficulty`
 * as closely as possible — exact matches first, falling back to the
 * full candidate list (any difficulty) only when there genuinely aren't
 * enough at the requested level, so "Too hard" / "Too easy" always
 * changes something rather than silently no-opping on a thin pool.
 * Deterministic (no randomness) so the same inputs always reproduce the
 * same warm-up, matching every other exercise runner in this codebase.
 */
export function pickWarmUpPuzzles(
  candidates: WarmUpCandidate[],
  preferredDifficulty: WarmUpDifficulty,
  count = 2,
): Puzzle[] {
  const exact = candidates.filter((c) => c.puzzle.difficulty === preferredDifficulty);
  const pool = exact.length >= count ? exact : candidates;
  return pool.slice(0, count).map((c) => c.puzzle);
}

/** One difficulty tier easier, clamped at 1 — used by the warm-up page's "Too hard" control. */
export function easierDifficulty(current: WarmUpDifficulty): WarmUpDifficulty {
  return current > 1 ? ((current - 1) as WarmUpDifficulty) : 1;
}

/** One difficulty tier harder, clamped at 3 — used by the warm-up page's "Too easy" control. */
export function harderDifficulty(current: WarmUpDifficulty): WarmUpDifficulty {
  return current < 3 ? ((current + 1) as WarmUpDifficulty) : 3;
}
