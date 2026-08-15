/**
 * Star tiering for a completed lesson, derived from the mistake count and
 * hint usage on the learner's best-ever run (LessonCompletion.mistakes /
 * .hintsUsed). Raw counts are what's stored in the DB; this mapping lives
 * here so the tiering rule can change without a migration.
 *
 * Hints count because completing a lesson with zero wrong clicks but a
 * revealed solution isn't a 3-star run — a real defect found during
 * review: the previous mistakes-only formula awarded 3 stars to a run
 * that used a hint, since hint usage was never tracked at all.
 */
export function starsForPerformance(mistakes: number, hintsUsed: number): 1 | 2 | 3 {
  if (mistakes === 0 && hintsUsed === 0) return 3;
  if (mistakes <= 2 && hintsUsed <= 2) return 2;
  return 1;
}

/** One-line explanation of why a run earned its star count, for the completion screen. */
export function starsExplanation(mistakes: number, hintsUsed: number): string {
  const stars = starsForPerformance(mistakes, hintsUsed);
  if (stars === 3) return "Perfect run — no mistakes, no hints.";
  const parts: string[] = [];
  if (mistakes > 0) parts.push(`${mistakes} mistake${mistakes === 1 ? "" : "s"}`);
  if (hintsUsed > 0) parts.push(`${hintsUsed} hint${hintsUsed === 1 ? "" : "s"} used`);
  const detail = parts.join(" and ");
  return stars === 2
    ? `${detail} — a couple of slips, but a solid run. Try again for a perfect score.`
    : `${detail} — this one needed real help. Revisit it once it feels more familiar.`;
}
