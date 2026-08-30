import { describe, expect, it } from "vitest";
import { tryMove, moveUci, resolveUciToSan } from "@movewise/chess-rules";
import { classifyMove, computeEvalLoss } from "./moveClassification";
import { formatEvalLoss, describeMateTransition } from "./evalFormat";

/**
 * P0 "repair analysis trust": table-driven coverage of the 8 required
 * invariants, independent of (and more exhaustive than) the existing
 * item-8/item-9 regression tests in moveClassification.test.ts. Every
 * FEN below was verified legal and every move verified actually legal
 * from that FEN via a standalone chess.js script before being used here
 * — not eyeballed. Mate-sentinel numbers use packages/engine's own
 * encoding: sign * (100000 - min(|mateIn|, 99) * 1000).
 */

const mateSentinel = (mateIn: number, side: "w" | "b"): number => {
  const magnitude = 100000 - Math.min(mateIn, 99) * 1000;
  return side === "w" ? magnitude : -magnitude;
};

// A simple, neutral quiet move used wherever the test only cares about
// evalBefore/evalAfter/color, not the specific move's own tactical shape.
const QUIET_FEN = "6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1";
const quietMove = () => tryMove(QUIET_FEN, { from: "g1", to: "f1" })!;

describe("Invariant 1: played move equals engine's best move -> zero loss, classification Best", () => {
  it("White", () => {
    const { move, fenAfter } = quietMove();
    const uci = moveUci(move);
    const loss = computeEvalLoss(20, 17, "w", uci, uci);
    expect(loss).toBe(0);
    expect(
      classifyMove({ move, fenAfter, color: "w", evalBefore: 20, evalAfter: 17, legalMoveCountBefore: 20, playedUci: uci, bestUci: uci }),
    ).toBe("best");
  });

  it("Black", () => {
    const blackFen = "6k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1";
    const { move, fenAfter } = tryMove(blackFen, { from: "g8", to: "f8" })!;
    const uci = moveUci(move);
    const loss = computeEvalLoss(-5, -9, "b", uci, uci);
    expect(loss).toBe(0);
    expect(
      classifyMove({ move, fenAfter, color: "b", evalBefore: -5, evalAfter: -9, legalMoveCountBefore: 20, playedUci: uci, bestUci: uci }),
    ).toBe("best");
  });
});

describe("Invariants 2-4: non-negative magnitude, no negative-loss display for an improvement, correct perspective", () => {
  it("White mistake: eval drops from the mover's perspective -> positive loss, classified mistake", () => {
    const { move, fenAfter } = quietMove();
    const loss = computeEvalLoss(20, -150, "w");
    expect(loss).toBeGreaterThanOrEqual(0);
    expect(loss).toBe(170);
    expect(classifyMove({ move, fenAfter, color: "w", evalBefore: 20, evalAfter: -150, legalMoveCountBefore: 20 })).toBe(
      "mistake",
    );
  });

  it("Black mistake: White-relative eval rises (bad for Black) -> positive loss, classified mistake", () => {
    const blackFen = "6k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1";
    const { move, fenAfter } = tryMove(blackFen, { from: "g8", to: "f8" })!;
    const loss = computeEvalLoss(-20, 150, "b");
    expect(loss).toBe(170);
    expect(classifyMove({ move, fenAfter, color: "b", evalBefore: -20, evalAfter: 150, legalMoveCountBefore: 20 })).toBe(
      "mistake",
    );
  });

  it("White improvement: eval unambiguously improves for White -> loss is exactly 0, never negative", () => {
    const { move, fenAfter } = quietMove();
    const loss = computeEvalLoss(20, 300, "w");
    expect(loss).toBe(0);
    expect(loss).toBeGreaterThanOrEqual(0);
    const classification = classifyMove({ move, fenAfter, color: "w", evalBefore: 20, evalAfter: 300, legalMoveCountBefore: 20 });
    expect(["best", "brilliant"]).toContain(classification);
  });

  it("Black improvement: White-relative eval unambiguously drops (good for Black) -> loss is exactly 0, never negative", () => {
    const blackFen = "6k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1";
    const { move, fenAfter } = tryMove(blackFen, { from: "g8", to: "f8" })!;
    const loss = computeEvalLoss(-20, -300, "b");
    expect(loss).toBe(0);
    expect(loss).toBeGreaterThanOrEqual(0);
    const classification = classifyMove({ move, fenAfter, color: "b", evalBefore: -20, evalAfter: -300, legalMoveCountBefore: 20 });
    expect(["best", "brilliant"]).toContain(classification);
  });

  it("an improvement is never displayed with a negative loss magnitude", () => {
    const loss = computeEvalLoss(20, 900, "w");
    const text = formatEvalLoss(20, 900, "w", false, loss);
    expect(text).not.toMatch(/^-/);
    expect(text).toBe("—");
  });
});

