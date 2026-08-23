import "server-only";
import { findPrincipleByConceptId } from "./principles";
import type { MasteryStatus } from "./masteryModel";
import type { MoveAnalysis } from "./gameAnalysis";
import { rankConcepts } from "./studyPlanRanking";

/**
 * Maps a Play & Learn mistake's `conceptIds` to real lesson ids — the
 * filesystem-dependent half of the join point docs/concept-taxonomy.md
 * describes, kept out of lib/gameAnalysis.ts so that file stays safe to
 * import from a Client Component (see its own top doc comment). Server-
 * only: called from app/actions.ts (a Server Action) after the client's
 * own analysis pass has computed conceptIds, never from PlayRunner.tsx
 * directly.
 */
export function lessonIdsForConcepts(conceptIds: string[]): string[] {
  const ids: string[] = [];
  for (const conceptId of conceptIds) {
    const principle = findPrincipleByConceptId(conceptId);
    const lessonId = principle?.subLessonIds[0];
    if (lessonId) ids.push(lessonId);
  }
  return ids;
}

/**
 * The full pipeline: rank candidate concepts (lib/studyPlanRanking.ts,
 * pure and directly unit tested), then resolve each to a real lesson id,
 * deduping and re-capping since two different concepts can point at the
 * same sub-lesson.
 */
export function buildStudyPlan(
  moves: Pick<MoveAnalysis, "conceptIds" | "classification">[],
  conceptMastery: Map<string, MasteryStatus> | null,
): string[] {
  const rankedConceptIds = rankConcepts(moves, conceptMastery);
  const lessonIds: string[] = [];
  for (const conceptId of rankedConceptIds) {
    const principle = findPrincipleByConceptId(conceptId);
    const lessonId = principle?.subLessonIds[0];
    if (lessonId && !lessonIds.includes(lessonId)) lessonIds.push(lessonId);
    if (lessonIds.length >= 4) break;
  }
  return lessonIds;
}
