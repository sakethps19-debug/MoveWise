import { legalMoves, type Move, type PieceSymbol, type Square } from "@movewise/chess-rules";
import type { MoveClassification } from "./gameAnalysis";
import { isSacrifice } from "./moveClassification";

/**
 * Detects 3 of docs/concept-taxonomy.md's 8 mapping-table rows — the ones
 * checkable from a single move's board state alone, without move-history
 * pattern analysis (`queen-development-timing` needs to know it's still
 * the opening phase), static-exchange sophistication beyond raw material
 * (`trade-evaluation`), endgame-specific logic (`opposition-key-squares`),
 * a real back-rank mate-pattern detector (`back-rank-safety`), or clock
 * data this app doesn't track at all (`candidate-move-routine` / "time
 * trouble"). Those 5 remain undetected on purpose — a mistake/blunder
 * simply gets no `conceptIds` if none of the 3 below match. See
 * docs/known-risks.md for the full honest-scope-cut writeup.
 *
 * Only meaningful for a `mistake`/`blunder` move — `detectConcepts` gates
 * on that itself so callers don't have to duplicate the check.
 */

const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const KING_SAFETY_MOVE_THRESHOLD = 10;

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

export interface DetectConceptsInput {
  move: Move;
  fenAfter: string;
  color: "w" | "b";
  moveNumber: number;
  classification: MoveClassification;
}

/** Real concept ids from docs/concept-taxonomy.md's mapping table — see this file's own doc comment for which rows are, and aren't, detected. */
export function detectConcepts(input: DetectConceptsInput): string[] {
  if (input.classification !== "mistake" && input.classification !== "blunder") return [];
  const found: string[] = [];
  if (detectHangingPiece(input.move, input.fenAfter)) found.push("hanging-pieces");
  if (detectMissedKnightFork(input.fenAfter, input.color)) found.push("knight-fork");
  if (detectKingLeftInCenter(input.fenAfter, input.color, input.moveNumber)) found.push("king-safety-castling");
  return found;
}
