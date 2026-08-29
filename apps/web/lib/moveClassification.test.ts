import { describe, expect, it } from "vitest";
import { tryMove, legalMoves, moveUci, type Move } from "@movewise/chess-rules";
import { classifyMove, computeEvalLoss, isEngineBestByIdentity, isSacrifice } from "./moveClassification";

describe("computeEvalLoss", () => {
  it("is zero for a White move that keeps the eval unchanged", () => {
    expect(computeEvalLoss(20, 20, "w")).toBe(0);
  });

  it("is positive when a White move makes the position worse for White", () => {
    expect(computeEvalLoss(20, -30, "w")).toBe(50);
  });

  it("is zero (not negative) when a White move improves the position", () => {
    expect(computeEvalLoss(20, 80, "w")).toBe(0);
  });

  it("mirrors the sign for a Black move, since eval is always White-relative", () => {
    // Black's move made the White-relative eval go up — bad for Black.
    expect(computeEvalLoss(-10, 40, "b")).toBe(50);
    // Black's move made the White-relative eval go down — good for Black.
    expect(computeEvalLoss(-10, -60, "b")).toBe(0);
  });

  it("is forced to exactly 0 when playedUci matches bestUci, even if evalBefore/evalAfter would otherwise imply a loss — the exact live production contradiction (played d5, best d5, 'Excellent'/-3cp) this override exists to prevent", () => {
    // Two independent depth-limited engine searches disagreeing by a few
    // cp on the identical move is ordinary shallow-search noise, not a
    // real loss — see isEngineBestByIdentity's doc comment.
    expect(computeEvalLoss(-5, -8, "b", "d7d5", "d7d5")).toBe(0);
    expect(computeEvalLoss(20, 17, "w", "e2e4", "e2e4")).toBe(0);
  });

  it("still applies the identity override regardless of which side has the (irrelevant) apparent loss", () => {
    expect(computeEvalLoss(100, 900, "w", "g1f3", "g1f3")).toBe(0); // would otherwise read as a 0-loss "gain", unaffected either way
    expect(computeEvalLoss(100, -900, "w", "g1f3", "g1f3")).toBe(0); // would otherwise read as a huge blunder-magnitude loss
  });

  it("does not override when playedUci and bestUci differ, or either is missing", () => {
    expect(computeEvalLoss(20, -10, "w", "e2e4", "d2d4")).toBe(30);
    expect(computeEvalLoss(20, -10, "w", "e2e4", undefined)).toBe(30);
    expect(computeEvalLoss(20, -10, "w")).toBe(30);
  });
});

describe("isEngineBestByIdentity", () => {
  it("is true only when both UCI strings are present and identical", () => {
    expect(isEngineBestByIdentity("e2e4", "e2e4")).toBe(true);
    expect(isEngineBestByIdentity("e2e4", "d2d4")).toBe(false);
    expect(isEngineBestByIdentity(undefined, "d2d4")).toBe(false);
    expect(isEngineBestByIdentity("e2e4", undefined)).toBe(false);
    expect(isEngineBestByIdentity(undefined, undefined)).toBe(false);
  });

  it("compares by UCI identity, not SAN — a decorated SAN string is never the comparison basis", () => {
    // moveUci strips exactly what SAN can carry that UCI never does
    // (check/mate suffixes, disambiguation letters).
    const forced = tryMove(FORCED_FEN, { from: "h1", to: "g2" })!;
    expect(forced.move.san).toBe("Kxg2"); // SAN carries a capture marker UCI doesn't
    expect(moveUci(forced.move)).toBe("h1g2");
    expect(isEngineBestByIdentity(moveUci(forced.move), "h1g2")).toBe(true);
  });
});

// A real, legal queen sacrifice: White's queen on g2 moves to f2, directly
// onto Black's bishop's (d4) diagonal — verified below that Black can
// actually recapture (Bxf2), not just plausible from eyeballing the board.
const SACRIFICE_FEN_BEFORE = "6k1/8/8/8/3b4/8/6Q1/7K w - - 0 1";

