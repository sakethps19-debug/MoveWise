import { legalMoves, staticExchangeEval, type Move, type PieceSymbol, type Square } from "@movewise/chess-rules";
import type { MoveClassification } from "./gameAnalysis";
import { isSacrifice } from "./moveClassification";

/**
 * Detects 7 of docs/concept-taxonomy.md's 8 mapping-table rows — the ones
 * checkable from a single move's board state (plus, for
 * `queen-development-timing`, its own move number, for `back-rank-safety`,
 * one ply of the opponent's own legal replies, for `trade-evaluation`,
 * a real static exchange evaluation of the capture sequence, and for
 * `opposition-key-squares`, the material signature of the resulting
 * position — not a full move-history pattern) alone. Still out of reach:
 * clock data this app doesn't track at all (`candidate-move-routine` /
 * "time trouble") — that 1 remains undetected on purpose — a
 * mistake/blunder simply gets no `conceptIds` if none of the detectors
 * below match. See docs/known-risks.md for the full honest-scope-cut
 * writeup, including why `opposition-key-squares` is scoped the way it is.
 *
 * Only meaningful for a `mistake`/`blunder` move — `detectConcepts` gates
 * on that itself so callers don't have to duplicate the check.
 */

const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const KING_SAFETY_MOVE_THRESHOLD = 10;
const QUEEN_DEVELOPMENT_MOVE_THRESHOLD = 6;
const MINOR_PIECE_HOME_SQUARES: Record<"w" | "b", string[]> = {
  w: ["b1", "c1", "f1", "g1"],
  b: ["b8", "c8", "f8", "g8"],
};

function parseFenBoard(fen: string): (({ color: "w" | "b"; type: PieceSymbol }) | null)[][] {
  const rows = fen.split(" ")[0].split("/");
  return rows.map((row) => {
    const cells: (({ color: "w" | "b"; type: PieceSymbol }) | null)[] = [];
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < Number(ch); i++) cells.push(null);
      } else {
        cells.push({ color: ch === ch.toUpperCase() ? "w" : "b", type: ch.toLowerCase() as PieceSymbol });
      }
    }
    return cells;
  });
}

function pieceAt(board: ReturnType<typeof parseFenBoard>, square: string): { color: "w" | "b"; type: PieceSymbol } | null {
  const file = square.charCodeAt(0) - "a".charCodeAt(0);
  const rank = Number(square[1]);
  return board[8 - rank]?.[file] ?? null;
}

const KNIGHT_OFFSETS = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
] as const;

function knightAttackSquares(from: Square): string[] {
  const file = from.charCodeAt(0) - "a".charCodeAt(0);
  const rank = Number(from[1]);
  const squares: string[] = [];
  for (const [df, dr] of KNIGHT_OFFSETS) {
    const f = file + df;
    const r = rank + dr;
    if (f >= 0 && f <= 7 && r >= 1 && r <= 8) squares.push(`${String.fromCharCode("a".charCodeAt(0) + f)}${r}`);
  }
  return squares;
}

/**
 * `hanging-pieces`: the just-moved piece (a minor piece or higher — pawns
 * don't count) can be captured by the opponent for free. Shares its
 * mechanical check with `moveClassification.ts`'s `isSacrifice` — the
 * difference is intent, not mechanics: called here only for a move
 * already classified `mistake`/`blunder`, so an *unintentional* hang,
 * never a `brilliant` sacrifice for advantage. Known, documented
 * limitation: only catches the piece that just moved, not other pieces
 * left loose elsewhere on the board.
 */
export function detectHangingPiece(move: Move, fenAfter: string): boolean {
  return isSacrifice(move, fenAfter);
}

/**
 * `knight-fork`: after the mover's mistake, does the opponent have a
 * legal knight move landing on a square that attacks 2+ of the mover's
 * own king/minor-or-higher pieces at once? Known, documented limitation:
 * doesn't verify the fork was newly *enabled* by this move (i.e. it
 * doesn't also check the fork was unavailable before the move) — a fork
 * already latent in the position gets attributed to whichever move
 * happens to be classified mistake/blunder first.
 */
