/**
 * @movewise/exercise-schema
 *
 * Zod schema + TypeScript types for lesson content. Every lesson JSON
 * file in packages/content is validated against LessonSchema in CI
 * (see scripts/validate-content.ts). Adding lesson #200 later should
 * be an authoring task — writing a new JSON file that satisfies this
 * schema — not a code change, per the brief's scalability requirement.
 *
 * The exercise-step shapes mirror the coaching/hint patterns that
 * were proven out (informally) in the MoveWise prototype: a 4-stage
 * hint escalation (restate -> highlight -> arrow -> solution) and
 * misconception-specific feedback per wrong answer, generalized here
 * to work for authored exercises rather than a single freeform game.
 */
import { z } from "zod";

export const SquareSchema = z
  .string()
  .regex(/^[a-h][1-8]$/, "must be a square like 'e4'");

export const HintSchema = z.discriminatedUnion("level", [
  z.object({ level: z.literal(1), text: z.string().min(1) }),
  z.object({ level: z.literal(2), text: z.string().min(1), highlightSquares: z.array(SquareSchema) }),
  z.object({ level: z.literal(3), text: z.string().min(1), arrowFrom: SquareSchema, arrowTo: SquareSchema }),
  z.object({ level: z.literal(4), text: z.string().min(1) }),
]);

/** Wrong-answer key -> misconception-specific feedback text. */
export const FeedbackMapSchema = z.record(z.string(), z.string().min(1));

const BaseStep = z.object({
  id: z.string().min(1),
});

export const ExplainStepSchema = BaseStep.extend({
  type: z.literal("explain"),
  text: z.string().min(1),
  boardFen: z.string().optional(),
  highlights: z.array(SquareSchema).optional(),
});

export const SelectSquareStepSchema = BaseStep.extend({
  type: z.literal("select-square"),
  prompt: z.string().min(1),
  fen: z.string().min(1),
  correctSquares: z.array(SquareSchema).min(1),
  hints: z.array(HintSchema),
  feedback: FeedbackMapSchema,
});

export const MovePieceStepSchema = BaseStep.extend({
  type: z.literal("move-piece"),
  prompt: z.string().min(1),
  fen: z.string().min(1),
  expectedMoves: z.array(z.string().min(1)).min(1),
  altValid: z.array(z.string()).default([]),
  hints: z.array(HintSchema),
  feedback: FeedbackMapSchema,
});

export const CaptureStepSchema = BaseStep.extend({
  type: z.literal("capture"),
  prompt: z.string().min(1),
  fen: z.string().min(1),
  expectedMoves: z.array(z.string().min(1)).min(1),
  feedback: FeedbackMapSchema,
});

export const FindLegalMoveStepSchema = BaseStep.extend({
  type: z.literal("find-legal-move"),
  prompt: z.string().min(1),
  fen: z.string().min(1),
  validMoves: z.array(z.string().min(1)).min(1),
  feedback: FeedbackMapSchema,
});

export const McqStepSchema = BaseStep.extend({
  type: z.literal("mcq"),
  prompt: z.string().min(1),
  options: z.array(z.string().min(1)).min(2),
  correctIndex: z.number().int().min(0),
  feedback: FeedbackMapSchema.optional(),
});

export const TrueFalseStepSchema = BaseStep.extend({
  type: z.literal("true-false"),
  prompt: z.string().min(1),
  correct: z.boolean(),
  feedback: FeedbackMapSchema.optional(),
});

export const OrderStepsStepSchema = BaseStep.extend({
  type: z.literal("order-steps"),
  items: z.array(z.string().min(1)).min(2),
  correctOrder: z.array(z.number().int()),
});

export const FindCheckStepSchema = BaseStep.extend({
  type: z.enum(["find-check", "find-checkmate"]),
  prompt: z.string().min(1),
  fen: z.string().min(1),
  correctSquares: z.array(SquareSchema).min(1),
  feedback: FeedbackMapSchema,
});

export const GuidedSequenceStepSchema = BaseStep.extend({
  type: z.literal("guided-sequence"),
  prompt: z.string().min(1),
  fen: z.string().min(1),
  forcedReplies: z.array(z.string()),
  playerMoves: z.array(z.string()).min(1),
});

export const MiniGameStepSchema = BaseStep.extend({
  type: z.literal("mini-game"),
  fen: z.string().min(1),
  objective: z.string().min(1),
  winCondition: z.string().min(1),
});

export const ReviewStepSchema = BaseStep.extend({
  type: z.literal("review"),
  summary: z.string().min(1),
});

