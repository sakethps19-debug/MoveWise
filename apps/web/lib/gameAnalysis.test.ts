import { describe, expect, it } from "vitest";
import { tryMove } from "@movewise/chess-rules";
import { buildMoveAnalysis, canAnalyze, explanationFor, type MoveClassification } from "./gameAnalysis";

const ALL_CLASSIFICATIONS: MoveClassification[] = [
  "brilliant",
  "best",
  "excellent",
  "good",
  "inaccuracy",
  "mistake",
  "blunder",
  "forced",
];

describe("explanationFor", () => {
  it("returns a non-empty explanation for every classification (docs/testing-strategy.md row 5)", () => {
    for (const classification of ALL_CLASSIFICATIONS) {
      expect(explanationFor(classification, [])).not.toBe("");
    }
  });

  it("sharpens mistake/blunder text when a concept detector fired", () => {
    expect(explanationFor("blunder", ["hanging-pieces"])).toMatch(/capture it for free/);
    expect(explanationFor("blunder", ["knight-fork"])).toMatch(/fork/);
    expect(explanationFor("mistake", ["king-safety-castling"])).toMatch(/king is still in the centre/);
    expect(explanationFor("mistake", ["queen-development-timing"])).toMatch(/queen out this early/);
  });

  it("falls back to generic classification text when no concept was detected", () => {
    expect(explanationFor("blunder", [])).toBe("A costly mistake — this loses significant material or position.");
  });
});

describe("buildMoveAnalysis", () => {
  const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  it("builds a real MoveAnalysis row from move + eval inputs, non-demo", () => {
    const result = tryMove(START_FEN, { from: "e2", to: "e4" })!;
    const analysis = buildMoveAnalysis({
      moveNumber: 1,
      color: "w",
      move: result.move,
      fenAfter: result.fenAfter,
      evalBefore: 20,
      evalAfter: 25,
      bestMoveSan: "e4",
      legalMoveCountBefore: 20,
    });
    expect(analysis.playedMove).toBe("e4");
    expect(analysis.classification).toBe("best");
    expect(analysis.evalLoss).toBe(0);
    expect(analysis.recommendedLessonIds).toEqual([]); // filled in server-side, not here
  });
});

describe("canAnalyze", () => {
  it("allows analysis when the fair-play flag is set (every game produced by this codebase today)", () => {
    expect(canAnalyze({ analysisAllowed: true })).toBe(true);
  });

  it("blocks analysis when the fair-play flag is false", () => {
    expect(canAnalyze({ analysisAllowed: false })).toBe(false);
  });
});
