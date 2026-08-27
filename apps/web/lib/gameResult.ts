import { gameStatus } from "@movewise/chess-rules";
import { sideToMove } from "@movewise/engine";

export type PlayerColor = "w" | "b";

/** Display label for a `Game.result` value (schema.prisma) — shared so game-history's list and detail pages can't drift out of sync with each other. */
export const RESULT_LABEL: Record<string, string> = {
  win: "Won",
  loss: "Lost",
  draw: "Draw",
  resigned: "Resigned",
};

/**
 * From the learner's own perspective — matches `Game.result`/
 * `Game.endReason` (schema.prisma) and the PGN's standard result tag.
 * Extracted from components/PlayRunner.tsx so this decision logic (who
 * actually won, in both the app's own vocabulary and PGN's) can be unit
 * tested directly rather than only exercised live through a played game.
 */
export function computeGameResult(
  fen: string,
  playerColor: PlayerColor,
  resigned: boolean,
): { result: "win" | "loss" | "draw" | "resigned"; endReason: string; pgnResult: "1-0" | "0-1" | "1/2-1/2" } {
  if (resigned) {
    return { result: "resigned", endReason: "resigned", pgnResult: playerColor === "w" ? "0-1" : "1-0" };
  }
  const status = gameStatus(fen);
  if (status === "checkmate") {
    // The side to move in a checkmated position is the one with no legal
    // moves left, in check — i.e. the one who lost.
    const playerLost = sideToMove(fen) === playerColor;
    const winnerColor: PlayerColor = playerLost ? (playerColor === "w" ? "b" : "w") : playerColor;
    return { result: playerLost ? "loss" : "win", endReason: "checkmate", pgnResult: winnerColor === "w" ? "1-0" : "0-1" };
  }
  return { result: "draw", endReason: status, pgnResult: "1/2-1/2" };
}
