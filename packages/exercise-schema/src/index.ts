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
  /** Shown on a correct answer — explains WHY it's correct, not just that it is. */
  successExplanation: z.string().min(1).optional(),
  accessibleName: z.string().min(1).optional(),
});

export const MovePieceStepSchema = BaseStep.extend({
  type: z.literal("move-piece"),
  prompt: z.string().min(1),
  fen: z.string().min(1),
  expectedMoves: z.array(z.string().min(1)).min(1),
  altValid: z.array(z.string()).default([]),
  /**
   * When true, any chess-legal move of the piece named in `expectedMoves[0]`
   * is accepted — not just the moves enumerated in expectedMoves/altValid.
   * For steps whose own prompt says "any legal destination" rather than
   * asking for a specific target (a capture, a specific direction), a
   * hand-authored move list can never stay complete: every square the board
   * highlights as legal must be accepted (see docs/known-risks.md).
   * expectedMoves/altValid still drive hints and stay as the documented
   * "primary"/"alternate" example moves; this flag only widens validation.
   */
  acceptAnyLegalMove: z.boolean().default(false),
  hints: z.array(HintSchema),
  feedback: FeedbackMapSchema,
  successExplanation: z.string().min(1).optional(),
  accessibleName: z.string().min(1).optional(),
});

export const CaptureStepSchema = BaseStep.extend({
  type: z.literal("capture"),
  prompt: z.string().min(1),
  fen: z.string().min(1),
  expectedMoves: z.array(z.string().min(1)).min(1),
  hints: z.array(HintSchema).optional(),
  feedback: FeedbackMapSchema,
  successExplanation: z.string().min(1).optional(),
  accessibleName: z.string().min(1).optional(),
});

export const FindLegalMoveStepSchema = BaseStep.extend({
  type: z.literal("find-legal-move"),
  prompt: z.string().min(1),
  fen: z.string().min(1),
  validMoves: z.array(z.string().min(1)).min(1),
  hints: z.array(HintSchema).optional(),
  feedback: FeedbackMapSchema,
  successExplanation: z.string().min(1).optional(),
  accessibleName: z.string().min(1).optional(),
});

export const McqStepSchema = BaseStep.extend({
  type: z.literal("mcq"),
  prompt: z.string().min(1),
  options: z.array(z.string().min(1)).min(2),
  correctIndex: z.number().int().min(0),
  feedback: FeedbackMapSchema.optional(),
  successExplanation: z.string().min(1).optional(),
});

export const TrueFalseStepSchema = BaseStep.extend({
  type: z.literal("true-false"),
  prompt: z.string().min(1),
  correct: z.boolean(),
  feedback: FeedbackMapSchema.optional(),
  successExplanation: z.string().min(1).optional(),
});

export const OrderStepsStepSchema = BaseStep.extend({
  type: z.literal("order-steps"),
  prompt: z.string().min(1),
  items: z.array(z.string().min(1)).min(2),
  correctOrder: z.array(z.number().int()),
  successExplanation: z.string().min(1).optional(),
});

export const FindCheckStepSchema = BaseStep.extend({
  type: z.enum(["find-check", "find-checkmate"]),
  prompt: z.string().min(1),
  fen: z.string().min(1),
  correctSquares: z.array(SquareSchema).min(1),
  hints: z.array(HintSchema).optional(),
  feedback: FeedbackMapSchema,
  successExplanation: z.string().min(1).optional(),
  accessibleName: z.string().min(1).optional(),
});