describe("Invariant 5: mate values never enter centipawn subtraction (classification stays chess-correct)", () => {
  it("missed mate: mover had mate-in-1 and didn't deliver it — a real miss, not a raw-sentinel blunder or a false Best", () => {
    const { move, fenAfter } = quietMove();
    const evalBefore = mateSentinel(1, "w");
    const evalAfter = mateSentinel(4, "w"); // still a forced mate, just slower — NOT a 3000cp-magnitude "blunder"
    const classification = classifyMove({ move, fenAfter, color: "w", evalBefore, evalAfter, legalMoveCountBefore: 20 });
    expect(classification).toBe("mistake");
    expect(describeMateTransition(evalBefore, evalAfter, "w", false)).toBe("Missed mate in 1");
  });

  it("allowed mate: mover was fine before, now faces a forced mate that wasn't there — blunder", () => {
    const { move, fenAfter } = quietMove();
    const evalBefore = 50;
    const evalAfter = mateSentinel(3, "b"); // Black now has forced mate against White
    const classification = classifyMove({ move, fenAfter, color: "w", evalBefore, evalAfter, legalMoveCountBefore: 20 });
    expect(classification).toBe("blunder");
    expect(describeMateTransition(evalBefore, evalAfter, "w", false)).toBe("Allowed mate in 3");
  });

  it("found mate: the move itself delivers checkmate — always Best, regardless of the raw eval numbers either side of it", () => {
    // Re1-e8# — a real, previously-verified checkmate (back rank, king's own pawns block every escape).
    const { move, fenAfter } = tryMove("6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1", { from: "e1", to: "e8" })!;
    expect(move.san).toBe("Re8#");
    const classification = classifyMove({
      move,
      fenAfter,
      color: "w",
      evalBefore: mateSentinel(2, "w"),
      evalAfter: 0, // deliberately arbitrary/unreliable — must not affect the outcome
      legalMoveCountBefore: 20,
      isCheckmateNow: true,
    });
    expect(classification).toBe("best");
  });

  it("escaped forced mate: mover was facing forced mate before this move and isn't anymore — Best, not a numeric blunder", () => {
    const { move, fenAfter } = quietMove();
    const evalBefore = mateSentinel(2, "b"); // Black has forced mate against White
    const evalAfter = -50; // ordinary eval, mildly worse for White but no forced mate at all
    const classification = classifyMove({ move, fenAfter, color: "w", evalBefore, evalAfter, legalMoveCountBefore: 20 });
    expect(classification).toBe("best");
    expect(describeMateTransition(evalBefore, evalAfter, "w", false)).toBe("Escaped a mating threat");
  });

  it("mate-to-mate transition never produces a multi-thousand-cp numeric loss (the exact bug class this fixes)", () => {
    // Before this fix, mate-in-3 (97000) minus mate-in-5 (95000) read as
    // a 2000cp "loss" purely from sentinel subtraction.
    const loss = computeEvalLoss(mateSentinel(3, "w"), mateSentinel(5, "w"), "w");
    expect(loss).toBeLessThan(1000); // nowhere near the raw 2000cp sentinel delta
  });
});

