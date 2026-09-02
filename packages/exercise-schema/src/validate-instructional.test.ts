import { describe, expect, it } from "vitest";
import { validateInstructionalQuality, validateSpatialLanguage, validatePuzzleSpatialLanguage } from "./validate-instructional";
import type { Lesson, Puzzle } from "./index";

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
          successExplanation: "That's e4.",
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
          successExplanation: "That's e4.",
        },
      ]),
    );
    expect(issues).toHaveLength(1);
  });

  it("flags a prompt too short to plausibly name an action and a target", () => {
    const issues = validateInstructionalQuality(
      makeLesson([
        { id: "s", type: "true-false", prompt: "King?", correct: true, feedback: {}, successExplanation: "Right." },
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
          successExplanation: "The rook captures the bishop, winning material for free.",
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
          successExplanation: "The queen delivers checkmate from e4.",
        },
      ]),
    );
    expect(issues).toEqual([]);
  });

  it("flags an interactive step with no successExplanation — a correct answer must explain why", () => {
    const issues = validateInstructionalQuality(
      makeLesson([
        {
          id: "s",
          type: "select-square",
          prompt: "Tap the square where the file and rank cross.",
          fen: "8/8/8/8/8/8/8/8 w - - 0 1",
          correctSquares: ["e4"],
          hints: [],
          feedback: {},
        },
      ]),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toMatch(/no successExplanation/);
  });

  it("does not require successExplanation on non-interactive steps (explain, review) or mini-game", () => {
    const issues = validateInstructionalQuality(
      makeLesson([
        { id: "s1", type: "explain", text: "Some explanation." },
        { id: "s2", type: "review", summary: "A summary." },
        {
          id: "s3",
          type: "mini-game",
          fen: "8/8/8/8/8/8/8/8 w - - 0 1",
          objective: "Win the endgame.",
          winCondition: "checkmate",
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

/**
 * Regression coverage for the P0 "placement chess and language correctness"
 * bug: placement.movement-queen's text claimed a move to g1 reached "the
 * corner of the board" — g1 is on the edge but is not one of the board's
 * four actual corners (a1, h1, a8, h8). Same class of defect existed for
 * placement.movement-bishop/meet-the-pieces.puzzle-bishop-1 (c1-h6, ending
 * on h6). Both were fixed by rewording to "edge of the board" rather than
 * "corner" — these tests pin that a re-introduction of false corner
 * language fails immediately, while legitimate corner language (a move
 * that really does land on a1/h1/a8/h8) keeps passing.
 */
function makePuzzle(overrides: Partial<Puzzle> & Pick<Puzzle, "id">): Puzzle {
  return {
    kind: "move",
    conceptIds: ["test-concept"],
    fen: "8/8/8/8/8/8/8/8 w - - 0 1",
    prompt: "Move the piece.",
    correctMoves: ["a1a2"],
    difficulty: 1,
    feedback: {},
    ...overrides,
  };
}

describe("validateSpatialLanguage / validatePuzzleSpatialLanguage — corner claims", () => {
  it("flags a move-piece step whose successExplanation claims 'corner' but the destination isn't one (the exact reproduced bug, restated as a lesson step)", () => {
    const issues = validateSpatialLanguage(
      makeLesson([
        {
          id: "s",
          type: "move-piece",
          prompt: "Move the queen diagonally down-right, all the way to the corner of the board.",
          fen: "k7/8/8/8/3Q4/8/8/4K3 w - - 0 1",
          expectedMoves: ["d4g1"],
          altValid: [],
          acceptAnyLegalMove: false,
          hints: [],
          feedback: {},
          successExplanation: "Qg1 travels the whole diagonal from d4 down to the corner.",
        },
      ]),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toMatch(/don't include a real corner/);
  });

  it("does not flag a step whose destination genuinely is a corner square", () => {
    const issues = validateSpatialLanguage(
      makeLesson([
        {
          id: "s",
          type: "move-piece",
          prompt: "Trace the bishop's whole diagonal to the far corner of the board.",
          fen: "4k3/8/8/8/8/8/1B6/4K3 w - - 0 1",
          expectedMoves: ["b2h8"],
          altValid: [],
          acceptAnyLegalMove: false,
          hints: [],
          feedback: {},
          successExplanation: "Bxh8 wins the rook for free — a bishop in the corner still commands its whole diagonal.",
        },
      ]),
    );
    expect(issues).toEqual([]);
  });

  it("does not flag text that never mentions 'corner' at all", () => {
    const issues = validateSpatialLanguage(
      makeLesson([
        {
          id: "s",
          type: "move-piece",
          prompt: "Move the queen diagonally down-right, all the way to the edge of the board.",
          fen: "k7/8/8/8/3Q4/8/8/4K3 w - - 0 1",
          expectedMoves: ["d4g1"],
          altValid: [],
          acceptAnyLegalMove: false,
          hints: [],
          feedback: {},
          successExplanation: "Qg1 travels the whole diagonal from d4 down to the edge of the board.",
        },
      ]),
    );
    expect(issues).toEqual([]);
  });

  it("does not flag hint text describing a different piece already sitting in a real corner — the exact false positive this scope decision fixes (tactical-vision back-rank-mate: answer squares c8/g8, hint describes the king already on corner a8)", () => {
    const issues = validateSpatialLanguage(
      makeLesson([
        {
          id: "s",
          type: "find-checkmate",
          prompt: "Click the square where your queen delivers checkmate along the back rank.",
          fen: "k7/pp6/8/8/2Q5/8/8/6K1 w - - 0 1",
          correctSquares: ["c8", "g8"],
          hints: [{ level: 1, text: "The king in the corner has only one possible escape square." }],
          feedback: {},
          successExplanation: "Qc8 is checkmate.",
        },
      ]),
    );
    expect(issues).toEqual([]);
  });

  it("puzzle equivalent: flags a puzzle whose prompt falsely claims 'corner' (the exact reproduced regression)", () => {
    const issues = validatePuzzleSpatialLanguage(
      makePuzzle({
        id: "placement.movement-queen",
        fen: "k7/8/8/8/3Q4/8/8/4K3 w - - 0 1",
        prompt: "Move the queen diagonally down-right, all the way to the corner of the board.",
        correctMoves: ["d4g1"],
        successExplanation: "Qg1 travels the whole diagonal from d4 down to the corner.",
      }),
    );
    expect(issues).toHaveLength(1);
  });

  it("puzzle equivalent: accepts a genuinely corner-ending puzzle", () => {
    const issues = validatePuzzleSpatialLanguage(
      makePuzzle({
        id: "test.corner-real",
        fen: "4k3/8/8/8/8/8/1B6/4K3 w - - 0 1",
        prompt: "Trace the bishop's whole diagonal to the far corner of the board.",
        correctMoves: ["b2h8"],
        successExplanation: "Bxh8 wins the rook — the corner square still commands the whole diagonal.",
      }),
    );
    expect(issues).toEqual([]);
  });

  it("puzzle equivalent: select-square puzzle uses correctSquares, not correctMoves", () => {
    const issues = validatePuzzleSpatialLanguage(
      makePuzzle({
        id: "test.select-corner",
        kind: "select-square",
        correctMoves: undefined,
        correctSquares: ["a1"],
        prompt: "Tap the corner square.",
        successExplanation: "a1 is a real corner of the board.",
      }),
    );
    expect(issues).toEqual([]);
  });
});
