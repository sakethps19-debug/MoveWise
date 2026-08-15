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
import type { ExerciseStep, Lesson } from "./index";
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

function checkStep(lessonId: string, step: ExerciseStep): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const prompt = promptOf(step);
  if (prompt === undefined) return issues;

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

  return issues;
}

export function validateInstructionalQuality(lesson: Lesson): ValidationIssue[] {
  return lesson.steps.flatMap((step) => checkStep(lesson.id, step));
}
