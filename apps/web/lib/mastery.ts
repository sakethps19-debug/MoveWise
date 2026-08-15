/**
 * Star tiering for a completed lesson, derived from the mistake count on
 * the learner's best-ever run (LessonCompletion.mistakes). Raw mistake
 * counts are what's stored in the DB; this mapping lives here so the
 * tiering rule can change without a migration.
 */
export function starsForMistakes(mistakes: number): 1 | 2 | 3 {
  if (mistakes === 0) return 3;
  if (mistakes <= 2) return 2;
  return 1;
}
