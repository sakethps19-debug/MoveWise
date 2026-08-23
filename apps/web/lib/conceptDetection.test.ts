import { describe, expect, it } from "vitest";
import { legalMoves, tryMove, type Move } from "@movewise/chess-rules";
import {
  detectBackRankVulnerability,
  detectConcepts,
  detectHangingPiece,
  detectKingLeftInCenter,
  detectMissedKnightFork,
  detectPrematureQueenDevelopment,
} from "./conceptDetection";

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

describe("detectPrematureQueenDevelopment", () => {
  const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  it("flags an early queen sortie while every minor piece is still on its home square", () => {
    // 1.e4 e5 2.Qh5 — verified directly: after Qh5, White's b1/c1/f1/g1
    // are still occupied by their original knight/bishop.
    const afterE4 = tryMove(START_FEN, { from: "e2", to: "e4" })!;
    const afterE5 = tryMove(afterE4.fenAfter, { from: "e7", to: "e5" })!;
    const afterQh5 = tryMove(afterE5.fenAfter, { from: "d1", to: "h5" })!;
    expect(afterQh5.move.piece).toBe("q");
    expect(detectPrematureQueenDevelopment(afterQh5.move, afterQh5.fenAfter, "w", 2)).toBe(true);
  });

  it("does not flag a non-queen move", () => {
    const afterE4 = tryMove(START_FEN, { from: "e2", to: "e4" })!;
    expect(detectPrematureQueenDevelopment(afterE4.move, afterE4.fenAfter, "w", 1)).toBe(false);
  });

  it("does not flag a queen move past the move-number threshold", () => {
    const afterE4 = tryMove(START_FEN, { from: "e2", to: "e4" })!;
    const afterE5 = tryMove(afterE4.fenAfter, { from: "e7", to: "e5" })!;
    const afterQh5 = tryMove(afterE5.fenAfter, { from: "d1", to: "h5" })!;
    expect(detectPrematureQueenDevelopment(afterQh5.move, afterQh5.fenAfter, "w", 10)).toBe(false);
  });

  it("does not flag a queen move once minor pieces are already developed", () => {
    // A position where every minor-piece home square is already empty —
    // isSacrifice-style tests elsewhere in this file use the same
    // minimal-stand-in pattern since the function only reads `.piece`.
    const fenAfter = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/R2QK2R w KQkq - 0 1";
    const queenMove = { piece: "q" } as Move;
    expect(detectPrematureQueenDevelopment(queenMove, fenAfter, "w", 5)).toBe(false);
  });
});

describe("detectBackRankVulnerability", () => {
  // Black king boxed in on g8 by its own f7/g7/h7 pawns, White to move —
  // Re8# is a real, verified legal move here (checked directly below),
  // not assumed from the diagram.
  const BOXED_IN_FEN = "6k1/5ppp/8/8/8/8/8/4R2K w - - 0 1";

  it("flags a real, verified back-rank mate-in-1 available to the opponent", () => {
    expect(legalMoves(BOXED_IN_FEN).some((m) => m.san === "Re8#")).toBe(true);
    expect(detectBackRankVulnerability(BOXED_IN_FEN, "b")).toBe(true);
  });

  it("does not flag the same shape once the king has an escape square (luft)", () => {
    const withLuft = "6k1/5p1p/6p1/8/8/8/8/4R2K w - - 0 1";
    expect(detectBackRankVulnerability(withLuft, "b")).toBe(false);
  });

  it("does not flag a normal opening position", () => {
    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    expect(detectBackRankVulnerability(startFen, "b")).toBe(false);
  });

  it("does not flag when the mate is available against the other side's back rank", () => {
    // Same boxed-in shape, but checked against White's own back rank
    // (rank 1) — the available mate is on rank 8, so this must not fire.
    expect(detectBackRankVulnerability(BOXED_IN_FEN, "w")).toBe(false);
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
