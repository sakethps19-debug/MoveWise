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

/** The standard chess starting position — the one FEN literal every caller that needs it should import instead of re-typing. */
export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

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

/** The piece on a square, or null if empty — for callers that just need to know what's there (e.g. Play mode's own-piece-vs-opponent-piece selection logic) without pulling in chess.js directly. */
export function pieceAt(fen: string, square: Square): { color: "w" | "b"; type: PieceSymbol } | null {
  const piece = new Chess(fen).get(square);
  return piece ? { color: piece.color, type: piece.type } : null;
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

/**
 * The canonical UCI form of a move ("e2e4", "e7e8q") — the single place
 * that formula lives, since SAN can be decorated (check "+", mate "#",
 * disambiguation letters) in ways that make it the wrong basis for an
 * identity comparison (e.g. "is the played move the engine's own best
 * move?", packages/engine's own UCI wire format).
 */
export function moveUci(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

/** Whether `move` (SAN or UCI-like from/to) matches any of `expected`. */
export function moveMatches(move: Move, expected: string[]): boolean {
  const uci = moveUci(move);
  return expected.some(
    (candidate) => candidate === move.san || candidate === uci || candidate === uci.slice(0, 4),
  );
}

/**
 * Resolves a SAN move string (e.g. an engine's suggested "best move",
 * stored as SAN) back into the board squares it touches, given the
 * exact position it was legal in. Deterministic and safe: SAN already
 * disambiguates a move uniquely within one legal position (chess
 * notation's own rule — two knights that could both reach the same
 * square get letter/number disambiguation), so this is not "inferring a
 * position from SAN" (the position `fen` is already known from stored
 * FEN history) — it only answers "which squares does this already-known-
 * legal move touch," for drawing a board arrow/highlight. Returns null
 * if no legal move in `fen` matches (shouldn't happen for a genuine
 * engine suggestion, but callers must handle it — e.g. by not drawing
 * an arrow — rather than assume it always resolves).
 */
export function sanToSquares(fen: string, san: string): { from: Square; to: Square } | null {
  const normalized = san.replace(/[+#]/g, "");
  const match = legalMoves(fen).find((m) => m.san.replace(/[+#]/g, "") === normalized);
  return match ? { from: match.from, to: match.to } : null;
}

/**
 * Turns an engine's raw UCI best-move string (e.g. packages/engine's
 * `bestMove`) into SAN for display, but only after verifying it's
 * actually legal in `fen` — the P0 "verify every best move is legal in
 * the associated FEN" requirement. An engine's own search should never
 * return an illegal move, but this is exactly the kind of invariant a
 * learner-facing product should verify rather than trust blindly: were
 * it ever wrong (a parsing bug, a stale position passed to the engine,
 * a future engine swap), this is the one place a bad move would surface
 * as a broken-looking display string rather than a wrong or misleading
 * "Best move: ..." claim — the raw UCI is returned unchanged rather than
 * a SAN, so it fails visibly instead of silently.
 */
export function resolveUciToSan(fen: string, uci: string): string {
  return tryMove(fen, parseUci(uci))?.move.san ?? uci;
}

/**
 * Real, confirmed bug this `sanHistory` parameter fixes: chess.js's own
 * `isThreefoldRepetition()` can only ever answer from the move history
 * recorded on the *same* `Chess` instance that played those moves — it
 * has no way to reconstruct "how many times has this exact position
 * occurred" from a bare FEN string alone, since a FEN is just a single
 * position, not a game. Every caller that only ever passed a bare FEN
 * here (components/PlayRunner.tsx's live status text and end-of-game
 * check, lib/gameResult.ts's `computeGameResult`, which decides what
 * actually gets *persisted* as a completed `Game`'s result) therefore
 * could never detect or declare a threefold-repetition draw, no matter
 * how many times a position actually repeated during play — a player
 * could shuffle the same position back and forth forever and the game
 * would just stay "in-progress" — even though `"threefold-repetition"`
 * has always been a real, documented `GameStatus` value, exercised by
 * this module's own test suite and by every downstream doc comment that
 * assumed it was reachable.
 *
 * `sanHistory`, when supplied, is every SAN move played so far *from the
 * standard starting position* — replayed here onto one fresh `Chess`
 * instance (the exact same replay technique `buildPgn` already uses)
 * before checking status, so the instance's own position history is
 * real and `isThreefoldRepetition()` can actually answer correctly.
 * Omitted (every existing caller that only ever has a single position to
 * check, e.g. a lesson mini-game exercise's own custom starting FEN, or
 * `isCheckmateMove`'s one-ply-ahead check below) falls back to exactly
 * the previous bare-FEN behavior — repetition detection simply isn't
 * possible without history, same as before, never a regression for
 * those callers.
 */
export function gameStatus(fen: string, sanHistory?: string[]): GameStatus {
  const game = new Chess();
  if (sanHistory && sanHistory.length > 0) {
    for (const san of sanHistory) game.move(san);
  } else {
    game.load(fen);
  }
  if (game.isCheckmate()) return "checkmate";
  if (game.isStalemate()) return "stalemate";
  if (game.isThreefoldRepetition()) return "threefold-repetition";
  if (game.isInsufficientMaterial()) return "insufficient-material";
  if (game.isDrawByFiftyMoves()) return "fifty-move-draw";
  if (game.isDraw()) return "draw";
  return "in-progress";
}

export function isGameOver(fen: string, sanHistory?: string[]): boolean {
  return gameStatus(fen, sanHistory) !== "in-progress";
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

const FILES = "abcdefgh";

function fileIndex(square: Square): number {
  return FILES.indexOf(square[0]);
}
function rankIndex(square: Square): number {
  return Number(square[1]);
}

/**
 * A concise, beginner-friendly reason a specific move attempt is illegal —
 * for live Play-mode feedback, not lesson content (lessons already have
 * their own authored wrong-answer copy). Real, confirmed gap: selecting a
 * piece then clicking an illegal destination previously did nothing at
 * all — no message, no explanation, just a silent no-op — leaving the
 * learner with no idea why. Deliberately approximate for the "blocked
 * path" / "leaves your king in check" cases (both share one fallback
 * message below) since chess.js doesn't expose *why* a geometrically-
 * plausible move was rejected, only that it was — this still beats no
 * explanation at all, and every distinguishable case (wrong piece,
 * wrong turn, own-piece capture, wrong shape for the piece) gets its
 * own accurate sentence.
 */
export function explainIllegalMove(fen: string, from: Square, to: Square): string {
  const game = new Chess(fen);
  const piece = game.get(from);
  if (!piece) return "There's no piece on that square.";
  if (piece.color !== game.turn()) return "That piece isn't yours to move right now.";

  const target = game.get(to);
  if (target && target.color === piece.color) return "You can't capture your own piece.";

  const pieceName = PIECE_NAMES[piece.type];
  const fileDelta = Math.abs(fileIndex(to) - fileIndex(from));
  const rankDelta = Math.abs(rankIndex(to) - rankIndex(from));

  if (piece.type === "p") {
    const forward = piece.color === "w" ? 1 : -1;
    const rankStep = rankIndex(to) - rankIndex(from);
    if (fileDelta === 0) {
      if (rankStep * forward <= 0) return "Pawns can only move forward.";
      if (rankDelta > 2) return `A pawn cannot move ${rankDelta} squares.`;
      if (target) return "Pawns can't capture by moving straight ahead.";
    } else if (fileDelta === 1 && rankDelta === 1) {
      if (rankStep * forward <= 0) return "Pawns can only capture diagonally forward.";
      if (!target) return "Pawns only move diagonally when capturing.";
    } else {
      return "Pawns move straight ahead, or diagonally only when capturing.";
    }
  } else if (piece.type === "n") {
    const isLShape = (fileDelta === 1 && rankDelta === 2) || (fileDelta === 2 && rankDelta === 1);
    if (!isLShape) return "That's not a knight move — it moves in an L-shape.";
  } else if (piece.type === "b") {
    if (fileDelta !== rankDelta || fileDelta === 0) return "Bishops only move diagonally.";
  } else if (piece.type === "r") {
    if (fileDelta !== 0 && rankDelta !== 0) return "Rooks only move in straight lines.";
  } else if (piece.type === "q") {
    if (fileDelta !== rankDelta && fileDelta !== 0 && rankDelta !== 0) {
      return "Queens move in straight lines or diagonals.";
    }
  } else if (piece.type === "k") {
    if (fileDelta > 1 || rankDelta > 1) return "Kings move only one square at a time (unless castling).";
  }

  return `That move would leave your king in check, or something blocks the ${pieceName}'s path.`;
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

const ALL_SQUARES: Square[] = (() => {
  const squares: Square[] = [];
  for (const file of "abcdefgh") for (const rank of "12345678") squares.push(`${file}${rank}` as Square);
  return squares;
})();

/**
 * Every square the piece on `square` attacks in this position — i.e. every
 * square where `game.attackers(target, colorOfPieceOnSquare)` includes
 * `square`, checked over all 64 squares. This is the piece's raw attack
 * pattern (chess.js's own `attackers()`, already relied on by
 * `staticExchangeEval` above), not the narrower "legal destinations"
 * `legalTargetsFrom` returns — a piece pinned to its own king still
 * *attacks* along its pattern even though moving there would be illegal,
 * which is the correct notion for tactics detection (e.g. import-time fork
 * classification: "this move attacks two enemy pieces at once" is a
 * pattern claim about the resulting position, not a legality claim about
 * a follow-up move). Used by scripts/import-lichess-puzzles.ts's theme
 * heuristics, offline and in batch, so the O(64) scan per call is cheap
 * relative to the import run as a whole.
 */
export function squaresAttackedBy(fen: string, square: Square): Square[] {
  const game = new Chess(fen);
  const piece = game.get(square);
  if (!piece) return [];
  return ALL_SQUARES.filter((target) => target !== square && game.attackers(target, piece.color).includes(square));
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