export function detectMissedKnightFork(fenAfter: string, moverColor: "w" | "b"): boolean {
  const board = parseFenBoard(fenAfter);
  const knightMoves = legalMoves(fenAfter).filter((m) => m.piece === "n");
  for (const km of knightMoves) {
    let attacked = 0;
    for (const square of knightAttackSquares(km.to)) {
      const occupant = pieceAt(board, square);
      if (occupant && occupant.color === moverColor && (occupant.type === "k" || PIECE_VALUE[occupant.type] >= 3)) {
        attacked++;
      }
    }
    if (attacked >= 2) return true;
  }
  return false;
}

/**
 * `king-safety-castling`: by `moveNumber` (a fixed, documented-as-a-guess
 * threshold — same "initial guess, not user-tested" honesty as star tiers,
 * ADR-0004), the mover's king is still sitting on its home square.
 */
export function detectKingLeftInCenter(fenAfter: string, color: "w" | "b", moveNumber: number): boolean {
  if (moveNumber < KING_SAFETY_MOVE_THRESHOLD) return false;
  const board = parseFenBoard(fenAfter);
  const homeSquare = color === "w" ? "e1" : "e8";
  const occupant = pieceAt(board, homeSquare);
  return occupant !== null && occupant.color === color && occupant.type === "k";
}

/**
 * `back-rank-safety`: after the mover's mistake, does the opponent have a
 * legal rook or queen move to the mover's own back rank that delivers
 * checkmate right now? Verified via the real move-legality/checkmate
 * engine — chess.js's own verbose moves already carry proper SAN mate
 * notation ("#"), computed by its own check/mate detection, so this is a
 * genuine one-ply-forward mate check, not a static "king behind pawns"
 * shape guess. That distinction matters: a castled king behind a normal
 * pawn shield is extremely common and isn't itself a mistake, so a shape-
 * only heuristic would flag most ordinary positions. Known, documented
 * limitation (same honesty as the other detectors' own noted gaps): only
 * catches an immediately-available mate-in-1 along the back rank itself —
 * not a slower "weak but not yet punishable" back rank, and not a
 * knight/bishop-assisted or smothered-mate variant.
 */
export function detectBackRankVulnerability(fenAfter: string, moverColor: "w" | "b"): boolean {
  const backRank = moverColor === "w" ? "1" : "8";
  return legalMoves(fenAfter).some(
    (m) => (m.piece === "r" || m.piece === "q") && m.to[1] === backRank && m.san.includes("#"),
  );
}

/**
 * `queen-development-timing`: the played move is a queen move, this early
 * (by `moveNumber`, a fixed, documented-as-a-guess threshold — same
 * honesty as `KING_SAFETY_MOVE_THRESHOLD`), while at least one minor
 * piece is still sitting on its own home square. No matching `Concept`
 * content exists yet (see docs/known-risks.md) — this still tags the raw
 * `MoveAnalysis` row truthfully, `lib/studyPlan.ts`'s lesson lookup just
 * has nothing to recommend for it until that content is authored, same
 * as `hanging-pieces`/`king-safety-castling` today.
 */
export function detectPrematureQueenDevelopment(
  move: Move,
  fenAfter: string,
  moverColor: "w" | "b",
  moveNumber: number,
): boolean {
  if (move.piece !== "q") return false;
  if (moveNumber > QUEEN_DEVELOPMENT_MOVE_THRESHOLD) return false;
  const board = parseFenBoard(fenAfter);
  return MINOR_PIECE_HOME_SQUARES[moverColor].some((square) => {
    const occupant = pieceAt(board, square);
    return occupant !== null && occupant.color === moverColor && (occupant.type === "n" || occupant.type === "b");
  });
}

