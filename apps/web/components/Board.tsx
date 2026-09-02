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

/**
 * Center of a square in an 8x8 (0..8) coordinate space, a8 at the
 * top-left by default; with `flipped`, h1 is at the top-left instead —
 * Black's own view of the board — so a hint arrow still points at the
 * square as actually displayed, not its absolute (White-oriented) spot.
 */
function squareCenter(square: Square, flipped: boolean): { x: number; y: number } {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const rank = Number(square[1]);
  const x = flipped ? 7 - file : file;
  const y = flipped ? rank - 1 : 8 - rank;
  return { x: x + 0.5, y: y + 0.5 };
}

export interface BoardProps {
  fen: string;
  selected?: Square | null;
  legalTargets?: Square[];
  highlightSquares?: Square[];
  /** Brief error feedback for a rejected move attempt (source + destination) — distinct from highlightSquares (hints) and lastMove (a real, successful move). */
  errorSquares?: Square[];
  lastMove?: { from: Square; to: Square } | null;
  /** Drawn as an arrow line/arrowhead overlay, e.g. for a hint's suggested move. */
  arrow?: { from: Square; to: Square } | null;
  onSquareClick?: (square: Square) => void;
  interactive?: boolean;
  /** id of an element (e.g. the exercise prompt) that describes what this board interaction is for. */
  describedBy?: string;
  /**
   * Desktop cap on the board's rendered width in px. Resolved as
   * `min(100%, maxWidth)` against the board's own immediate container,
   * not a viewport-relative unit — a `vw`-based cap ignores how much
   * space a real layout (e.g. a fixed-width nav rail plus a sidebar)
   * actually leaves available, which is exactly what let the board
   * overflow its container at some breakpoints before this was fixed.
   * Callers pick a value appropriate to their context
   * (docs/design/system.md's responsive strategy): lesson mode defaults
   * to a moderate size that still leaves room for the instruction/
   * feedback below it; Play & Learn passes a larger value since the
   * board is that screen's dominant element.
   */
  maxWidth?: number;
  /**
   * Renders from Black's own perspective — a8 at the bottom-right, h1 at
   * the top-left — instead of the default White-oriented view. A pure
   * display transform: `fen`/`selected`/`legalTargets`/etc. all stay in
   * absolute square-space (`onSquareClick` still reports the real square
   * tapped, e.g. "e5"), so nothing about move validation, analysis, or
   * any other consumer of a square id needs to know this happened.
   */
  flipped?: boolean;
}

