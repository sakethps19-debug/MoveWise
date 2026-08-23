import { describe, expect, it } from "vitest";
import { computeGameResult } from "./gameResult";

// Fool's mate: after 1.f3 e5 2.g4 Qh4#, Black delivers checkmate — White
// (the side to move) has no legal moves left. Verified directly via
// chess.js (isCheckmate() true, turn "w") before trusting it here.
const WHITE_CHECKMATED_FEN = "rnb1kbnr/pppp1ppp/8/8/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
// Scholar's Mate: 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7# — Black is the
// one checkmated. Verified by replaying the moves through chess.js
// directly (isCheckmate() true, turn "b"), not hand-derived from the FEN.
const BLACK_CHECKMATED_FEN = "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4";
const STALEMATE_FEN = "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1";

describe("computeGameResult", () => {
  it("a resigning White player loses, and the PGN result favors Black", () => {
    expect(computeGameResult("8/8/8/8/8/8/8/8 w - - 0 1", "w", true)).toEqual({
      result: "resigned",
      endReason: "resigned",
      pgnResult: "0-1",
    });
  });

  it("a resigning Black player loses, and the PGN result favors White", () => {
    expect(computeGameResult("8/8/8/8/8/8/8/8 b - - 0 1", "b", true)).toEqual({
      result: "resigned",
      endReason: "resigned",
      pgnResult: "1-0",
    });
  });

  it("White checkmated (side to move has no escape) loses when playing White", () => {
    expect(computeGameResult(WHITE_CHECKMATED_FEN, "w", false)).toEqual({
      result: "loss",
      endReason: "checkmate",
      pgnResult: "0-1",
    });
  });

  it("White checkmated means Black — the mover — wins when playing Black", () => {
    expect(computeGameResult(WHITE_CHECKMATED_FEN, "b", false)).toEqual({
      result: "win",
      endReason: "checkmate",
      pgnResult: "0-1",
    });
  });

  it("Black checkmated loses when playing Black, White wins the PGN result", () => {
    expect(computeGameResult(BLACK_CHECKMATED_FEN, "b", false)).toEqual({
      result: "loss",
      endReason: "checkmate",
      pgnResult: "1-0",
    });
  });

  it("Black checkmated means White wins when playing White", () => {
    expect(computeGameResult(BLACK_CHECKMATED_FEN, "w", false)).toEqual({
      result: "win",
      endReason: "checkmate",
      pgnResult: "1-0",
    });
  });

  it("a stalemate is a draw regardless of player color, with the standard draw PGN tag", () => {
    expect(computeGameResult(STALEMATE_FEN, "b", false)).toEqual({
      result: "draw",
      endReason: "stalemate",
      pgnResult: "1/2-1/2",
    });
  });
});
