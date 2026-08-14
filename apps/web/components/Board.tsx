"use client";

/**
 * Renders a chess position from a FEN string as an accessible button
 * grid. Preserves the accessibility convention proven in the
 * prototype: every square has an aria-label naming its contents
 * ("e4, white pawn" / "e5, empty"), and the selected square carries
 * aria-pressed. Piece glyphs use Unicode chess symbols rather than a
 * graphics dependency, keeping this component dependency-free — swap
 * in SVG piece art later without changing the interaction logic.
 *
 * Board state (selected square, legal targets, hints) is owned by
 * the caller (LessonRunner) — this component is presentation-only,
 * so it can also be reused unchanged for Play mode later.
 */
import type { Square } from "@movewise/chess-rules";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

const PIECE_GLYPHS: Record<string, string> = {
  wp: "♙", wn: "♘", wb: "♗", wr: "♖", wq: "♕", wk: "♔",
  bp: "♟", bn: "♞", bb: "♝", br: "♜", bq: "♛", bk: "♚",
};

const PIECE_NAMES: Record<string, string> = {
  p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king",
};

interface ParsedSquare {
  square: Square;
  piece: { color: "w" | "b"; type: string } | null;
}

/** Parses only the placement field of a FEN into an 8x8 (a8..h1) grid. */
export function parseFenBoard(fen: string): ParsedSquare[][] {
  const placement = fen.split(" ")[0];
  const rows = placement.split("/");
  return rows.map((row, rowIndex) => {
    const rank = 8 - rowIndex;
    const squares: ParsedSquare[] = [];
    let file = 0;
    for (const char of row) {
      if (/\d/.test(char)) {
        const empties = Number(char);
        for (let i = 0; i < empties; i++) {
          squares.push({ square: `${FILES[file]}${rank}` as Square, piece: null });
          file++;
        }
      } else {
        const color = char === char.toUpperCase() ? "w" : "b";
        const type = char.toLowerCase();
        squares.push({ square: `${FILES[file]}${rank}` as Square, piece: { color, type } });
        file++;
      }
    }
    return squares;
  });
}

export interface BoardProps {
  fen: string;
  selected?: Square | null;
  legalTargets?: Square[];
  highlightSquares?: Square[];
  lastMove?: { from: Square; to: Square } | null;
  onSquareClick?: (square: Square) => void;
  interactive?: boolean;
}

export function Board({
  fen,
  selected = null,
  legalTargets = [],
  highlightSquares = [],
  lastMove = null,
  onSquareClick,
  interactive = true,
}: BoardProps) {
  const rows = parseFenBoard(fen);

  return (
    <div
      className="movewise-board"
      role="grid"
      aria-label="Chessboard"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(8, 1fr)",
        width: "min(92vw, 420px)",
        aspectRatio: "1 / 1",
        border: "2px solid var(--board-border, #3a3a3a)",
      }}
    >
      {rows.flatMap((row, rowIndex) =>
        row.map(({ square, piece }, colIndex) => {
          const isLight = (rowIndex + colIndex) % 2 === 0;
          const isSelected = selected === square;
          const isLegal = legalTargets.includes(square);
          const isHighlighted = highlightSquares.includes(square);
          const wasLastMove = lastMove?.from === square || lastMove?.to === square;

          const label = piece
            ? `${square}, ${piece.color === "w" ? "white" : "black"} ${PIECE_NAMES[piece.type]}`
            : `${square}, empty`;

          return (
            <button
              type="button"
              key={square}
              role="gridcell"
              aria-label={label}
              aria-pressed={isSelected}
              disabled={!interactive}
              onClick={() => onSquareClick?.(square)}
              style={{
                position: "relative",
                background: isSelected
                  ? "#f0c419"
                  : isHighlighted
                    ? "#ffe9a8"
                    : wasLastMove
                      ? "#d7e8c8"
                      : isLight
                        ? "#eeeed2"
                        : "#769656",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "min(6vw, 32px)",
                cursor: interactive ? "pointer" : "default",
                touchAction: "manipulation",
              }}
            >
              {piece && (
                <span aria-hidden="true">{PIECE_GLYPHS[`${piece.color}${piece.type}`]}</span>
              )}
              {isLegal && !piece && (
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    width: "28%",
                    height: "28%",
                    borderRadius: "50%",
                    background: "rgba(0,0,0,0.25)",
                  }}
                />
              )}
              {isLegal && piece && (
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    inset: 2,
                    borderRadius: "50%",
                    border: "3px solid rgba(0,0,0,0.35)",
                  }}
                />
              )}
            </button>
          );
        }),
      )}
    </div>
  );
}