/**
 * `trade-evaluation`: the played move was a capture, and a real static
 * exchange evaluation (`staticExchangeEval`, packages/chess-rules) of the
 * full recapture sequence on that square nets a material loss — a
 * genuinely bad trade, verified by actually playing out the exchange with
 * both sides recapturing with their least valuable piece and stopping
 * exactly when continuing would lose more, not a rough "did a bigger
 * piece take a smaller one" guess. `move.before` (chess.js's own field on
 * every verbose move, already relied on elsewhere — see `replayPgn`) is
 * the position immediately before this move, which is what the exchange
 * needs to evaluate from.
 */
export function detectUnfavorableTrade(move: Move): boolean {
  if (!move.captured) return false;
  return staticExchangeEval(move.before, move.from, move.to) < 0;
}

/**
 * `opposition-key-squares`: deliberately narrow scope, documented here and
 * in docs/known-risks.md. Real opposition/key-square theory (is this
 * particular king-and-pawn position actually winning, drawing, or losing,
 * and did the played move throw that away) needs a hand-verified or
 * tablebase-backed pawn-endgame solver — a much larger and riskier
 * undertaking than this pass takes on, and getting it subtly wrong would
 * violate the one rule that matters most here (never teach incorrect
 * chess). Instead of guessing at that theory, this leans on ground truth
 * that's already Stockfish-verified elsewhere: `detectConcepts` only ever
 * calls this for a move already classified `mistake`/`blunder` by the real
 * centipawn-loss classifier (`lib/moveClassification.ts`). This function's
 * only job is recognizing *where* that already-real mistake happened —
 * specifically, a position with nothing but kings and pawns on the board
 * for both sides, the material signature of a pawn ending, where
 * opposition and key squares are the standard reason a king-and-pawn
 * mistake happens. It does not explain *why* the move was wrong the way
 * the other detectors' geometric checks do.
 */
export function detectPawnEndgame(fenAfter: string): boolean {
  const board = parseFenBoard(fenAfter);
  return board.every((row) => row.every((cell) => cell === null || cell.type === "k" || cell.type === "p"));
}

export interface DetectConceptsInput {
  move: Move;
  fenAfter: string;
  color: "w" | "b";
  moveNumber: number;
  classification: MoveClassification;
}

/**
 * Every concept id `detectConcepts` can ever emit — the single source of
 * truth both it and scripts/validate-content.ts use, so a detector that
 * emits an id with no matching packages/content/concepts.json entry (a
 * real gap this list's cross-check caught: `opposition-key-squares` was
 * detected here but had no registry entry at all) fails validation
 * instead of quietly rendering as a raw slug wherever a concept title is
 * displayed (e.g. the Progress dashboard's "Mistakes from analysed
 * games", lib/principles.ts's loadConceptTitles()).
 */
export const DETECTABLE_CONCEPT_IDS = [
  "hanging-pieces",
  "knight-fork",
  "king-safety-castling",
  "queen-development-timing",
  "back-rank-safety",
  "trade-evaluation",
  "opposition-key-squares",
] as const;

/** Real concept ids from docs/concept-taxonomy.md's mapping table — see this file's own doc comment for which rows are, and aren't, detected. */
export function detectConcepts(input: DetectConceptsInput): string[] {
  if (input.classification !== "mistake" && input.classification !== "blunder") return [];
  const found: string[] = [];
  if (detectHangingPiece(input.move, input.fenAfter)) found.push("hanging-pieces");
  if (detectMissedKnightFork(input.fenAfter, input.color)) found.push("knight-fork");
  if (detectKingLeftInCenter(input.fenAfter, input.color, input.moveNumber)) found.push("king-safety-castling");
  if (detectPrematureQueenDevelopment(input.move, input.fenAfter, input.color, input.moveNumber)) {
    found.push("queen-development-timing");
  }
  if (detectBackRankVulnerability(input.fenAfter, input.color)) found.push("back-rank-safety");
  if (detectUnfavorableTrade(input.move)) found.push("trade-evaluation");
  if (detectPawnEndgame(input.fenAfter)) found.push("opposition-key-squares");
  return found;
}