export const GuidedSequenceStepSchema = BaseStep.extend({
  type: z.literal("guided-sequence"),
  prompt: z.string().min(1),
  fen: z.string().min(1),
  forcedReplies: z.array(z.string()),
  playerMoves: z.array(z.string()).min(1),
  successExplanation: z.string().min(1).optional(),
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

  /**
   * Explicit concept-teaching metadata, checked by
   * scripts/validate-content.ts's curriculum-integrity pass (the
   * "an ordinarily unlocked activity must never assess a concept the
   * learner hasn't been taught or demonstrated" invariant — see the
   * real, reproduced Board Basics defect that motivated this). All four
   * are optional so pre-existing lessons authored before this field
   * existed keep validating: the validator falls back to `masteryTags`
   * (which has always meant "concepts this lesson provides evidence
   * for") as both the introduced and assessed set when these are
   * omitted, since that was the only signal available before.
   */
  /** Concepts this lesson's own explain/teaching steps genuinely introduce for the first time. */
  introducedConceptIds: z.array(z.string().min(1)).optional(),
  /** Concepts this lesson's own interactive (graded) steps require the learner to already know to answer correctly — whether taught here or earlier. Concepts assessed-but-not-introduced-here must already be available from earlier content; the validator checks exactly that. */
  assessedConceptIds: z.array(z.string().min(1)).optional(),
  /** Concepts this lesson lets the learner reinforce without newly teaching or gradingly assessing them. Informational — not itself validated, since practising an already-known concept is never a curriculum-integrity problem. */
  practisedConceptIds: z.array(z.string().min(1)).optional(),
  /** Concept-level prerequisites beyond what's inferable from assessedConceptIds vs. introducedConceptIds — e.g. a cross-unit dependency that isn't "taught earlier in this same unit". Validated the same way as assessedConceptIds. */
  prerequisiteConceptIds: z.array(z.string().min(1)).optional(),
  /**
   * The learner level this lesson is calibrated for. Authored metadata
   * only as of this round — not yet consumed by any recommender or
   * placement result; the deeper banded/adaptive placement work that
   * would actually route learners by level remains open (see the
   * report's own backlog). Present so that work has real data to build
   * on rather than starting from nothing.
   */
  suitableLevel: z.enum(["new-to-chess", "improving", "advanced"]).optional(),
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
  /** Concept-level prerequisites this principle's practice pool assumes beyond its own unit's earlier principles — e.g. a cross-unit dependency. Same validation role as Lesson.prerequisiteConceptIds. */
  prerequisiteConceptIds: z.array(z.string().min(1)).optional(),
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
 *
 * `kind` defaults to `"move"` so every puzzle authored before this field
 * existed keeps validating unchanged. `"select-square"` is for content
 * that must never require chess-move knowledge that hasn't been taught
 * yet — a real, reproduced defect this exists to fix: Board Basics
 * (orientation/files/ranks/coordinates only, no piece movement taught)
 * previously used `correctMoves` puzzles that required moving the king,
 * a rule not introduced for another six principles.
 */
export const PuzzleSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["move", "select-square"]).default("move"),
    conceptIds: z.array(z.string().min(1)).min(1),
    fen: z.string().min(1),
    prompt: z.string().min(1),
    /** Required when kind is "move" (the default) — the legal move(s) this puzzle accepts. */
    correctMoves: z.array(z.string().min(1)).optional(),
    /** Required when kind is "select-square" — the square(s) this puzzle accepts a tap on, no move involved. */
    correctSquares: z.array(SquareSchema).optional(),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    feedback: FeedbackMapSchema,
    /** Shown on a correct answer — explains WHY it's correct, matching every other exercise type's standardized feedback. */
    successExplanation: z.string().min(1).optional(),
    sourceGameId: z.string().min(1).optional(),
    /** Concept-level prerequisites beyond this puzzle's own conceptIds — same role as Lesson.prerequisiteConceptIds. */
    prerequisiteConceptIds: z.array(z.string().min(1)).optional(),
    suitableLevel: z.enum(["new-to-chess", "improving", "advanced"]).optional(),
  })
  .refine((p) => (p.kind === "move" ? (p.correctMoves?.length ?? 0) > 0 : (p.correctSquares?.length ?? 0) > 0), {
    message: 'a "move" puzzle needs a non-empty correctMoves; a "select-square" puzzle needs a non-empty correctSquares',
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
