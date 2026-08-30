import { describe, expect, it } from "vitest";
import { decodeMateDistance, normalizeScore, parseUciLine, sideToMove } from "./index";

const WHITE_TO_MOVE = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const BLACK_TO_MOVE = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

describe("sideToMove", () => {
  it("reads white to move", () => {
    expect(sideToMove(WHITE_TO_MOVE)).toBe("w");
  });
  it("reads black to move", () => {
    expect(sideToMove(BLACK_TO_MOVE)).toBe("b");
  });
});

describe("normalizeScore", () => {
  it("leaves the score unchanged when white is to move", () => {
    expect(normalizeScore(150, WHITE_TO_MOVE)).toBe(150);
  });
  it("flips the score when black is to move, since UCI scores are side-relative", () => {
    expect(normalizeScore(150, BLACK_TO_MOVE)).toBe(-150);
  });
});

describe("parseUciLine", () => {
  it("recognizes uciok and readyok", () => {
    expect(parseUciLine("uciok")).toEqual({ kind: "uciok" });
    expect(parseUciLine("readyok")).toEqual({ kind: "readyok" });
  });

  it("extracts centipawn score, depth, and pv from an info line", () => {
    const line = "info depth 12 seldepth 18 score cp 34 nodes 50000 pv e2e4 e7e5 g1f3";
    expect(parseUciLine(line)).toEqual({
      kind: "info",
      score: 34,
      depth: 12,
      pv: ["e2e4", "e7e5", "g1f3"],
    });
  });

  it("converts a mate score into a large-magnitude centipawn-like value", () => {
    const line = "info depth 8 score mate 3 pv h5f7";
    const parsed = parseUciLine(line);
    expect(parsed.kind).toBe("info");
    if (parsed.kind === "info") {
      expect(parsed.score).toBe(100000 - 3 * 1000);
    }
  });

  it("negates the mate magnitude for a losing mate score", () => {
    const line = "info depth 8 score mate -2 pv h5f7";
    const parsed = parseUciLine(line);
    if (parsed.kind === "info") {
      expect(parsed.score).toBeLessThan(0);
    }
  });

  it("clamps a mate distance beyond MAX_ENCODED_MATE_DISTANCE to the encoding's own floor, staying in sync with decodeMateDistance's inverse", () => {
    const line = "info depth 8 score mate 40 pv h5f7";
    const parsed = parseUciLine(line);
    if (parsed.kind === "info") {
      expect(parsed.score).toBe(70000); // 100000 - 30*1000, the shared clamp
      expect(decodeMateDistance(parsed.score!)).toBe(30);
    }
  });

  it("extracts the best move", () => {
    expect(parseUciLine("bestmove e2e4 ponder e7e5")).toEqual({
      kind: "bestmove",
      move: "e2e4",
    });
  });

  it("falls back to (none) when bestmove has no move", () => {
    expect(parseUciLine("bestmove (none)")).toEqual({
      kind: "bestmove",
      move: "(none)",
    });
  });

  it("classifies unrecognized lines as other", () => {
    expect(parseUciLine("id name Stockfish 18")).toEqual({ kind: "other" });
  });
});

describe("decodeMateDistance", () => {
  it("decodes White mate-in-1 (normalizeScore's own encoding: 100000 - 1*1000)", () => {
    expect(decodeMateDistance(99000)).toBe(1);
  });

  it("decodes Black mate-in-2 as a negative distance", () => {
    expect(decodeMateDistance(-98000)).toBe(-2);
  });

  it("decodes the deepest encoded distance, mate-in-30", () => {
    expect(decodeMateDistance(70000)).toBe(30);
  });

  it("returns null for an ordinary centipawn score, even a large one", () => {
    expect(decodeMateDistance(350)).toBeNull();
    expect(decodeMateDistance(-1250)).toBeNull();
  });

  it("returns null for a non-mate score that happens to be a round number below the encoding's own floor", () => {
    // 100 is a plausible real cp score (a pawn up) — nowhere near the
    // encoding's floor, so must never be misread as one.
    expect(decodeMateDistance(100)).toBeNull();
  });

  it("regression: a real, confirmed production bug — an ordinary, exact-multiple-of-1000 centipawn evaluation (e.g. 1000, ten pawns of material up, entirely plausible after a few real blunders) must NEVER be misread as a mate score", () => {
    // Before this fix, decodeMateDistance(1000) returned 99 ("mate in
    // 99"), which this app's own audit-seeded analysis data actually hit
    // live: a real depth-10 evaluation of exactly 1000 produced a
    // fabricated "Missed mate in 99" explanation for an ordinary move.
    expect(decodeMateDistance(1000)).toBeNull();
    expect(decodeMateDistance(-1000)).toBeNull();
    // The entire range this used to falsely claim as "mate encoded"
    // (1000 up to the new floor) must now read as ordinary throughout —
    // not just at the one exact value the live bug happened to hit.
    for (const ordinary of [1000, 5000, 25000, 50000, 69000]) {
      expect(decodeMateDistance(ordinary)).toBeNull();
      expect(decodeMateDistance(-ordinary)).toBeNull();
    }
  });

  it("returns null for zero", () => {
    expect(decodeMateDistance(0)).toBeNull();
  });

  it("round-trips every distance normalizeScore's own mate branch can produce", () => {
    for (let mateIn = 1; mateIn <= 30; mateIn++) {
      const whiteScore = 100000 - mateIn * 1000;
      expect(decodeMateDistance(whiteScore)).toBe(mateIn);
      expect(decodeMateDistance(-whiteScore)).toBe(-mateIn);
    }
  });
});