// A position with exactly one legal move (Kxg2, capturing the checking
// queen) — verified below via legalMoves, not assumed.
const FORCED_FEN = "6k1/8/8/8/8/8/6qp/7K w - - 0 1";

describe("isSacrifice", () => {
  it("recognizes a queen left capturable on the square it just moved to", () => {
    const result = tryMove(SACRIFICE_FEN_BEFORE, { from: "g2", to: "f2" })!;
    expect(result.move.san).toBe("Qf2");
    // Confirms the premise directly, not just trusting the heuristic under test.
    expect(legalMoves(result.fenAfter).some((m) => m.to === "f2" && m.captured)).toBe(true);
    expect(isSacrifice(result.move, result.fenAfter)).toBe(true);
  });

  it("does not flag an ordinary safe move as a sacrifice", () => {
    const result = tryMove(SACRIFICE_FEN_BEFORE, { from: "g2", to: "g5" })!;
    expect(isSacrifice(result.move, result.fenAfter)).toBe(false);
  });

  it("does not flag a hung pawn as a sacrifice (pawns don't count)", () => {
    // A pawn can't legally move diagonally without capturing, so this
    // scenario (a pawn landing on a square the bishop can then take) is
    // constructed directly rather than via tryMove — isSacrifice only
    // reads `.piece`/`.to` off the move, so a minimal stand-in is faithful
    // to what the function actually inspects.
    const fenAfter = "6k1/8/8/8/3b4/8/5P2/7K b - - 0 1";
    expect(legalMoves(fenAfter).some((m) => m.to === "f2" && m.captured)).toBe(true);
    const pawnMove = { piece: "p", to: "f2" } as Move;
    expect(isSacrifice(pawnMove, fenAfter)).toBe(false);
  });
});