export function Board({
  fen,
  selected = null,
  legalTargets = [],
  highlightSquares = [],
  errorSquares = [],
  lastMove = null,
  arrow = null,
  onSquareClick,
  interactive = true,
  describedBy,
  maxWidth = 560,
  flipped = false,
}: BoardProps) {
  const rows = parseFenBoard(fen);
  // Reversing both dimensions is a 180° rotation of the same grid — every
  // square keeps its real light/dark color (the (rowIndex+colIndex)%2
  // parity below is invariant under a full reversal), so nothing else
  // needs to change to render Black's own view of the board.
  const displayRows = flipped ? rows.slice().reverse().map((row) => row.slice().reverse()) : rows;

  return (
    <div className="mw-chessboard-shell" style={{ width: `min(100%, ${maxWidth}px)` }}>
      <div
        className="mw-chessboard"
        role="grid"
        aria-label={flipped ? "Chessboard, viewed from Black's side" : "Chessboard"}
        aria-describedby={describedBy}
      >
        {displayRows.map((row, rowIndex) => (
          // ARIA requires a gridcell's parent to have role="row" (an
          // axe-core "aria-required-parent" violation without this) —
          // display: contents keeps the row out of the box-layout tree so
          // the 64 gridcell buttons still lay out as direct children of
          // the CSS grid above (`grid-template-columns`/`-rows` in
          // design-system.css), while still being real DOM ancestors for
          // the accessibility tree.
          <div role="row" key={`row-${row[0]?.square ?? rowIndex}`} style={{ display: "contents" }}>
            {row.map(({ square, piece }, colIndex) => {
              const isLight = (rowIndex + colIndex) % 2 === 0;
              const isSelected = selected === square;
              const isLegal = legalTargets.includes(square);
              const isHighlighted = highlightSquares.includes(square);
              const isError = errorSquares.includes(square);
              const wasLastMove = lastMove?.from === square || lastMove?.to === square;
              const isLeftEdge = colIndex === 0;
              const isBottomEdge = rowIndex === 7;

              const label = piece
                ? `${square}, ${piece.color === "w" ? "white" : "black"} ${PIECE_NAMES[piece.type]}`
                : `${square}, empty`;

              return (
                <button
                  type="button"
                  key={square}
                  data-square={square}
                  role="gridcell"
                  aria-label={label}
                  aria-selected={isSelected}
                  disabled={!interactive}
                  onClick={() => onSquareClick?.(square)}
                  className="mw-chess-square"
                  style={{
                    // Only the state-dependent background/selection ring
                    // are inline (they vary per cell, per render); every
                    // geometry-affecting property (size, border, radius,
                    // padding) lives in the static .mw-chess-square class
                    // so it can never drift from square per-instance.
                    background: isError
                      ? "var(--mw-error-bg)"
                      : isHighlighted
                        ? "var(--mw-warning-bg)"
                        : wasLastMove
                          ? "var(--mw-sq-last-move)"
                          : isLight
                            ? "var(--mw-sq-light)"
                            : "var(--mw-sq-dark)",
                    boxShadow: isError
                      ? "inset 0 0 0 3px var(--mw-error)"
                      : isSelected
                        ? "inset 0 0 0 3px var(--mw-moss)"
                        : "none",
                    cursor: interactive ? "pointer" : "default",
                  }}
                >
                  {isLeftEdge && (
                    <span
                      aria-hidden="true"
                      className="mw-chess-coord mw-chess-coord--rank"
                      style={{
                        // Highlighted/last-move backgrounds aren't part of the
                        // light/dark checkerboard pair, so a label colored
                        // relative to *that* pair can land near-invisible on
                        // them (e.g. a light label on the light warning-bg
                        // highlight) — use the theme's ink color instead,
                        // which contrasts with every square background.
                        color: isError || isHighlighted || wasLastMove ? "var(--mw-text)" : isLight ? "var(--mw-sq-dark)" : "var(--mw-sq-light)",
                        opacity: isError || isHighlighted || wasLastMove ? 0.85 : 0.7,
                      }}
                    >
                      {square[1]}
                    </span>
                  )}
                  {isBottomEdge && (
                    <span
                      aria-hidden="true"
                      className="mw-chess-coord mw-chess-coord--file"
                      style={{
                        color: isError || isHighlighted || wasLastMove ? "var(--mw-text)" : isLight ? "var(--mw-sq-dark)" : "var(--mw-sq-light)",
                        opacity: isError || isHighlighted || wasLastMove ? 0.85 : 0.7,
                      }}
                    >
                      {square[0]}
                    </span>
                  )}
                  {piece && (
                    // eslint-disable-next-line @next/next/no-img-element -- tiny static vector art, no optimization needed
                    <img
                      src={`/pieces/${piece.color}${piece.type}.svg`}
                      alt=""
                      aria-hidden="true"
                      className="mw-chess-piece"
                    />
                  )}
                  {isLegal && !piece && (
                    <span aria-hidden="true" className="mw-chess-legal-dot" style={{ pointerEvents: "none" }} />
                  )}
                  {isLegal && piece && (
                    <span aria-hidden="true" className="mw-chess-capture-ring" style={{ pointerEvents: "none" }} />
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
              <path d="M0,0 L3,1.5 L0,3 Z" fill="var(--mw-brass-ink)" />
            </marker>
          </defs>
          {(() => {
            const from = squareCenter(arrow.from, flipped);
            const to = squareCenter(arrow.to, flipped);
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
                stroke="var(--mw-brass-ink)"
                strokeWidth={0.12}
                strokeLinecap="round"
                markerEnd="url(#movewise-arrowhead)"
                opacity={0.9}
              />
            );
          })()}
        </svg>
      )}
    </div>
  );
}
