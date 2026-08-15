import { describe, expect, it } from "vitest";
import { parseLesson } from "./index";

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
