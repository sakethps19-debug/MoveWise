/**
 * @movewise/chess-rules
 *
 * Thin, typed wrapper around chess.js. This is the ONLY module in the
 * monorepo allowed to import chess.js directly — everything else (the
 * exercise engine, the board UI, lesson content validation) goes through
 * this interface. That keeps the rules library swappable and keeps
 * lesson/exercise code from depending on chess.js's own types.
 *
 * The move-legality and game-status logic here is ported from the
 * MoveWise prototype (app/page.tsx), which used this exact chess.js
 * API surface correctly in a working freeform-game mode. This module
 * generalizes it for use by both authored lesson exercises and
 * freeform Play-mode games.
 */
import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";

export type { Move, PieceSymbol, Square };

export type GameStatus =
  | "in-progress"
  | "checkmate"
  | "stalemate"
  | "threefold-repetition"
  | "insufficient-material"
  | "fifty-move-draw"
  | "draw";

export interface MoveAttempt {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

/** True if the given FEN string is a well-formed, legal chess position. */
export function isLegalFen(fen: string): boolean {
  try {
    // chess.js throws on structurally invalid FEN (bad piece counts,
    // impossible castling rights, etc.) when strict-loaded.
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
}

/** Legal destination squares for the piece on `square`, given a position. */
export function legalTargetsFrom(fen: string, square: Square): Square[] {
  const game = new Chess(fen);
  return (game.moves({ square, verbose: true }) as Move[]).map((m) => m.to);
}

/** All legal moves in the position, in verbose form. */
export function legalMoves(fen: string): Move[] {
  return new Chess(fen).moves({ verbose: true }) as Move[];
}

/**
 * Attempts a move. Returns the resulting Move + new FEN on success,
 * or null if the move is illegal from this position — callers should
 * treat null as "illegal move" feedback, never throw it at the user
 * as an error.
 */
export function tryMove(
  fen: string,
  attempt: MoveAttempt,
): { move: Move; fenAfter: string } | null {
  const game = new Chess(fen);
  try {
    const move = game.move({
      from: attempt.from,
      to: attempt.to,
      promotion: attempt.promotion ?? "q",
    });
    return { move, fenAfter: game.fen() };
  } catch {
    return null;
  }
}

/** Whether `move` (SAN or UCI-like from/to) matches any of `expected`. */
export function moveMatches(move: Move, expected: string[]): boolean {
  const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
  return expected.some(
    (candidate) => candidate === move.san || candidate === uci || candidate === uci.slice(0, 4),
  );
}

export function gameStatus(fen: string): GameStatus {
  const game = new Chess(fen);
  if (game.isCheckmate()) return "checkmate";
  if (game.isStalemate()) return "stalemate";
  if (game.isThreefoldRepetition()) return "threefold-repetition";
  if (game.isInsufficientMaterial()) return "insufficient-material";
  if (game.isDrawByFiftyMoves()) return "fifty-move-draw";
  if (game.isDraw()) return "draw";
  return "in-progress";
}

export function isGameOver(fen: string): boolean {
  return gameStatus(fen) !== "in-progress";
}

export function inCheck(fen: string): boolean {
  return new Chess(fen).inCheck();
}

/**
 * Whether playing `attempt` from `fen` delivers checkmate. Used by
 * find-checkmate exercises and by the prototype's original
 * "does the reply mate?" scan pattern.
 */
export function isCheckmateMove(fen: string, attempt: MoveAttempt): boolean {
  const result = tryMove(fen, attempt);
  if (!result) return false;
  return gameStatus(result.fenAfter) === "checkmate";
}

/**
 * Human-readable description of a move, e.g. "capture the knight on
 * f6 with your bishop" or "move your rook from a1 to a4". Ported
 * from the prototype's `englishMove` helper — used to build
 * misconception-specific and hint-solution feedback text without
 * exposing raw algebraic notation to beginners.
 */
export function describeMove(_fen: string, move: Move): string {
  const piece = PIECE_NAMES[move.piece];
  const captured = move.captured ? PIECE_NAMES[move.captured] : null;
  return captured
    ? `capture the ${captured} on ${move.to} with your ${piece}`
    : `move your ${piece} from ${move.from} to ${move.to}`;
}

export function pieceNameOf(symbol: PieceSymbol): string {
  return PIECE_NAMES[symbol];
}
