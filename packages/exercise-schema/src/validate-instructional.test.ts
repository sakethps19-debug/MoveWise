import { describe, expect, it } from "vitest";
import { validateInstructionalQuality } from "./validate-instructional";
import type { Lesson } from "./index";

function makeLesson(steps: Lesson["steps"]): Lesson {
  return {
    id: "test-lesson",
    version: 1,
    unitId: "test-unit",
    title: "Test lesson",
    objectives: ["Test objective"],
    prerequisites: [],
    steps,
    xpReward: 10,
    masteryTags: ["test-tag"],
    difficulty: 1,
    estimatedDurationSec: 60,
  };
}

describe("validateInstructionalQuality", () => {
  it("flags a prompt that's exactly a known-vague phrase", () => {
    const issues = validateInstructionalQuality(
      makeLesson([
        {
          id: "s",
          type: "select-square",
          prompt: "Your turn.",
          fen: "8/8/8/8/8/8/8/8 w - - 0 1",
          correctSquares: ["e4"],
          hints: [],
          feedback: {},
        },
      ]),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toMatch(/known-vague instruction/);
  });

  it("is case- and punctuation-insensitive when matching vague phrases", () => {
    const issues = validateInstructionalQuality(
      makeLesson([
        {
          id: "s",
          type: "select-square",
          prompt: "  TRY THIS!!  ",
          fen: "8/8/8/8/8/8/8/8 w - - 0 1",
          correctSquares: ["e4"],
          hints: [],
          feedback: {},
        },
      ]),
    );
    expect(issues).toHaveLength(1);
  });

  it("flags a prompt too short to plausibly name an action and a target", () => {
    const issues = validateInstructionalQuality(
      makeLesson([
        { id: "s", type: "true-false", prompt: "King?", correct: true, feedback: {} },
      ]),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toMatch(/too short/);
  });

  it("accepts a specific prompt naming an action and a target", () => {
    const issues = validateInstructionalQuality(
      makeLesson([
        {
          id: "s",
          type: "move-piece",
          prompt: "Capture the undefended bishop with your rook.",
          fen: "8/8/8/8/8/8/8/8 w - - 0 1",
          expectedMoves: ["e4d4"],
          altValid: [],
          acceptAnyLegalMove: false,
          hints: [],
          feedback: {},
        },
      ]),
    );
    expect(issues).toEqual([]);
  });

  it("does not flag a longer sentence that merely contains a vague word as part of real context", () => {
    const issues = validateInstructionalQuality(
      makeLesson([
        {
          id: "s",
          type: "select-square",
          prompt: "It's your turn — tap the square where the queen delivers checkmate.",
          fen: "8/8/8/8/8/8/8/8 w - - 0 1",
          correctSquares: ["e4"],
          hints: [],
          feedback: {},
        },
      ]),
    );
    expect(issues).toEqual([]);
  });

  it("skips steps with no prompt field (explain, order-steps handled by their own schema requirement)", () => {
    const issues = validateInstructionalQuality(makeLesson([{ id: "s", type: "explain", text: "Some explanation." }]));
    expect(issues).toEqual([]);
  });
});
