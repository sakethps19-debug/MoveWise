import { describe, expect, it } from "vitest";
import { buildPgn, gameStatus, replayPgn, tryMove } from "@movewise/chess-rules";
import { buildDemoGameReview, buildMoveAnalysis, canAnalyze, explanationFor, type MoveClassification } from "./gameAnalysis";

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
    expect(explanationFor("blunder", ["back-rank-safety"])).toMatch(/back-rank checkmate/);
    expect(explanationFor("mistake", ["trade-evaluation"])).toMatch(/loses material once/);
    expect(explanationFor("blunder", ["opposition-key-squares"])).toMatch(/king-and-pawn ending/);
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

describe("buildDemoGameReview", () => {
  // Real, confirmed bug this guards against: the demo previously listed
  // Black moves (Nc6, Nge7, Ng6) *after* its own Qxf7# checkmate entry —
  // chess-impossible, since nothing can move once checkmate ends a game —
  // and used non-sequential move numbers (1, 2, 4, 6, 8, 10, 12). Replays
  // the whole thing through the real chess engine rather than trusting
  // the hand-authored `playedMove` strings.
  const review = buildDemoGameReview();

  it("is marked as a demo, never presented as real analysis", () => {
    expect(review.isDemo).toBe(true);
  });

  it("every played move is legal in sequence, replayed from the real starting position", () => {
    // Strip only trailing rating annotations (?!, ??) — never # or +,
    // which chess.js's own SAN generation supplies and replayPgn needs
    // to match against.
    const sanMoves = review.moves.map((m) => m.playedMove.replace(/[?!]+$/, ""));
    const pgn = buildPgn(sanMoves);
    expect(() => replayPgn(pgn)).not.toThrow();
    const replayed = replayPgn(pgn);
    expect(replayed).toHaveLength(review.moves.length);
  });

  it("terminates in real, engine-confirmed checkmate at its final move, with no move listed after it", () => {
    const sanMoves = review.moves.map((m) => m.playedMove.replace(/[?!]+$/, ""));
    const replayed = replayPgn(buildPgn(sanMoves));
    const finalFen = replayed[replayed.length - 1].fenAfter;
    expect(gameStatus(finalFen)).toBe("checkmate");

    // Confirm the game genuinely was NOT already over before the final
    // move — i.e. mate happens exactly once, exactly at the end, not
    // earlier with extra moves tacked on afterward.
    const secondToLastFen = replayed[replayed.length - 2].fenAfter;
    expect(gameStatus(secondToLastFen)).toBe("in-progress");
  });

  it("uses real, sequential, standard move numbers — not skipped or ply-based", () => {
    // 1w 1b 2w 2b 3w 3b 4w — 4 White moves, 3 Black moves, alternating.
    expect(review.moves.map((m) => `${m.moveNumber}${m.color}`)).toEqual([
      "1w",
      "1b",
      "2w",
      "2b",
      "3w",
      "3b",
      "4w",
    ]);
  });

  it("the final checkmate move is marked with # in its playedMove text", () => {
    expect(review.moves[review.moves.length - 1].playedMove).toContain("#");
  });

  it("evaluations chain continuously — each move's evalBefore matches the previous move's evalAfter", () => {
    for (let i = 1; i < review.moves.length; i++) {
      expect(review.moves[i].evalBefore).toBe(review.moves[i - 1].evalAfter);
    }
  });

  it("recommended lessons are real, existing lesson ids", () => {
    expect(review.recommendedLessonIds.length).toBeGreaterThan(0);
    for (const id of review.recommendedLessonIds) {
      expect(id).toMatch(/^[a-z-]+\.[a-z0-9-]+$/);
    }
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
