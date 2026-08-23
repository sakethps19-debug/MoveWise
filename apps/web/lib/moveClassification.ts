import { legalMoves, type Move, type PieceSymbol } from "@movewise/chess-rules";
import type { MoveClassification } from "./gameAnalysis";

const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/**
 * Centipawns lost relative to the pre-move evaluation, from the mover's
 * own perspective — always >= 0. `evalBefore`/`evalAfter` are both
 * White-relative, matching packages/engine's own `normalizeScore`
 * convention, so a Black move's loss is the mirror of White's.
 */
export function computeEvalLoss(evalBefore: number, evalAfter: number, color: "w" | "b"): number {
  const delta = color === "w" ? evalBefore - evalAfter : evalAfter - evalBefore;
  return Math.max(0, delta);
}

/**
 * A real, deliberately narrow "sacrifice" heuristic: the moved piece (a
 * minor piece or higher — pawns don't count) can be captured by the
 * opponent immediately after the move. Known, documented limitation: this
 * only catches "did this exact piece get left capturable on this move," not
 * the fuller space of positional/exchange sacrifices a strong human
 * annotator would also call brilliant (a multi-move sac line, a gradual
 * exchange-sacrifice) — see docs/known-risks.md.
 */
export function isSacrifice(move: Move, fenAfter: string): boolean {
  if (PIECE_VALUE[move.piece] < 3) return false;
  return legalMoves(fenAfter).some((m) => m.to === move.to && m.captured !== undefined);
}

/** Centipawns, mover's own perspective — "decisively winning," not just "slightly ahead." */
const BRILLIANT_EVAL_THRESHOLD = 400;

const EXCELLENT_MAX_LOSS = 20;
const GOOD_MAX_LOSS = 50;
const INACCURACY_MAX_LOSS = 100;
const MISTAKE_MAX_LOSS = 300;

export interface ClassifyMoveInput {
  move: Move;
  fenAfter: string;
  color: "w" | "b";
  /** White-relative centipawns, the engine's evaluation of the position before this move. */
  evalBefore: number;
  /** White-relative centipawns, the engine's evaluation of the position after this move was played. */
  evalAfter: number;
  /** Number of legal moves available in the position before this move — 1 means there was no real choice. */
  legalMoveCountBefore: number;
}

/**
 * ADR-0008's fixed 8-value classification (see gameAnalysis.ts's
 * MoveClassification doc comment). Centipawn loss is the primary signal,
 * with two real decision points layered on top rather than a plain
 * lookup table: `forced` (no real choice existed) and `brilliant` (a
 * zero-loss move that also gives up material for a decisive result).
 * Fixed thresholds below are a first defensible cut, not user-tested —
 * same "documented as an initial guess" honesty this codebase already
 * applies to star tiers (ADR-0004).
 */
export function classifyMove(input: ClassifyMoveInput): MoveClassification {
  if (input.legalMoveCountBefore <= 1) return "forced";

  const loss = computeEvalLoss(input.evalBefore, input.evalAfter, input.color);
  if (loss === 0) {
    const moverEval = input.color === "w" ? input.evalAfter : -input.evalAfter;
    if (moverEval >= BRILLIANT_EVAL_THRESHOLD && isSacrifice(input.move, input.fenAfter)) {
      return "brilliant";
    }
    return "best";
  }
  if (loss <= EXCELLENT_MAX_LOSS) return "excellent";
  if (loss <= GOOD_MAX_LOSS) return "good";
  if (loss <= INACCURACY_MAX_LOSS) return "inaccuracy";
  if (loss <= MISTAKE_MAX_LOSS) return "mistake";
  return "blunder";
}