describe("Invariant 6: best move, SAN, UCI, arrow and FEN all describe the same position", () => {
  it("resolveUciToSan's output, when re-parsed, touches the exact squares the engine's own UCI named", () => {
    const fen = "6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1";
    const san = resolveUciToSan(fen, "g1f1");
    expect(san).toBe("Kf1");
    const replayed = tryMove(fen, { from: "g1", to: "f1" })!;
    expect(replayed.move.san).toBe(san);
  });

  it("castling resolves through the exact same from/to squares as an ordinary king move", () => {
    const fen = "4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1";
    const san = resolveUciToSan(fen, "e1g1");
    expect(san).toBe("O-O");
  });
});

describe("Invariant 7: an illegal or unparsable engine move produces a recoverable fallback, never misleading output", () => {
  it("an illegal UCI move (three-square pawn push) falls back to the raw UCI string, not a fabricated SAN", () => {
    const fen = "6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1";
    const san = resolveUciToSan(fen, "f2f5"); // f2 can move at most 2 squares
    expect(san).toBe("f2f5"); // visibly wrong, never silently wrong
  });

  it("a UCI move naming an empty origin square falls back the same way", () => {
    const fen = "6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1";
    const san = resolveUciToSan(fen, "e4e5"); // nothing on e4
    expect(san).toBe("e4e5");
  });

  it("a garbled engine bestmove string ('(none)', e.g. no legal moves) never throws", () => {
    const fen = "6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1";
    expect(() => resolveUciToSan(fen, "(none)")).not.toThrow();
  });
});

describe("Special move shapes flow through the classification pipeline correctly", () => {
  it("promotion: a promoting move that is also the engine's own choice classifies Best with zero loss", () => {
    const { move, fenAfter } = tryMove("4k3/P7/8/8/8/8/8/4K3 w - - 0 1", { from: "a7", to: "a8", promotion: "q" })!;
    expect(move.san).toBe("a8=Q+");
    const uci = moveUci(move);
    expect(uci).toBe("a7a8q");
    const classification = classifyMove({
      move,
      fenAfter,
      color: "w",
      evalBefore: mateSentinel(9, "w"),
      evalAfter: 900,
      legalMoveCountBefore: 4,
      playedUci: uci,
      bestUci: uci,
    });
    expect(classification).toBe("best");
    expect(computeEvalLoss(mateSentinel(9, "w"), 900, "w", uci, uci)).toBe(0);
  });

  it("castling: a castling move flows through classification without special-case breakage", () => {
    const { move, fenAfter } = tryMove("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1", { from: "e1", to: "g1" })!;
    expect(move.san).toBe("O-O");
    const uci = moveUci(move);
    expect(uci).toBe("e1g1");
    const classification = classifyMove({
      move,
      fenAfter,
      color: "w",
      evalBefore: 20,
      evalAfter: 15,
      legalMoveCountBefore: 10,
      playedUci: uci,
      bestUci: uci,
    });
    expect(classification).toBe("best");
  });

  it("en passant: a real en passant capture flows through classification and reports the capture correctly", () => {
    const { move, fenAfter } = tryMove("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1", { from: "e5", to: "d6" })!;
    expect(move.san).toBe("exd6");
    expect(move.captured).toBe("p");
    const uci = moveUci(move);
    expect(uci).toBe("e5d6");
    const classification = classifyMove({
      move,
      fenAfter,
      color: "w",
      evalBefore: 20,
      evalAfter: 120,
      legalMoveCountBefore: 6,
      playedUci: uci,
      bestUci: uci,
    });
    expect(classification).toBe("best");
    expect(computeEvalLoss(20, 120, "w", uci, uci)).toBe(0);
  });
});
