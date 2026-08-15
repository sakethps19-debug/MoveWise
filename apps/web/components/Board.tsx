"use client";

/**
 * Renders a chess position from a FEN string as an accessible button
 * grid. Preserves the accessibility convention proven in the
 * prototype: every square has an aria-label naming its contents
 * ("e4, white pawn" / "e5, empty"), and the selected square carries
 * aria-selected — the ARIA-correct state for a role="gridcell"
 * (role="gridcell" doesn't support aria-pressed at all; that's a
 * "button" pattern property, not a grid one — an axe-core check
 * flagged this as a real violation, not a style choice). Piece art is
 * the "Cburnett" SVG set (CC BY-SA 3.0, the same set Lichess uses by
 * default) — see public/pieces/CREDITS.md.
 *
 * Board state (selected square, legal targets, hints) is owned by
 * the caller (LessonRunner) — this component is presentation-only,
 * so it can also be reused unchanged for Play mode later.
 */
import type { Square } from "@movewise/chess-rules";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

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

/** Center of a square in an 8x8 (0..8) coordinate space, a8 at the top-left. */
function squareCenter(square: Square): { x: number; y: number } {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const rank = Number(square[1]);
  return { x: file + 0.5, y: 8 - rank + 0.5 };
}

export interface BoardProps {
  fen: string;
  selected?: Square | null;
  legalTargets?: Square[];
  highlightSquares?: Square[];
  lastMove?: { from: Square; to: Square } | null;
  /** Drawn as an arrow line/arrowhead overlay, e.g. for a hint's suggested move. */
  arrow?: { from: Square; to: Square } | null;
  onSquareClick?: (square: Square) => void;
  interactive?: boolean;
  /** id of an element (e.g. the exercise prompt) that describes what this board interaction is for. */
  describedBy?: string;
}

export function Board({
  fen,
  selected = null,
  legalTargets = [],
  highlightSquares = [],
  lastMove = null,
  arrow = null,
  onSquareClick,
  interactive = true,
  describedBy,
}: BoardProps) {
  const rows = parseFenBoard(fen);

  return (
    <div style={{ position: "relative", width: "min(92vw, 420px)" }}>
      <div
        className="movewise-board"
        role="grid"
        aria-label="Chessboard"
        aria-describedby={describedBy}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(8, 1fr)",
          width: "100%",
          aspectRatio: "1 / 1",
          border: "2px solid var(--board-border, #3a3a3a)",
        }}
      >
        {rows.map((row, rowIndex) => (
          // ARIA requires a gridcell's parent to have role="row" (an
          // axe-core "aria-required-parent" violation without this) —
          // display: contents keeps the row out of the box-layout tree so
          // the 64 gridcell buttons still lay out as direct children of
          // the CSS grid above (`grid-template-columns: repeat(8, 1fr)`),
          // while still being real DOM ancestors for the accessibility tree.
          <div role="row" key={`rank-${8 - rowIndex}`} style={{ display: "contents" }}>
            {row.map(({ square, piece }, colIndex) => {
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
                  aria-selected={isSelected}
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
                    cursor: interactive ? "pointer" : "default",
                    touchAction: "manipulation",
                  }}
                >
                  {piece && (
                    // eslint-disable-next-line @next/next/no-img-element -- tiny static vector art, no optimization needed
                    <img
                      src={`/pieces/${piece.color}${piece.type}.svg`}
                      alt=""
                      aria-hidden="true"
                      style={{ width: "80%", height: "80%" }}
                    />
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
            })}
          </div>
        ))}
      </div>
      {arrow && (
        <svg
          aria-hidden="true"
          viewBox="0 0 8 8"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
        >
          <defs>
            <marker id="movewise-arrowhead" markerWidth="3" markerHeight="3" refX="1.5" refY="1.5" orient="auto">
              <path d="M0,0 L3,1.5 L0,3 Z" fill="#c2410c" />
            </marker>
          </defs>
          {(() => {
            const from = squareCenter(arrow.from);
            const to = squareCenter(arrow.to);
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const length = Math.hypot(dx, dy) || 1;
            const startFrac = 0.18;
            const endFrac = 0.35;
            const x1 = from.x + (dx / length) * startFrac;
            const y1 = from.y + (dy / length) * startFrac;
            const x2 = to.x - (dx / length) * endFrac;
            const y2 = to.y - (dy / length) * endFrac;
            return (
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#c2410c"
                strokeWidth={0.12}
                strokeLinecap="round"
                markerEnd="url(#movewise-arrowhead)"
                opacity={0.85}
              />
            );
          })()}
        </svg>
      )}
    </div>
  );
}
