/**
 * Instructional-quality checks that are independent of chess legality
 * (validate-chess.ts covers legality/reachability). Catches the class of
 * defect the product review calls out directly: a prompt that never tells
 * the learner what to do. This is a blunt, high-precision check — it flags
 * prompts that are *exactly* one of a small set of known-vague phrases (or
 * are too short to name an action and a target), not anything containing
 * those words as part of a real sentence. A real specific prompt like
 * "It's your turn — capture the undefended bishop with your rook." is not
 * flagged; a prompt that is literally "Your turn." is.
 */
import type { ExerciseStep, Lesson, Puzzle } from "./index";
import type { ValidationIssue } from "./validate-chess";

const VAGUE_PROMPTS = new Set([
  "what now",
  "find the move",
  "your turn",
  "try this",
  "make the best move",
  "what's next",
  "go ahead",
  "your move",
]);

const MIN_PROMPT_LENGTH = 12;

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/[.!?]+$/, "").replace(/\s+/g, " ");
}

function promptOf(step: ExerciseStep): string | undefined {
  return "prompt" in step ? step.prompt : undefined;
}

/**
 * Every step type that actually judges an answer right or wrong declares
 * `successExplanation` in its schema (index.ts) — optional there only so
 * a lesson can be authored before its copy is finalized, not because a
 * shipped step is allowed to skip it. "explain"/"review" aren't
 * interactive (nothing to explain), and "mini-game" has no
 * `successExplanation` field at all (its `objective`/`winCondition` serve
 * that role for a real played-out game) — every other type must have one,
 * per P1's "explain why answers are right, not just wrong" requirement.
 */
const TYPES_REQUIRING_SUCCESS_EXPLANATION = new Set([
  "select-square",
  "move-piece",
  "capture",
  "find-legal-move",
  "mcq",
  "true-false",
  "order-steps",
  "guided-sequence",
  "find-check",
  "find-checkmate",
]);

function successExplanationOf(step: ExerciseStep): string | undefined {
  return "successExplanation" in step ? step.successExplanation : undefined;
}

function checkStep(lessonId: string, step: ExerciseStep): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const prompt = promptOf(step);
  if (prompt !== undefined) {
    const normalized = normalize(prompt);
    if (VAGUE_PROMPTS.has(normalized)) {
      issues.push({
        lessonId,
        stepId: step.id,
        message: `prompt "${prompt}" is a known-vague instruction — name the action and target explicitly (see product review Section 3)`,
      });
    } else if (normalized.length < MIN_PROMPT_LENGTH) {
      issues.push({
        lessonId,
        stepId: step.id,
        message: `prompt "${prompt}" is too short (${normalized.length} chars) to plausibly name an action and a target — verify it's actually specific`,
      });
    }
  }

  if (TYPES_REQUIRING_SUCCESS_EXPLANATION.has(step.type) && !successExplanationOf(step)) {
    issues.push({
      lessonId,
      stepId: step.id,
      message: `step has no successExplanation — a correct answer must explain why it's correct, not just say "Correct!" (P1 pedagogical consistency)`,
    });
  }

  return issues;
}

export function validateInstructionalQuality(lesson: Lesson): ValidationIssue[] {
  return lesson.steps.flatMap((step) => checkStep(lesson.id, step));
}

/** The Puzzle-pool equivalent of the successExplanation check above — every puzzle judges a move right or wrong, so it needs the same "explain why" as a lesson step. */
export function validatePuzzleInstructionalQuality(puzzle: Puzzle): ValidationIssue[] {
  if (puzzle.successExplanation) return [];
  return [
    {
      lessonId: puzzle.id,
      stepId: puzzle.id,
      message: `puzzle has no successExplanation — a correct answer must explain why it's correct, not just say "Correct!" (P1 pedagogical consistency)`,
    },
  ];
}
