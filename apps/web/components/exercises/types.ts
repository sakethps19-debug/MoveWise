export type StepStatus = "active" | "correct" | "incorrect";

/**
 * Shared contract every exercise component uses to report results up to
 * the LessonRunner orchestrator, which owns status/feedback/hearts/XP/
 * mistake-count centrally. `onIncorrect` takes a feedback-map key (or
 * "default") — the orchestrator resolves it against the step's own
 * feedback map, since that's step-shaped data the orchestrator already
 * has in scope.
 */
export interface ExerciseHandlers {
  status: StepStatus;
  onCorrect: (xp: number) => void;
  onIncorrect: (key: string) => void;
  /** Clears status back to "active" — call before processing a new attempt after a wrong one. */
  onReset: () => void;
  /** Called once per hint reveal (each escalation to a new hint level) — feeds the lesson's star tiering. */
  onHintUsed: () => void;
}

export const STEP_XP = 5;
