import { describe, expect, it } from "vitest";
import { validateLesson } from "./validate-chess";
import type { ExerciseStep, Lesson } from "./index";

/**
 * Unit tests for the chess-legality validator's own logic — previously
 * covered only indirectly, by real lesson content passing or failing
 * (see docs/testing-strategy.md's note on this gap). These exercise
 * checkStep's branches directly, including ones no current lesson
 * happens to trigger (e.g. a position with no check-delivering move at
 * all), so a regression here doesn't depend on some future content
 * change accidentally tripping it.
 *
 * Several fixtures below (the find-check/find-checkmate/guided-sequence
 * positions) are taken directly from packages/content/units — real,
 * already-validated lesson data — rather than invented, so a "valid"
 * assertion is checked against a position known to be correct, not just
 * internally consistent with itself.
 */

function makeLesson(steps: ExerciseStep[]): Lesson {
  return {
    id: "test.lesson",
    version: 1,
    unitId: "test",
    title: "Test lesson",
    objectives: ["testing"],
    prerequisites: [],
    steps,
    xpReward: 5,
    masteryTags: ["test"],
    difficulty: 1,
    estimatedDurationSec: 60,
  };
}

describe("FEN legality", () => {
  it("flags an illegal FEN and skips downstream checks on that step", () => {
    const issues = validateLesson(
      makeLesson([
        {
          id: "step-1",
          type: "move-piece",
          prompt: "test prompt",
          fen: "not-a-real-fen",
          expectedMoves: ["e4e8"],
          altValid: [],
          hints: [],
          feedback: {},
        },
      ]),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toMatch(/FEN is not legal/);
  });
});

describe("find-check / find-checkmate", () => {
  // Real, already-validated fixture: packages/content/units/check-and-checkmate/lesson-01-what-is-check.json
  const checkFen = "k7/8/8/8/8/8/8/4K2R w - - 0 1";
  const checkmateFen = "6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1"; // lesson-02-what-is-checkmate.json

  it("accepts a correctSquares set that matches real check-delivering squares", () => {
    const issues = validateLesson(
      makeLesson([
        { id: "s", type: "find-check", prompt: "test prompt", fen: checkFen, correctSquares: ["h8"], feedback: {} },
      ]),
    );
    expect(issues).toEqual([]);
  });

  it("flags a correctSquares entry that doesn't actually deliver check", () => {
    const issues = validateLesson(
      makeLesson([
        { id: "s", type: "find-check", prompt: "test prompt", fen: checkFen, correctSquares: ["h8", "a1"], feedback: {} },
      ]),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toMatch(/"a1" is not a square a check-delivering move lands on/);
  });

  it("flags a position where no legal move delivers check at all", () => {
    // Only two kings, far apart — no piece exists that could give check,
    // and a king can never legally deliver check by moving adjacent to
    // the opposing king (that square is itself attacked).
    const issues = validateLesson(
      makeLesson([
        {
          id: "s",
          type: "find-check",
          prompt: "test prompt",
          fen: "k7/8/8/8/8/8/8/7K w - - 0 1",
          correctSquares: ["a1"],
          feedback: {},
        },
      ]),
    );
    expect(issues.some((i) => /no legal move in this position delivers check/.test(i.message))).toBe(true);
  });

  it("accepts a correctSquares set that matches a real checkmate", () => {
    const issues = validateLesson(
      makeLesson([
        {
          id: "s",
          type: "find-checkmate",
          prompt: "test prompt",
          fen: checkmateFen,
          correctSquares: ["e8"],
          feedback: {},
        },
      ]),
    );
    expect(issues).toEqual([]);
  });

  it("flags a find-checkmate step where the position is only check, not mate", () => {
    // checkFen's rook check leaves the black king with escape squares.
    const issues = validateLesson(
      makeLesson([
        {
          id: "s",
          type: "find-checkmate",
          prompt: "test prompt",
          fen: checkFen,
          correctSquares: ["h8"],
          feedback: {},
        },
      ]),
    );
    expect(issues.some((i) => /no legal move in this position delivers checkmate/.test(i.message))).toBe(true);
  });
});

describe("order-steps", () => {
  it("accepts a correctOrder that's a real permutation of the items", () => {
    const issues = validateLesson(
      makeLesson([
        { id: "s", type: "order-steps", items: ["a", "b", "c"], correctOrder: [2, 0, 1] },
      ]),
    );
    expect(issues).toEqual([]);
  });

  it("flags a correctOrder whose length doesn't match the item count", () => {
    const issues = validateLesson(
      makeLesson([{ id: "s", type: "order-steps", items: ["a", "b", "c"], correctOrder: [0, 1] }]),
    );
    expect(issues[0]!.message).toMatch(/correctOrder has 2 entries but there are 3 items/);
  });

  it("flags a correctOrder that repeats an index instead of permuting", () => {
    const issues = validateLesson(
      makeLesson([{ id: "s", type: "order-steps", items: ["a", "b", "c"], correctOrder: [0, 0, 2] }]),
    );
    expect(issues[0]!.message).toMatch(/must be a permutation/);
  });
});

describe("move-piece / capture", () => {
  // Real, already-validated fixture: packages/content/units/meet-the-pieces/lesson-03-meet-the-rook.json
  const rookFen = "7k/8/8/8/4R3/8/8/K7 w - - 0 1";

  it("accepts real expected and alternative moves", () => {
    const issues = validateLesson(
      makeLesson([
        {
          id: "s",
          type: "move-piece",
          prompt: "test prompt",
          fen: rookFen,
          expectedMoves: ["e4e8"],
          altValid: ["e4a4", "e4h4", "e4e1"],
          hints: [],
          feedback: {},
        },
      ]),
    );
    expect(issues).toEqual([]);
  });

  it("flags an expectedMoves entry that isn't legal from the FEN", () => {
    const issues = validateLesson(
      makeLesson([
        {
          id: "s",
          type: "move-piece",
          prompt: "test prompt",
          fen: rookFen,
          expectedMoves: ["e4f5"],
          altValid: [],
          hints: [],
          feedback: {},
        },
      ]),
    );
    expect(issues[0]!.message).toMatch(/expected\/alt move "e4f5" is not legal/);
  });

  it("flags an altValid entry that isn't legal from the FEN", () => {
    const issues = validateLesson(
      makeLesson([
        {
          id: "s",
          type: "move-piece",
          prompt: "test prompt",
          fen: rookFen,
          expectedMoves: ["e4e8"],
          altValid: ["e4d5"],
          hints: [],
          feedback: {},
        },
      ]),
    );
    expect(issues[0]!.message).toMatch(/expected\/alt move "e4d5" is not legal/);
  });

  it("flags a step with no expected moves at all as having no reachable success state", () => {
    const issues = validateLesson(
      makeLesson([
        { id: "s", type: "capture", prompt: "test prompt", fen: rookFen, expectedMoves: [], feedback: {} },
      ]),
    );
    expect(issues.some((i) => /no expected moves declared/.test(i.message))).toBe(true);
  });
});

describe("find-legal-move", () => {
  const rookFen = "7k/8/8/8/4R3/8/8/K7 w - - 0 1";

  it("accepts a real legal move", () => {
    const issues = validateLesson(
      makeLesson([
        { id: "s", type: "find-legal-move", prompt: "test prompt", fen: rookFen, validMoves: ["e4e5"], feedback: {} },
      ]),
    );
    expect(issues).toEqual([]);
  });

  it("flags a declared valid move that isn't actually legal", () => {
    const issues = validateLesson(
      makeLesson([
        { id: "s", type: "find-legal-move", prompt: "test prompt", fen: rookFen, validMoves: ["e4f5"], feedback: {} },
      ]),
    );
    expect(issues[0]!.message).toMatch(/declared valid move "e4f5" is not actually legal/);
  });
});

describe("guided-sequence", () => {
  // Real, already-validated fixture: packages/content/units/check-and-checkmate/lesson-03-thinking-under-check.json
  const fen = "k3r3/8/8/8/8/8/2N5/4K3 w - - 0 1";

  it("accepts a real player-move / forced-reply sequence, applying replies between moves", () => {
    const issues = validateLesson(
      makeLesson([
        {
          id: "s",
          type: "guided-sequence",
          prompt: "test prompt",
          fen,
          playerMoves: ["c2e3", "e1d2"],
          forcedReplies: ["e8e3"],
        },
      ]),
    );
    expect(issues).toEqual([]);
  });

  it("flags an illegal player move and stops there instead of validating further", () => {
    const issues = validateLesson(
      makeLesson([
        {
          id: "s",
          type: "guided-sequence",
          prompt: "test prompt",
          fen,
          playerMoves: ["c2c3", "e1d2"],
          forcedReplies: ["e8e3"],
        },
      ]),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toMatch(/player move "c2c3" \(move 1\) is not legal/);
  });

  it("flags an illegal forced reply", () => {
    const issues = validateLesson(
      makeLesson([
        {
          id: "s",
          type: "guided-sequence",
          prompt: "test prompt",
          fen,
          playerMoves: ["c2e3"],
          forcedReplies: ["e8e1"],
        },
      ]),
    );
    expect(issues[0]!.message).toMatch(/forced reply "e8e1" \(after move 1\) is not legal/);
  });

  it("validates a second player move against the position after the forced reply, not before it", () => {
    // e1d2 is only legal once the white king isn't still exposed to the
    // pre-reply position — a validator that forgot to apply forcedReplies
    // between moves would validate this against the wrong FEN entirely
    // (this is the exact bug documented as fixed in docs/known-risks.md).
    const issues = validateLesson(
      makeLesson([
        {
          id: "s",
          type: "guided-sequence",
          prompt: "test prompt",
          fen,
          playerMoves: ["c2e3", "e1d2"],
          forcedReplies: ["e8e3"],
        },
      ]),
    );
    expect(issues).toEqual([]);
  });
});

describe("move-piece level-3 hint arrows", () => {
  const rookFen = "7k/8/8/8/4R3/8/8/K7 w - - 0 1";

  it("accepts a level-3 arrow that corresponds to a real legal move", () => {
    const issues = validateLesson(
      makeLesson([
        {
          id: "s",
          type: "move-piece",
          prompt: "test prompt",
          fen: rookFen,
          expectedMoves: ["e4e8"],
          altValid: [],
          hints: [{ level: 3, text: "Here's one path.", arrowFrom: "e4", arrowTo: "e8" }],
          feedback: {},
        },
      ]),
    );
    expect(issues).toEqual([]);
  });

  it("flags a level-3 arrow that isn't a legal move", () => {
    const issues = validateLesson(
      makeLesson([
        {
          id: "s",
          type: "move-piece",
          prompt: "test prompt",
          fen: rookFen,
          expectedMoves: ["e4e8"],
          altValid: [],
          hints: [{ level: 3, text: "wrong", arrowFrom: "e4", arrowTo: "f5" }],
          feedback: {},
        },
      ]),
    );
    expect(issues.some((i) => /hint arrow e4->f5 does not correspond to a legal move/.test(i.message))).toBe(true);
  });

  it("does not check select-square hint arrows for move legality (documented, deliberate gap)", () => {
    // select-square's arrow just points at a target square, which is
    // frequently not a "move" at all (e.g. it's the square being
    // identified). checkStep only applies the arrow-legality check to
    // move-piece steps — this pins that scoping down as intentional
    // behavior, not an oversight, per the comment in validate-chess.ts.
    const issues = validateLesson(
      makeLesson([
        {
          id: "s",
          type: "select-square",
          prompt: "test prompt",
          fen: "7k/8/8/8/4R3/8/8/K7 w - - 0 1",
          correctSquares: ["e4"],
          hints: [{ level: 3, text: "nonsense arrow", arrowFrom: "a1", arrowTo: "a1" }],
          feedback: {},
        },
      ]),
    );
    expect(issues).toEqual([]);
  });
});
