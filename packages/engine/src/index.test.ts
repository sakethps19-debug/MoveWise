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

  it("decodes the deepest encoded distance, mate-in-99", () => {
    expect(decodeMateDistance(1000)).toBe(99);
  });

  it("returns null for an ordinary centipawn score, even a large one", () => {
    expect(decodeMateDistance(350)).toBeNull();
    expect(decodeMateDistance(-1250)).toBeNull();
  });

  it("returns null for a non-mate score that happens to be a round number below the encoding's own floor", () => {
    // 100 is a plausible real cp score (a pawn up) — nowhere near the
    // encoding's mate-in-99 floor of 1000, so must never be misread as one.
    expect(decodeMateDistance(100)).toBeNull();
  });

  it("returns null for zero", () => {
    expect(decodeMateDistance(0)).toBeNull();
  });

  it("round-trips every distance normalizeScore's own mate branch can produce", () => {
    for (let mateIn = 1; mateIn <= 99; mateIn++) {
      const whiteScore = 100000 - mateIn * 1000;
      expect(decodeMateDistance(whiteScore)).toBe(mateIn);
      expect(decodeMateDistance(-whiteScore)).toBe(-mateIn);
    }
  });
});
