/**
 * ADR-0008's concept-level mastery computation. Implements a real,
 * testable subset of docs/learner-model.md's 9-state model — the states
 * reachable from exercise-attempt evidence alone:
 *
 *   not-started -> learning -> practising -> ready-for-assessment -> proficient
 *                          \-> struggling -> recovered -> proficient
 *
 * `practising`/`ready-for-assessment` became reachable once a Puzzle pool
 * existed to generate their evidence (docs/learner-model.md: "working
 * through concept-tagged Puzzles" / "puzzle accuracy above threshold") —
 * see apps/web/lib/puzzles.ts and the `source` tag below. Still
 * deliberately not reachable: `mastered` (needs gameApplicationScore from
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
/** How many puzzle attempts before puzzle accuracy alone is trusted enough to call a concept "ready-for-assessment". */
const READY_FOR_ASSESSMENT_MIN_PUZZLE_ATTEMPTS = 3;

export interface MasteryComputationResult {
  status: MasteryStatus;
  exerciseConfidence: number;
}

export interface AttemptEvidence {
  correct: boolean;
  /** Which content type produced this attempt — a Lesson's step, a pooled Puzzle, or a mistake detected in a real analysed game (ADR-0008 Phase B). Defaults to "lesson" when absent, so every pre-existing caller (and test) is unaffected. */
  source?: "lesson" | "puzzle" | "game";
}

/**
 * Pure function: given the previous status and every ExerciseAttempt for
 * a (user, concept) pair, ordered oldest-first, compute the new status
 * and confidence score. Called after every lesson completion and every
 * puzzle attempt for each concept involved (apps/web/app/actions.ts).
 *
 * `practising`/`ready-for-assessment` are layered in *before* the
 * existing proficient/struggling/learning logic runs, not blended into
 * it — `proficient` still fires from overall accuracy exactly as before
 * regardless of attempt source, so this is purely additive: it only
 * changes the result when puzzle-sourced evidence exists, which no
 * lesson-only attempt history (every case predating this pass) ever has.
 */
export function computeMasteryStatus(
  previousStatus: MasteryStatus | null,
  attemptsOldestFirst: AttemptEvidence[],
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

  const puzzleAttempts = attemptsOldestFirst.filter((a) => a.source === "puzzle");
  if (puzzleAttempts.length > 0) {
    const puzzleAccuracy = puzzleAttempts.filter((a) => a.correct).length / puzzleAttempts.length;
    if (puzzleAttempts.length >= READY_FOR_ASSESSMENT_MIN_PUZZLE_ATTEMPTS && puzzleAccuracy >= PROFICIENT_THRESHOLD) {
      return { status: "ready-for-assessment", exerciseConfidence: accuracy };
    }
    return { status: "practising", exerciseConfidence: accuracy };
  }

  return { status: "learning", exerciseConfidence: accuracy };
}
