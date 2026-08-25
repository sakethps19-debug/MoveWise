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

/** Parses a UCI move like "e2e4" or "e7e8q" into a MoveAttempt. */
export function parseUci(uci: string): MoveAttempt {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: uci.length > 4 ? (uci[4] as PieceSymbol) : undefined,
  };
}

const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

/**
 * True if the given FEN string is a well-formed, *reachable* chess
 * position — not just one chess.js's own strict FEN loader accepts.
 * chess.js validates structural well-formedness (piece counts, impossible
 * castling rights, etc.) but does not by itself reject a FEN where the
 * side *not* about to move is in check — an unreachable game state (their
 * previous move would have had to leave their own king in check, which
 * chess disallows), documented as a known gap in
 * docs/content-authoring-guide.md. Detected by loading the same position
 * with side-to-move flipped and checking whether *that* side is in
 * check — chess.js's `inCheck()` only ever reports check for whichever
 * side is currently to move.
 */
export function isLegalFen(fen: string): boolean {
  let loaded: Chess;
  try {
    // chess.js throws on structurally invalid FEN (bad piece counts,
    // impossible castling rights, etc.) when strict-loaded.
    loaded = new Chess(fen);
  } catch {
    return false;
  }

  const parts = loaded.fen().split(" ");
  parts[1] = parts[1] === "w" ? "b" : "w";
  try {
    if (new Chess(parts.join(" ")).inCheck()) return false;
  } catch {
    // Flipping side-to-move can itself produce a position chess.js
    // rejects for unrelated structural reasons (e.g. en passant rights
    // that only make sense for the original side to move) — the FEN we
    // were actually asked about already loaded fine above, so that's not
    // a reason to reject it.
  }
  return true;
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

const RANK_ORDINAL: Record<string, string> = {
  "1": "1st",
  "2": "2nd",
  "3": "3rd",
  "4": "4th",
  "5": "5th",
  "6": "6th",
  "7": "7th",
  "8": "8th",
};

/**
 * The geometry fragment of a move-outcome sentence — "straight along the
 * e-file", "straight along the 4th rank", "diagonally", or (knights don't
 * have a file/rank/diagonal shape) "in an L-shape" — derived from the
 * move's own `from`/`to` squares, never hardcoded to one direction.
 */
function moveGeometryPhrase(move: Move): string {
  if (move.piece === "n") return "in an L-shape";
  if (move.from[0] === move.to[0]) return `straight along the ${move.to[0]}-file`;
  if (move.from[1] === move.to[1]) return `straight along the ${RANK_ORDINAL[move.to[1]]} rank`;
  return "diagonally";
}

/**
 * A board-accurate success sentence for a move, generated from the move
 * actually played rather than which answer a step's author expected.
 * Exists because a step whose prompt accepts more than one destination
 * shape (`acceptAnyLegalMove` / `altValid` in `MovePieceStepSchema`) can't
 * safely use a single hand-authored `successExplanation` string — e.g. a
 * "move the rook anywhere legal" step whose authored text says "straight
 * along the e-file" is simply wrong the moment the learner plays e4-a4
 * instead of e4-e8 (a real, confirmed bug: the board correctly accepted
 * and highlighted the move, but the explanation named the wrong file).
 * `components/exercises/MoveStep.tsx` uses this only when the move played
 * doesn't match a step's primary `expectedMoves` exactly — the primary
 * path keeps its richer, hand-authored text.
 */
export function describeMoveOutcome(move: Move): string {
  const piece = PIECE_NAMES[move.piece];
  const geometry = moveGeometryPhrase(move);
  if (move.captured) {
    return `${move.san} captures the ${PIECE_NAMES[move.captured]} — the ${piece} moved ${geometry} to ${move.to}.`;
  }
  return `That's a legal move — the ${piece} moved ${geometry} to ${move.to}.`;
}

/**
 * Replays a SAN move list from the starting position into a PGN string
 * (ADR-0008 Phase B: persisting completed Play-mode games). The only
 * function outside a fresh-position replay this module needs for
 * serialization — kept here, not in apps/web, since this module is the
 * only one allowed to import chess.js directly.
 */
export function buildPgn(sanMoves: string[], result: "1-0" | "0-1" | "1/2-1/2" | "*" = "*"): string {
  const game = new Chess();
  for (const san of sanMoves) game.move(san);
  game.header("Result", result);
  return game.pgn();
}

/**
 * The inverse of buildPgn: reconstructs each ply's move plus its FEN
 * before/after from a stored PGN (ADR-0008 Phase B — a persisted `Game`
 * row only keeps the PGN, not a live FEN-history array, so revisiting an
 * old game's analysis, or analyzing one for the first time after leaving
 * the page it was played on, needs to replay it). chess.js's own
 * `history({ verbose: true })` already carries `before`/`after` FEN per
 * move once a PGN is loaded — no manual replay loop needed.
 */
export function replayPgn(pgn: string): { move: Move; fenBefore: string; fenAfter: string }[] {
  const game = new Chess();
  game.loadPgn(pgn);
  return (game.history({ verbose: true }) as Move[]).map((move) => ({
    move,
    fenBefore: move.before,
    fenAfter: move.after,
  }));
}

const SEE_PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 1000 };

