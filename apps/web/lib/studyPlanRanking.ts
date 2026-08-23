import { PROFICIENT_STATUSES, type MasteryStatus } from "./masteryModel";
import type { MoveAnalysis } from "./gameAnalysis";

/**
 * The pure ranking half of docs/concept-taxonomy.md's "Recommendation
 * ranking" section — kept separate from lib/studyPlan.ts (which resolves
 * a conceptId to a real lesson id via filesystem access and is guarded
 * with "server-only") purely so this decision logic can be unit tested
 * directly, the same way lib/masteryModel.ts's pure functions are.
 *
 * Scoped honestly to what a single just-finished game can support: no
 * `RecurringMistakePattern`/cross-game history table exists yet, so
 * "repeated misconception" is approximated as "recurred within this one
 * game" rather than across a learner's full history. Implements 3 of the
 * doc's 5 ranking rules directly — never-studied, learned-but-not-
 * transferred, and repeated-in-this-game (folded into "one-time
 * oversight" as its inverse) — and skips "forgotten concept" (needs
 * `revision-due`, Phase C) and the calculation-vs-time-management
 * distinction (needs clock data this app doesn't track).
 */
export function rankConcepts(
  moves: Pick<MoveAnalysis, "conceptIds" | "classification">[],
  conceptMastery: Map<string, MasteryStatus> | null,
  cap = 4,
): string[] {
  const instructive = moves.filter((m) => m.classification === "mistake" || m.classification === "blunder");

  const conceptCounts = new Map<string, number>();
  for (const move of instructive) {
    for (const conceptId of move.conceptIds) {
      conceptCounts.set(conceptId, (conceptCounts.get(conceptId) ?? 0) + 1);
    }
  }

  const candidates = [...conceptCounts.entries()].filter(([conceptId, count]) => {
    const status = conceptMastery?.get(conceptId);
    if (!status) return true; // never studied — even one occurrence is worth prescribing
    if (count >= 2) return true; // repeated misconception, within this game
    if (PROFICIENT_STATUSES.has(status)) return true; // learned but not transferred — the single most valuable signal (concept-taxonomy.md)
    return false; // one-time oversight against an already-tracked, non-proficient concept — don't prescribe
  });

  // Never-studied and learned-but-not-transferred both rank above a
  // plain in-game repeat, then by recurrence count.
  const priority = (conceptId: string): number => {
    const status = conceptMastery?.get(conceptId);
    if (!status || PROFICIENT_STATUSES.has(status)) return 0;
    return 1;
  };
  candidates.sort((a, b) => priority(a[0]) - priority(b[0]) || b[1] - a[1]);

  return candidates.slice(0, cap).map(([conceptId]) => conceptId);
}