export const ExerciseStepSchema = z.discriminatedUnion("type", [
  ExplainStepSchema,
  SelectSquareStepSchema,
  MovePieceStepSchema,
  CaptureStepSchema,
  FindLegalMoveStepSchema,
  McqStepSchema,
  TrueFalseStepSchema,
  OrderStepsStepSchema,
  FindCheckStepSchema,
  GuidedSequenceStepSchema,
  MiniGameStepSchema,
  ReviewStepSchema,
]);

export const LessonSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().min(1),
  unitId: z.string().min(1),
  title: z.string().min(1),
  objectives: z.array(z.string().min(1)).min(1),
  prerequisites: z.array(z.string()).default([]),
  steps: z.array(ExerciseStepSchema).min(1),
  xpReward: z.number().int().min(0),
  masteryTags: z.array(z.string().min(1)).min(1),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  estimatedDurationSec: z.number().int().min(30),
  /** Which Principle this sub-lesson belongs to, if any — see ADR-0008. Absent for ungrouped lessons (all content predating the principle hierarchy). */
  principleId: z.string().min(1).optional(),
  /** "mastery-challenge" marks a lesson as the mastery gate for its principle/unit, per ADR-0008 — absent means "sub-lesson". */
  kind: z.enum(["sub-lesson", "mastery-challenge"]).optional(),
});

/**
 * ADR-0008's content-hierarchy layer: Principle groups several
 * SubLessons (= Lesson, unchanged shape above) and a puzzle pool under
 * one taught idea. Content, not a database model — see
 * docs/concept-taxonomy.md's correction note on why.
 */
export const PrincipleSchema = z.object({
  id: z.string().min(1),
  unitId: z.string().min(1),
  title: z.string().min(1),
  conceptId: z.string().min(1),
  order: z.number().int().min(0),
  subLessonIds: z.array(z.string().min(1)).min(1),
  puzzleIds: z.array(z.string().min(1)).default([]),
  masteryChallengeLessonId: z.string().min(1).optional(),
});

/**
 * ADR-0008's Concept taxonomy entry — content, not a database model.
 * `masteryTags`/`conceptIds` elsewhere reference `Concept.id` strings;
 * this is where the human-readable name/description/hierarchy for that
 * id lives.
 */
export const ConceptSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  parentId: z.string().min(1).optional(),
  unitId: z.string().min(1).optional(),
});

/**
 * A pooled, concept-tagged single-position exercise — ADR-0008's Puzzle
 * type. Distinct from a single-step Lesson because puzzles need to be
 * servable outside a fixed lesson sequence (a principle's puzzle pool,
 * later the shared Practice pool).
 */
export const PuzzleSchema = z.object({
  id: z.string().min(1),
  conceptIds: z.array(z.string().min(1)).min(1),
  fen: z.string().min(1),
  prompt: z.string().min(1),
  correctMoves: z.array(z.string().min(1)).min(1),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  feedback: FeedbackMapSchema,
  sourceGameId: z.string().min(1).optional(),
});

export type Hint = z.infer<typeof HintSchema>;
export type ExerciseStep = z.infer<typeof ExerciseStepSchema>;
export type Lesson = z.infer<typeof LessonSchema>;

export type ExplainStep = z.infer<typeof ExplainStepSchema>;
export type SelectSquareStep = z.infer<typeof SelectSquareStepSchema>;
export type MovePieceStep = z.infer<typeof MovePieceStepSchema>;
export type CaptureStep = z.infer<typeof CaptureStepSchema>;
export type FindLegalMoveStep = z.infer<typeof FindLegalMoveStepSchema>;
export type McqStep = z.infer<typeof McqStepSchema>;
export type TrueFalseStep = z.infer<typeof TrueFalseStepSchema>;
export type OrderStepsStep = z.infer<typeof OrderStepsStepSchema>;
export type FindCheckStep = z.infer<typeof FindCheckStepSchema>;
export type GuidedSequenceStep = z.infer<typeof GuidedSequenceStepSchema>;
export type MiniGameStep = z.infer<typeof MiniGameStepSchema>;
export type ReviewStep = z.infer<typeof ReviewStepSchema>;

export type Principle = z.infer<typeof PrincipleSchema>;
export type Concept = z.infer<typeof ConceptSchema>;
export type Puzzle = z.infer<typeof PuzzleSchema>;

export function parseLesson(data: unknown): Lesson {
  return LessonSchema.parse(data);
}

export function parsePrinciple(data: unknown): Principle {
  return PrincipleSchema.parse(data);
}

export function parseConcept(data: unknown): Concept {
  return ConceptSchema.parse(data);
}

export function parsePuzzle(data: unknown): Puzzle {
  return PuzzleSchema.parse(data);
}