/**
 * Static exchange evaluation: the net material result (positive favors the
 * side capturing on `from`) if the piece on `from` captures the piece on
 * `to`, and both sides then recapture with their least valuable available
 * piece — stopping the sequence exactly when continuing would lose
 * material, the way a competent player would (a standard minimax "swap
 * algorithm" over the gain at each ply, not a naive sum of every possible
 * recapture). Uses chess.js's own `attackers()` for attacker geometry,
 * recomputed fresh after each virtual capture via `remove`/`put` — so a
 * rook or bishop revealed behind a piece that's just been traded away
 * (an "x-ray" attacker) is correctly picked up, not just the attackers
 * visible before the sequence started.
 *
 * The king is valued at 1000 here (not its usual 0) purely to order which
 * piece captures next — this ensures the king is only ever "used" as a
 * last resort, exactly as a real player would, without needing to special-
 * case it. Known limitation, same simplification classical SEE
 * implementations make: attacker geometry ignores pins and "moving into
 * check" — a piece that's geometrically able to capture on `to` but would
 * expose its own king is still counted as available. Verifying full
 * legality at every step of the sequence would need a much slower
 * fully-legal search instead of pure attack geometry, for a case (a pinned
 * piece being the *only* attacker available) narrow enough that every
 * other detector in this codebase accepts an equivalent simplification.
 */
export function staticExchangeEval(fen: string, from: Square, to: Square): number {
  const game = new Chess(fen);
  const initialAttacker = game.get(from);
  let initialVictim = game.get(to);
  if (!initialAttacker) return 0;

  // En passant: a pawn moving diagonally onto an empty square is only ever
  // legal as an en passant capture — the actual captured pawn sits behind
  // `to` (same file, `from`'s rank), not on `to` itself.
  let enPassantVictimSquare: Square | null = null;
  if (!initialVictim && initialAttacker.type === "p" && from[0] !== to[0]) {
    enPassantVictimSquare = `${to[0]}${from[1]}` as Square;
    initialVictim = game.get(enPassantVictimSquare);
  }

  const gains: number[] = [initialVictim ? SEE_PIECE_VALUE[initialVictim.type] : 0];
  let sideToCapture: "w" | "b" = initialAttacker.color === "w" ? "b" : "w";
  let capturingValue = SEE_PIECE_VALUE[initialAttacker.type];

  game.remove(from);
  if (enPassantVictimSquare) game.remove(enPassantVictimSquare);
  game.remove(to);
  game.put({ type: initialAttacker.type, color: initialAttacker.color }, to);

  let depth = 0;
  while (true) {
    const attackerSquares = game.attackers(to, sideToCapture);
    if (attackerSquares.length === 0) break;

    let leastSquare = attackerSquares[0]!;
    let leastValue = SEE_PIECE_VALUE[game.get(leastSquare)!.type];
    for (const square of attackerSquares.slice(1)) {
      const value = SEE_PIECE_VALUE[game.get(square)!.type];
      if (value < leastValue) {
        leastValue = value;
        leastSquare = square;
      }
    }

    depth++;
    gains[depth] = capturingValue - gains[depth - 1]!;

    const leastPiece = game.get(leastSquare)!;
    game.remove(leastSquare);
    game.remove(to);
    game.put({ type: leastPiece.type, color: leastPiece.color }, to);
    capturingValue = leastValue;
    sideToCapture = sideToCapture === "w" ? "b" : "w";
  }

  for (let i = depth; i > 0; i--) {
    gains[i - 1] = -Math.max(-gains[i - 1]!, gains[i]!);
  }
  return gains[0]!;
}
