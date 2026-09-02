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

/**
 * Only a1/h1/a8/h8 are corners of a chessboard — every other square on the
 * edge (like g1 or h6) is an edge square, not a corner. Real, reproduced
 * defect this guards against: placement.movement-queen's prompt said "all
 * the way to the corner of the board" for a move ending on g1, and its
 * successExplanation repeated the same false claim — g1 is on the edge
 * (rank 1) but two files away from the nearest corner (h1). A near-identical
 * bug existed for placement.movement-bishop/meet-the-pieces.puzzle-bishop-1
 * (c1-h6, ending on h6, not a corner either). Never fix this class of
 * defect with a one-off string edit alone — this validator exists so the
 * exact regression (and every other case like it) fails a test the moment
 * it's reintroduced.
 */
const CORNER_SQUARES = new Set(["a1", "h1", "a8", "h8"]);
const CORNER_WORD = /\bcorner\b/i;

/** A UCI move string's destination square — the last 2 chars of a 4-5 char move like "d4g1" or "e7e8q". */
function destinationOf(uciMove: string): string | undefined {
  const match = uciMove.match(/^[a-h][1-8]([a-h][1-8])[qrbn]?$/i);
  return match?.[1]?.toLowerCase();
}

/** Every square this step/puzzle's *correct answer* actually lands on or names — the only squares "corner" text is allowed to describe. */
function answerSquaresOf(entity: {
  correctMoves?: string[];
  expectedMoves?: string[];
  correctSquares?: string[];
  hints?: Array<{ level: number; arrowTo?: string }>;
}): Set<string> {
  const squares = new Set<string>();
  for (const move of [...(entity.correctMoves ?? []), ...(entity.expectedMoves ?? [])]) {
    const dest = destinationOf(move);
    if (dest) squares.add(dest);
  }
  for (const square of entity.correctSquares ?? []) squares.add(square.toLowerCase());
  for (const hint of entity.hints ?? []) {
    if (hint.arrowTo) squares.add(hint.arrowTo.toLowerCase());
  }
  return squares;
}

/**
 * Every free-text field this check scans for a false "corner" claim about
 * the *move's own destination* — prompt, feedback, and successExplanation,
 * which is what both reproduced bugs actually used. Deliberately excludes
 * hint text: a hint legitimately describes squares other than the answer
 * (e.g. "The king in the corner has only one escape square" — describing
 * where an opponent piece already sits in the puzzle's FEN, not the
 * move's destination), and checking hints against `answerSquaresOf` alone
 * produced a real false positive on exactly that back-rank-mate hint
 * (correct answer squares c8/g8, king genuinely on the corner a8) before
 * this scope was narrowed.
 */
function textFieldsOf(entity: {
  prompt?: string;
  feedback?: Record<string, string>;
  successExplanation?: string;
}): string[] {
  const texts: string[] = [];
  if (entity.prompt) texts.push(entity.prompt);
  if (entity.successExplanation) texts.push(entity.successExplanation);
  if (entity.feedback) texts.push(...Object.values(entity.feedback));
  return texts;
}

function checkCornerLanguage(
  lessonId: string,
  stepId: string,
  entity: Parameters<typeof answerSquaresOf>[0] & Parameters<typeof textFieldsOf>[0],
): ValidationIssue[] {
  const mentionsCorner = textFieldsOf(entity).some((text) => CORNER_WORD.test(text));
  if (!mentionsCorner) return [];
  const answerSquares = answerSquaresOf(entity);
  const hasRealCorner = [...answerSquares].some((sq) => CORNER_SQUARES.has(sq));
  if (hasRealCorner) return [];
  return [
    {
      lessonId,
      stepId,
      message:
        `text mentions "corner" but the correct answer square(s) (${[...answerSquares].join(", ") || "none found"}) ` +
        `don't include a real corner (a1, h1, a8, or h8) — only those four squares are corners; every other edge square is not`,
    },
  ];
}

export function validateSpatialLanguage(lesson: Lesson): ValidationIssue[] {
  return lesson.steps.flatMap((step) => checkCornerLanguage(lesson.id, step.id, step as unknown as Parameters<typeof checkCornerLanguage>[2]));
}

export function validatePuzzleSpatialLanguage(puzzle: Puzzle): ValidationIssue[] {
  return checkCornerLanguage(puzzle.id, puzzle.id, puzzle as unknown as Parameters<typeof checkCornerLanguage>[2]);
}
