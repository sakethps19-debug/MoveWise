import { legalMoves, type Move, type PieceSymbol } from "@movewise/chess-rules";
import { decodeMateDistance } from "@movewise/engine";
import type { MoveClassification } from "./gameAnalysis";

const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/**
 * True when the played move is, by identity, the exact move the engine
 * itself selected as best — compared as UCI ("e2e4"), never as SAN.
 * SAN can carry decorations (check "+", mate "#", disambiguation
 * letters) that are irrelevant to "is this the same move," and comparing
 * decorated strings is exactly what let a real production bug through:
 * the played move and the engine's best move were the identical UCI
 * move, but two *independent* depth-limited engine searches (one on the
 * position before the move, one re-searching the position after it) can
 * disagree by a few centipawns due to ordinary shallow-search variance —
 * producing a nonzero "eval loss" and a downgraded classification for a
 * move that was, in fact, exactly what the engine would have played.
 * `playedUci`/`bestUci` are optional so every existing caller (and every
 * historical `MoveAnalysis` row persisted before this fix, which has no
 * UCI recorded) keeps working unchanged — the override only ever
 * *removes* noise, never introduces a new failure mode when absent.
 */
export function isEngineBestByIdentity(playedUci?: string, bestUci?: string): boolean {
  return playedUci !== undefined && bestUci !== undefined && playedUci === bestUci;
}

/**
 * Centipawns lost relative to the pre-move evaluation, from the mover's
 * own perspective — always >= 0 (a non-negative *magnitude*, not a
 * signed delta — the caller decides separately whether to also show a
 * "-" prefix for "you lost ground," see lib/evalFormat.ts). `evalBefore`/
 * `evalAfter` are both White-relative, matching packages/engine's own
 * `normalizeScore` convention, so a Black move's loss is the mirror of
 * White's. When `playedUci`/`bestUci` are supplied and identical
 * (`isEngineBestByIdentity`), this returns exactly 0 regardless of what
 * the two independent engine searches actually reported — the played
 * move being *literally the engine's own selection* is stronger, more
 * stable evidence than a second, separately-searched centipawn number,
 * and it stabilises this measurement against depth-limited search noise
 * (which independently varies run to run) rather than trusting a
 * decorated-SAN identity check or a deeper-but-still-imperfect search to
 * happen to agree. Both `classifyMove` and `MoveAnalysis.evalLoss`
 * (gameAnalysis.ts's `buildMoveAnalysis`) call this exact function with
 * the exact same arguments, so the stored/classified value and the
 * displayed value can never independently drift apart.
 */
export function computeEvalLoss(
  evalBefore: number,
  evalAfter: number,
  color: "w" | "b",
  playedUci?: string,
  bestUci?: string,
  isCheckmateNow = false,
): number {
  if (isEngineBestByIdentity(playedUci, bestUci)) return 0;
  // Invariant: mate values never enter centipawn subtraction. A mate
  // sentinel (packages/engine's ±(100000 - 1000×mateDistance) encoding)
  // is not a real centipawn count — subtracting two of them (or a
  // sentinel and an ordinary score) produces a number with no chess
  // meaning. Real bug this guards against: mate-in-3 (97000) minus
  // mate-in-5 (95000) — still winning by force, just one move slower —
  // used to read as a 2000cp "loss" and classify as a blunder. Route
  // any mate-involving transition through the qualitative classifier
  // instead (mateAwareClassification), and report a band-representative
  // magnitude here that stays consistent with it, never raw subtraction.
  if (isMateInvolved(evalBefore, evalAfter)) {
    return MATE_TRANSITION_LOSS[mateAwareClassification(evalBefore, evalAfter, color, isCheckmateNow) ?? "best"];
  }
  const delta = color === "w" ? evalBefore - evalAfter : evalAfter - evalBefore;
  return Math.max(0, delta);
}

function isMateInvolved(evalBefore: number, evalAfter: number): boolean {
  return decodeMateDistance(evalBefore) !== null || decodeMateDistance(evalAfter) !== null;
}

/** Mate distance from the perspective of whichever side is `color` (the mover), not White — positive means the mover has a forced mate that many moves away, negative means the opponent does. `null` when `score` isn't a mate score at all. */
function moverRelativeMateDistance(score: number, color: "w" | "b"): number | null {
  const mate = decodeMateDistance(score);
  if (mate === null) return null;
  return color === "w" ? mate : -mate;
}

/** Representative non-negative "loss" magnitude per classification band, used only when a mate score makes real centipawn subtraction meaningless (see computeEvalLoss) — never displayed directly (lib/evalFormat.ts's formatEvalLoss always shows the mate-transition phrase instead for these cases), only used to keep the numeric field internally consistent with the classification it sits beside. */
const MATE_TRANSITION_LOSS: Record<MoveClassification, number> = {
  brilliant: 0,
  best: 0,
  excellent: 0,
  good: 0,
  inaccuracy: 30,
  mistake: 150,
  blunder: 500,
  forced: 0,
};

/**
 * Classifies a move whose evaluation touches a forced mate on either
 * side, from real chess facts (which side has a forced mate, and how
 * far away) rather than numeric cp-loss thresholds — see computeEvalLoss's
 * doc comment for why. Returns `null` when neither `evalBefore` nor
 * `evalAfter` is a mate score at all, in which case the caller falls
 * through to the ordinary threshold ladder. Kept in exact agreement with
 * lib/evalFormat.ts's `describeMateTransition` boundary conditions (both
 * treat "had a forced mate and didn't deliver it" as the same case) so
 * the displayed badge and its explanation text never disagree.
 */
