/**
 * Presentation-layer formatting for engine evaluations and eval-loss
 * values shown in the game review UI. Kept separate from
 * lib/moveClassification.ts (which decides the Best/Good/Blunder
 * category — unaffected by any of this) and lib/gameAnalysis.ts (which
 * stores the raw White-relative centipawn numbers `MoveAnalysis` was
 * already built around) — this file only decides how those numbers are
 * *displayed*, since a mate-encoded score (packages/engine's
 * `normalizeScore`, e.g. 99000 for "mate in 1") was never meant to be
 * printed as if it were a plain centipawn count. Before this existed,
 * `GameReviewPanel.tsx` did exactly that: a move that walked into mate
 * showed as literally "-99020cp", the "absurd value" bug this fixes.
 */
import { decodeMateDistance } from "@movewise/engine";

/** True if `score` (White-relative, packages/engine's convention) encodes a forced mate rather than an ordinary centipawn evaluation. */
export function isMateScore(score: number): boolean {
  return decodeMateDistance(score) !== null;
}

/** "M3" for White to mate in 3, "-M2" for Black to mate in 2 — never a raw 5-digit sentinel. Falls back to a plain centipawn string otherwise. */
export function formatEval(score: number): string {
  const mate = decodeMateDistance(score);
  if (mate !== null) return mate > 0 ? `M${mate}` : `-M${Math.abs(mate)}`;
  return score > 0 ? `+${score}cp` : `${score}cp`;
}

/**
 * Mate distance from the perspective of whichever side is `color`
 * ("the mover"), not White — positive means the mover has a forced
 * mate that many moves away, negative means the opponent does. `null`
 * when `score` isn't a mate score at all.
 */
function moverRelativeMate(score: number, color: "w" | "b"): number | null {
  const mate = decodeMateDistance(score);
  if (mate === null) return null;
  return color === "w" ? mate : -mate;
}

/**
 * The four required mate-transition phrases (docs: "Missed mate in 1",
 * "Allowed mate in 2", "Found checkmate", "Escaped a mating threat") —
 * `null` when this move isn't a mate-relevant transition at all, in
 * which case the caller falls back to ordinary classification text.
 * `isCheckmateNow` should come from the move's own SAN ("#" suffix) or
 * chess-rules' `gameStatus`, not from eval numbers — checkmate is a
 * rules fact, not a threshold on a score.
 */
export function describeMateTransition(
  evalBefore: number,
  evalAfter: number,
  color: "w" | "b",
  isCheckmateNow: boolean,
): string | null {
  if (isCheckmateNow) return "Found checkmate";

  const before = moverRelativeMate(evalBefore, color);
  const after = moverRelativeMate(evalAfter, color);

  // The mover had a forced mate available and didn't deliver it this move.
  if (before !== null && before > 0 && before <= 1) return "Missed mate in 1";
  if (before !== null && before > 1 && (after === null || after <= 0)) {
    return `Missed mate in ${before}`;
  }

  // This move handed the opponent a forced mate that wasn't there before.
  if (after !== null && after < 0 && (before === null || before >= 0)) {
    return `Allowed mate in ${Math.abs(after)}`;
  }

  // The mover was facing forced mate and this move got them out of it.
  if (before !== null && before < 0 && (after === null || after >= 0)) {
    return "Escaped a mating threat";
  }

  return null;
}

/**
 * What the "Eval loss" column actually shows: the mate-transition phrase
 * when either side of the move touches a mate score, otherwise the
 * ordinary `NNcp` (or "—" for zero) — a non-negative *magnitude*, never
 * a signed delta. A previous version recomputed the loss here from raw
 * evalBefore/evalAfter (via `computeEvalLoss` with no UCI arguments) and
 * always prepended a literal "-", independently of whatever
 * classification/evalLoss `MoveAnalysis` had already settled on — a real
 * production bug: a move classified `best` (loss 0, by UCI identity —
 * see lib/moveClassification.ts) could still display "-3cp" here,
 * because this function had silently redone the computation with less
 * information than `buildMoveAnalysis` had. Callers now pass the
 * already-computed `evalLoss` directly so the displayed number can never
 * drift from the classification it's shown next to.
 */
export function formatEvalLoss(
  evalBefore: number,
  evalAfter: number,
  color: "w" | "b",
  isCheckmateNow: boolean,
  evalLoss: number,
): string {
  if (isMateScore(evalBefore) || isMateScore(evalAfter)) {
    return describeMateTransition(evalBefore, evalAfter, color, isCheckmateNow) ?? "—";
  }
  return evalLoss > 0 ? `${evalLoss}cp` : "—";
}