describe("classifyMove", () => {
  it("classifies a forced move (only one legal option) as 'forced', regardless of eval", () => {
    expect(legalMoves(FORCED_FEN)).toHaveLength(1);
    const move = tryMove(FORCED_FEN, { from: "h1", to: "g2" })!.move;
    expect(
      classifyMove({
        move,
        fenAfter: tryMove(FORCED_FEN, { from: "h1", to: "g2" })!.fenAfter,
        color: "w",
        evalBefore: -900,
        evalAfter: -900,
        legalMoveCountBefore: 1,
      }),
    ).toBe("forced");
  });

  it("classifies a zero-loss sacrifice into a decisive position as 'brilliant'", () => {
    const result = tryMove(SACRIFICE_FEN_BEFORE, { from: "g2", to: "f2" })!;
    expect(
      classifyMove({
        move: result.move,
        fenAfter: result.fenAfter,
        color: "w",
        evalBefore: 20,
        evalAfter: 450, // no loss (eval improved) and decisively winning
        legalMoveCountBefore: 23,
      }),
    ).toBe("brilliant");
  });

  it("classifies a zero-loss move with no sacrifice as 'best'", () => {
    const result = tryMove(SACRIFICE_FEN_BEFORE, { from: "g2", to: "g5" })!;
    expect(
      classifyMove({
        move: result.move,
        fenAfter: result.fenAfter,
        color: "w",
        evalBefore: 20,
        evalAfter: 20,
        legalMoveCountBefore: 23,
      }),
    ).toBe("best");
  });

  it("does not call a zero-loss sacrifice 'brilliant' unless the resulting eval is actually decisive", () => {
    const result = tryMove(SACRIFICE_FEN_BEFORE, { from: "g2", to: "f2" })!;
    expect(
      classifyMove({
        move: result.move,
        fenAfter: result.fenAfter,
        color: "w",
        evalBefore: 20,
        evalAfter: 20, // unchanged, but only mildly better — not decisive
        legalMoveCountBefore: 23,
      }),
    ).toBe("best");
  });

  const baseInput = () => {
    const result = tryMove(SACRIFICE_FEN_BEFORE, { from: "g2", to: "g5" })!;
    return { move: result.move, fenAfter: result.fenAfter, color: "w" as const, legalMoveCountBefore: 23 };
  };

  it("classifies a small loss (<=20cp) as 'excellent'", () => {
    expect(classifyMove({ ...baseInput(), evalBefore: 20, evalAfter: 5 })).toBe("excellent");
  });

  it("classifies a moderate loss (21-50cp) as 'good'", () => {
    expect(classifyMove({ ...baseInput(), evalBefore: 20, evalAfter: -25 })).toBe("good");
  });

  it("classifies a 51-100cp loss as 'inaccuracy'", () => {
    expect(classifyMove({ ...baseInput(), evalBefore: 20, evalAfter: -60 })).toBe("inaccuracy");
  });

  it("classifies a 101-300cp loss as 'mistake' — the textbook case", () => {
    expect(classifyMove({ ...baseInput(), evalBefore: 20, evalAfter: -250 })).toBe("mistake");
  });

  it("classifies a >300cp loss as 'blunder' — a hung queen for nothing", () => {
    expect(classifyMove({ ...baseInput(), evalBefore: 20, evalAfter: -900 })).toBe("blunder");
  });

  it("classifies a White move as 'best' with zero loss when playedUci equals bestUci, even though evalBefore/evalAfter alone would imply a small loss (item 8: White)", () => {
    expect(
      classifyMove({
        ...baseInput(),
        evalBefore: 20,
        evalAfter: 17, // would otherwise read as a 3cp loss -> "excellent"
        playedUci: moveUci(baseInput().move),
        bestUci: moveUci(baseInput().move),
      }),
    ).toBe("best");
  });

  it("classifies a Black move as 'best' with zero loss when playedUci equals bestUci, even though evalBefore/evalAfter alone would imply a small loss (item 8: Black)", () => {
    // A genuine Black-to-move ply (bishop e5-d4, quiet and legal), not a
    // White one reused with color flipped, so the mover-perspective sign
    // logic in computeEvalLoss is actually exercised.
    const blackMoved = tryMove("6k1/8/8/4b3/8/8/8/7K b - - 0 1", { from: "e5", to: "d4" })!;
    expect(blackMoved.move.color).toBe("b");
    expect(
      classifyMove({
        move: blackMoved.move,
        fenAfter: blackMoved.fenAfter,
        color: "b",
        legalMoveCountBefore: 13,
        evalBefore: -5,
        evalAfter: -8, // would otherwise read (mirrored for Black) as a 3cp loss -> "excellent"
        playedUci: moveUci(blackMoved.move),
        bestUci: moveUci(blackMoved.move),
      }),
    ).toBe("best");
  });

  it("regression (item 9): the exact live production contradiction — played d5, best d5, small independent-search eval noise — classifies Best with zero loss, never Excellent with a nonzero loss", () => {
    // Reproduces the reported live bug: Played=d5, Best=d5, displayed
    // "Eval loss: -3cp", Rating: Excellent — internally inconsistent,
    // since an identical played/best move can never have actually lost
    // anything. A real Black pawn push to d5 (d7-d5), so this exercises
    // the actual UCI string a "d5" move produces, not a hand-typed
    // stand-in.
    const blackMoved = tryMove("3k4/3p4/8/8/8/8/8/7K b - - 0 1", { from: "d7", to: "d5" })!;
    expect(blackMoved.move.san).toBe("d5");
    expect(moveUci(blackMoved.move)).toBe("d7d5");
    const result = classifyMove({
      move: blackMoved.move,
      fenAfter: blackMoved.fenAfter,
      color: "b",
      legalMoveCountBefore: 6,
      evalBefore: -5,
      evalAfter: -8,
      playedUci: moveUci(blackMoved.move),
      bestUci: moveUci(blackMoved.move),
    });
    expect(result).toBe("best");
    expect(computeEvalLoss(-5, -8, "b", moveUci(blackMoved.move), moveUci(blackMoved.move))).toBe(0);
  });
});
