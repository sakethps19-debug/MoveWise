/**
 * ADR-0008's concept-level mastery computation. Implements a real,
 * testable subset of docs/learner-model.md's 9-state model — the states
 * reachable from exercise-attempt evidence alone:
 *
 *   not-started -> learning -> proficient
 *                          \-> struggling -> recovered -> proficient
 *
 * Deliberately not reachable yet: `practising`/`ready-for-assessment`
 * (need a Puzzle pool, not authored this pass — see
 * docs/concept-taxonomy.md), `mastered` (needs gameApplicationScore from
 * Play & Learn, Phase B, doesn't exist), `revision-due` (needs spaced-
 * repetition scheduling, Phase C). This is honest scope, not an
 * oversight — see docs/roadmap.md's Phase A/B/C.
 */

export type MasteryStatus =
  | "not-started"
  | "learning"
  | "practising"
  | "ready-for-assessment"
  | "proficient"
  | "mastered"
  | "revision-due"
  | "struggling"
  | "recovered";

/** Statuses that count as "proficient enough" to unlock the next principle — see docs/concept-taxonomy.md. */
export const PROFICIENT_STATUSES: ReadonlySet<MasteryStatus> = new Set(["proficient", "recovered", "mastered"]);

const RECOVERY_WINDOW = 5;
const STRUGGLING_MIN_ATTEMPTS = 3;
const PROFICIENT_THRESHOLD = 0.8;
const STRUGGLING_THRESHOLD = 0.5;

export interface MasteryComputationResult {
  status: MasteryStatus;
  exerciseConfidence: number;
}

/**
 * Pure function: given the previous status and every ExerciseAttempt for
 * a (user, concept) pair, ordered oldest-first, compute the new status
 * and confidence score. Called after every lesson completion for each
 * concept the lesson teaches (apps/web/app/actions.ts).
 */
export function computeMasteryStatus(
  previousStatus: MasteryStatus | null,
  attemptsOldestFirst: { correct: boolean }[],
): MasteryComputationResult {
  if (attemptsOldestFirst.length === 0) {
    return { status: "not-started", exerciseConfidence: 0 };
  }

  const correctCount = attemptsOldestFirst.filter((a) => a.correct).length;
  const accuracy = correctCount / attemptsOldestFirst.length;

  const recent = attemptsOldestFirst.slice(-RECOVERY_WINDOW);
  const recentAccuracy = recent.filter((a) => a.correct).length / recent.length;

  if (previousStatus === "struggling" && recentAccuracy >= PROFICIENT_THRESHOLD) {
    return { status: "recovered", exerciseConfidence: recentAccuracy };
  }
  if (accuracy < STRUGGLING_THRESHOLD && attemptsOldestFirst.length >= STRUGGLING_MIN_ATTEMPTS) {
    return { status: "struggling", exerciseConfidence: accuracy };
  }
  if (accuracy >= PROFICIENT_THRESHOLD) {
    return { status: "proficient", exerciseConfidence: accuracy };
  }
  return { status: "learning", exerciseConfidence: accuracy };
}
