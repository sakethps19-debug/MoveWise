import { describe, expect, it } from "vitest";
import { parseLesson, parsePrinciple, parseConcept, parsePuzzle } from "./index";

/**
 * Regression coverage for the missing-prompt defect found in the
 * MoveWise product review: every board-interaction step type must
 * require a non-empty `prompt`, so a lesson author omitting one fails
 * schema validation (and therefore `pnpm validate:content`/CI) instead
 * of silently shipping an exercise with no visible instruction.
 */

const BASE_LESSON = {
  id: "test.lesson",
  version: 1,
  unitId: "test",
  title: "Test lesson",
  objectives: ["testing"],
  prerequisites: [],
  xpReward: 5,
  masteryTags: ["test"],
  difficulty: 1,
  estimatedDurationSec: 60,
};

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const STEP_FIXTURES: Record<string, Record<string, unknown>> = {
  "select-square": { fen: STARTING_FEN, correctSquares: ["e1"], hints: [], feedback: {} },
  "move-piece": { fen: STARTING_FEN, expectedMoves: ["e2e4"], hints: [], feedback: {} },
  capture: { fen: STARTING_FEN, expectedMoves: ["e2e4"], feedback: {} },
  "find-legal-move": { fen: STARTING_FEN, validMoves: ["e2e4"], feedback: {} },
  "find-check": { fen: STARTING_FEN, correctSquares: ["e1"], feedback: {} },
  "find-checkmate": { fen: STARTING_FEN, correctSquares: ["e1"], feedback: {} },
  "guided-sequence": { fen: STARTING_FEN, forcedReplies: [], playerMoves: ["e2e4"] },
};

describe("board-interaction steps require a non-empty prompt", () => {
  for (const [type, fixture] of Object.entries(STEP_FIXTURES)) {
    it(`rejects a "${type}" step with no prompt`, () => {
      expect(() =>
        parseLesson({
          ...BASE_LESSON,
          steps: [{ id: "step-1", type, ...fixture }],
        }),
      ).toThrow();
    });

    it(`rejects a "${type}" step with an empty prompt`, () => {
      expect(() =>
        parseLesson({
          ...BASE_LESSON,
          steps: [{ id: "step-1", type, prompt: "", ...fixture }],
        }),
      ).toThrow();
    });

    it(`accepts a "${type}" step with a real prompt`, () => {
      expect(() =>
        parseLesson({
          ...BASE_LESSON,
          steps: [{ id: "step-1", type, prompt: "Do the thing.", ...fixture }],
        }),
      ).not.toThrow();
    });
  }
});

describe("ADR-0008 content-hierarchy schemas (Principle, Concept, Puzzle)", () => {
  it("parses a valid Principle", () => {
    expect(() =>
      parsePrinciple({
        id: "test-unit.a-principle",
        unitId: "test-unit",
        title: "A principle",
        conceptId: "a-concept",
        order: 0,
        subLessonIds: ["test-unit.01-a"],
        puzzleIds: [],
      }),
    ).not.toThrow();
  });

  it("rejects a Principle with no sub-lessons", () => {
    expect(() =>
      parsePrinciple({
        id: "test-unit.a-principle",
        unitId: "test-unit",
        title: "A principle",
        conceptId: "a-concept",
        order: 0,
        subLessonIds: [],
        puzzleIds: [],
      }),
    ).toThrow();
  });

  it("parses a valid Concept", () => {
    expect(() =>
      parseConcept({ id: "rook-movement", name: "Rook movement", description: "How the rook moves and captures." }),
    ).not.toThrow();
  });

  it("rejects a Concept with an empty description", () => {
    expect(() => parseConcept({ id: "rook-movement", name: "Rook movement", description: "" })).toThrow();
  });

  it("parses a valid Puzzle", () => {
    expect(() =>
      parsePuzzle({
        id: "test-unit.puzzle-1",
        conceptIds: ["rook-movement"],
        fen: "7k/8/8/8/4R3/8/8/K7 w - - 0 1",
        prompt: "Find the rook's best move.",
        correctMoves: ["e4e8"],
        difficulty: 1,
        feedback: { default: "Not quite." },
      }),
    ).not.toThrow();
  });

  it("parses a Puzzle with a successExplanation", () => {
    expect(() =>
      parsePuzzle({
        id: "test-unit.puzzle-2",
        conceptIds: ["rook-movement"],
        fen: "7k/8/8/8/4R3/8/8/K7 w - - 0 1",
        prompt: "Find the rook's best move.",
        correctMoves: ["e4e8"],
        difficulty: 1,
        feedback: { default: "Not quite." },
        successExplanation: "Re8 uses the rook's full range along the open e-file.",
      }),
    ).not.toThrow();
  });

  it("rejects a Puzzle with no correct moves declared", () => {
    expect(() =>
      parsePuzzle({
        id: "test-unit.puzzle-1",
        conceptIds: ["rook-movement"],
        fen: "7k/8/8/8/4R3/8/8/K7 w - - 0 1",
        prompt: "Find the rook's best move.",
        correctMoves: [],
        difficulty: 1,
        feedback: { default: "Not quite." },
      }),
    ).toThrow();
  });
});
