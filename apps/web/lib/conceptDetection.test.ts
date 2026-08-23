import { describe, expect, it } from "vitest";
import { legalMoves, tryMove } from "@movewise/chess-rules";
import { detectConcepts, detectHangingPiece, detectKingLeftInCenter, detectMissedKnightFork } from "./conceptDetection";

// Same verified queen sacrifice as moveClassification.test.ts.
const SACRIFICE_FEN_BEFORE = "6k1/8/8/8/3b4/8/6Q1/7K w - - 0 1";

// White king e1, White rook a1 (untouched home squares), Black knight on
// b4 with a legal Nc2+ forking e1 (king) and a1 (rook) at once — verified
// directly below, not assumed from the diagram.
const FORK_SETUP_FEN = "6k1/8/8/8/1n6/8/8/R3K3 b - - 0 1";

describe("detectHangingPiece", () => {
  it("flags a piece left capturable by the move that just placed it there", () => {
    const result = tryMove(SACRIFICE_FEN_BEFORE, { from: "g2", to: "f2" })!;
    expect(detectHangingPiece(result.move, result.fenAfter)).toBe(true);
  });

  it("does not flag a move that leaves no capture available", () => {
    const result = tryMove(SACRIFICE_FEN_BEFORE, { from: "g2", to: "g5" })!;
    expect(detectHangingPiece(result.move, result.fenAfter)).toBe(false);
  });
});

describe("detectMissedKnightFork", () => {
  it("recognizes a real king+rook knight fork available to the opponent", () => {
    // Confirms the premise directly: Nc2+ is really a legal move here.
    expect(legalMoves(FORK_SETUP_FEN).some((m) => m.san === "Nc2+")).toBe(true);
    expect(detectMissedKnightFork(FORK_SETUP_FEN, "w")).toBe(true);
  });

  it("does not flag a position with no forking knight move available", () => {
    expect(detectMissedKnightFork(SACRIFICE_FEN_BEFORE, "b")).toBe(false);
  });
});

describe("detectKingLeftInCenter", () => {
  const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  it("does not flag an early-game position, even with the king on e1", () => {
    expect(detectKingLeftInCenter(START_FEN, "w", 3)).toBe(false);
  });

  it("flags White's king still on e1 once past the move threshold", () => {
    expect(detectKingLeftInCenter(START_FEN, "w", 12)).toBe(true);
  });

  it("does not flag a king that's no longer on its home square", () => {
    const castled = "rnbq1rk1/pppppppp/8/8/8/8/PPPPPPPP/RNBQ1RK1 w - - 0 12";
    expect(detectKingLeftInCenter(castled, "w", 12)).toBe(false);
  });
});

describe("detectConcepts", () => {
  it("only detects concepts for a mistake/blunder — never for a good move", () => {
    const result = tryMove(SACRIFICE_FEN_BEFORE, { from: "g2", to: "f2" })!;
    expect(
      detectConcepts({ move: result.move, fenAfter: result.fenAfter, color: "w", moveNumber: 5, classification: "best" }),
    ).toEqual([]);
  });

  it("tags hanging-pieces for a blunder that hangs a piece", () => {
    const result = tryMove(SACRIFICE_FEN_BEFORE, { from: "g2", to: "f2" })!;
    const found = detectConcepts({
      move: result.move,
      fenAfter: result.fenAfter,
      color: "w",
      moveNumber: 5,
      classification: "blunder",
    });
    expect(found).toContain("hanging-pieces");
  });
});
