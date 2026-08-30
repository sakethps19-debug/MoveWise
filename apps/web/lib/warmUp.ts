import type { Puzzle } from "@movewise/exercise-schema";

/**
 * P0 "personalize the Daily Warm-up" / P1 "build real personalized
 * practice": the route previously always served the exact same two
 * king-move puzzles (meet-the-pieces' board-basics pool) to every
 * learner regardless of level — the "rated learner's Daily Warm-up isn't
 * elementary king movement" bug the product brief calls out by name. Puzzle
 * *selection* itself now lives in lib/practiceScheduler.ts's priority
 * function (review due dates, mistakes, mastery, placement confidence);
 * this file just keeps the small, still-used pieces: the shared
 * candidate/difficulty types and the manual difficulty nudges.
 */

export type WarmUpDifficulty = 1 | 2 | 3;

export interface WarmUpCandidate {
  puzzle: Puzzle;
  unitId: string;
  conceptId: string;
}

/** One difficulty tier easier, clamped at 1 — used by the warm-up page's "Too hard" control. */
export function easierDifficulty(current: WarmUpDifficulty): WarmUpDifficulty {
  return current > 1 ? ((current - 1) as WarmUpDifficulty) : 1;
}

/** One difficulty tier harder, clamped at 3 — used by the warm-up page's "Too easy" control. */
export function harderDifficulty(current: WarmUpDifficulty): WarmUpDifficulty {
  return current < 3 ? ((current + 1) as WarmUpDifficulty) : 3;
}