function mateAwareClassification(
  evalBefore: number,
  evalAfter: number,
  color: "w" | "b",
  isCheckmateNow: boolean,
): MoveClassification | null {
  if (isCheckmateNow) return "best"; // delivering checkmate can never be improved upon
  const before = moverRelativeMateDistance(evalBefore, color);
  const after = moverRelativeMateDistance(evalAfter, color);
  if (before === null && after === null) return null;

  // The mover was facing forced mate before this move and isn't anymore.
  if (before !== null && before < 0 && (after === null || after >= 0)) return "best";

  // This move handed the opponent a forced mate that wasn't there before.
  if (after !== null && after < 0 && (before === null || before >= 0)) return "blunder";

  // The mover had a forced mate available and this wasn't the move that
  // delivered it — a real miss (matches describeMateTransition's "Missed
  // mate in N" exactly), even though the position typically remains
  // winning; never scored via raw sentinel subtraction.
  if (before !== null && before > 0) return "mistake";

  // Both before and after are forced mates against the mover (already
  // losing, still losing) — a faster incoming mate is a real error, a
  // slower one is a reasonable defensive try, not a blunder.
  if (before !== null && after !== null && before < 0 && after < 0) {
    return Math.abs(after) < Math.abs(before) ? "mistake" : "best";
  }

  // The mover created a forced mate that didn't exist before this move
  // (before was an ordinary eval, after is a forced mate for the mover).
  return "best";
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

/**
 * Centipawn-loss thresholds (mover's own perspective, from
 * `computeEvalLoss` — always >= 0). A move is classified by the first
 * bracket its loss falls into, checked in ascending order:
 *
 *   loss === 0                    -> best (or brilliant, see below)
 *   0  < loss <= EXCELLENT_MAX_LOSS (20cp)   -> excellent
 *   EXCELLENT < loss <= GOOD_MAX_LOSS (50cp) -> good
 *   GOOD  < loss <= INACCURACY_MAX_LOSS (100cp) -> inaccuracy
 *   INACCURACY < loss <= MISTAKE_MAX_LOSS (300cp) -> mistake
 *   loss > MISTAKE_MAX_LOSS                 -> blunder
 *
 * Two decision points sit outside this ladder: `forced` (checked first —
 * `legalMoveCountBefore <= 1` means there was no real choice, regardless
 * of eval) and `brilliant` (checked only within the `loss === 0`
 * bracket — a zero-loss move that also gives up material, per
 * `isSacrifice`, into a position that's decisively winning for the mover,
 * `BRILLIANT_EVAL_THRESHOLD` = 400cp). Fixed thresholds below are a first
 * defensible cut, not user-tested — same "documented as an initial
 * guess" honesty this codebase already applies to star tiers (ADR-0004).
 *
 * Perspective normalisation: `evalBefore`/`evalAfter` are always
 * White-relative (packages/engine's own `normalizeScore` convention) —
 * every function in this file that reads them (`computeEvalLoss`,
 * `classifyMove`'s own `moverEval` below) re-projects to the *mover's*
 * perspective before comparing against a threshold, by negating for
 * Black. Never compare a raw White-relative number against a
 * mover-perspective threshold directly — that sign flip is the one
 * mistake this file exists to get right every time, not per call site.
 */
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
  /** UCI form of the move actually played (chess-rules' `moveUci`) — compared against `bestUci` by identity, never by SAN. See `isEngineBestByIdentity`. */
  playedUci?: string;
  /** UCI form of the engine's own selected best move for the position before this move (packages/engine's raw `bestMove` string). */
  bestUci?: string;
  /** Whether this move delivered checkmate — read from `move.san`'s own "#" suffix (a rules fact) when omitted, never guessed from eval numbers. */
  isCheckmateNow?: boolean;
}

/**
 * ADR-0008's fixed 8-value classification (see gameAnalysis.ts's
 * MoveClassification doc comment). Centipawn loss (`computeEvalLoss`,
 * which itself applies the `playedUci`/`bestUci` identity override) is
 * the primary signal — see that function's own doc comment for why an
 * exact engine-best-move identity match always yields loss 0 here,
 * regardless of what two independently-run engine searches happened to
 * report.
 *
 * Mate transitions (item 6, "treat separately"): a mate-sentinel score
 * (packages/engine's ±(100000 - 1000×mateDistance) encoding) is only
 * ever safe to *compare* (sign/magnitude against a threshold) here, never
 * to *subtract* from another score (ordinary or mate) — subtracting two
 * mate sentinels produces a number with no chess meaning (e.g. mate-in-3
 * minus mate-in-5 reads as a 2000cp "loss" for a move that's still
 * winning by force, one move slower). `mateAwareClassification` decides
 * these transitions from the actual chess facts (which side has a forced
 * mate, how far away) instead, and `computeEvalLoss` routes through the
 * exact same decision so the classification and its numeric loss can
 * never disagree — see both functions' own doc comments.
 */
export function classifyMove(input: ClassifyMoveInput): MoveClassification {
  if (input.legalMoveCountBefore <= 1) return "forced";

  if (!isEngineBestByIdentity(input.playedUci, input.bestUci) && isMateInvolved(input.evalBefore, input.evalAfter)) {
    const isCheckmateNow = input.isCheckmateNow ?? input.move.san.endsWith("#");
    const mateClassification = mateAwareClassification(input.evalBefore, input.evalAfter, input.color, isCheckmateNow);
    if (mateClassification === "best") {
      const moverEval = input.color === "w" ? input.evalAfter : -input.evalAfter;
      if (moverEval >= BRILLIANT_EVAL_THRESHOLD && isSacrifice(input.move, input.fenAfter)) return "brilliant";
    }
    if (mateClassification !== null) return mateClassification;
  }

  const loss = computeEvalLoss(input.evalBefore, input.evalAfter, input.color, input.playedUci, input.bestUci);
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
