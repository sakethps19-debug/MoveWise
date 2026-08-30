import { prisma } from "@movewise/db";
import { loadUnitLessons } from "../../../lib/lessons";
import { loadUnitPrinciples } from "../../../lib/principles";
import { loadPuzzlesForPrinciple } from "../../../lib/puzzles";
import { getSession } from "../../../lib/auth";
import type { MasteryStatus } from "../../../lib/masteryModel";
import type { ConceptEvidence } from "../../../lib/placementEvidence";
import { rankConceptsForPractice, type ConceptPracticeSignal, type RankedConcept } from "../../../lib/practiceScheduler";
import type { WarmUpCandidate } from "../../../lib/warmUp";
import { WarmUpRunner } from "../../../components/WarmUpRunner";

const UNIT_IDS = ["meet-the-pieces", "check-and-checkmate", "basic-tactics"] as const;
/** How many of a concept's most recent attempts count toward "recent incorrect attempts" — a short window, not a lifetime total, so an old rough patch doesn't keep a now-solid concept flagged forever. */
const RECENT_ATTEMPT_WINDOW = 5;

/**
 * P1 "build real personalized practice": this route previously only ever
 * looked at `frontierUnitId` (lib/warmUp.ts) — "which unit is the
 * learner's current chapter" — to decide what to serve. It now ranks
 * every concept the learner has real evidence for (lib/practiceScheduler.ts)
 * using review due dates, recent mistakes, mastery status, and placement
 * evidence confidence, and hands that ranking to WarmUpRunner, which
 * builds the actual puzzle queue from it (still respecting the manual
 * difficulty selector). A guest performs the equivalent ranking
 * client-side from their local data (WarmUpRunner.tsx) since there's no
 * session here to query.
 */
export default async function WarmUpPracticePage() {
  const user = await getSession();

  const units = UNIT_IDS.map((id) => ({
    id,
    lessons: loadUnitLessons(id),
    principles: loadUnitPrinciples(id),
  }));

  const candidates: WarmUpCandidate[] = units.flatMap((unit) =>
    unit.principles.flatMap((principle) =>
      loadPuzzlesForPrinciple(principle).map((puzzle) => ({ puzzle, unitId: unit.id, conceptId: principle.conceptId })),
    ),
  );
  const conceptIds = [...new Set(candidates.map((c) => c.conceptId))];

  let conceptMastery: Map<string, MasteryStatus> | null = null;
  let rankedConcepts: RankedConcept[] | null = null;

  if (user) {
    const [masteryRows, recentAttempts, latestPlacement] = await Promise.all([
      prisma.userConceptMastery.findMany({ where: { userId: user.id } }),
      prisma.exerciseAttempt.findMany({
        where: { userId: user.id, conceptIds: { hasSome: conceptIds } },
        orderBy: { createdAt: "desc" },
        select: { conceptIds: true, correct: true },
        take: 500,
      }),
      prisma.placementAttempt.findFirst({ where: { userId: user.id }, orderBy: { completedAt: "desc" } }),
    ]);
    conceptMastery = new Map(masteryRows.map((m) => [m.conceptId, m.status as MasteryStatus]));
    const masteryByConceptId = new Map(masteryRows.map((m) => [m.conceptId, m]));
    const evidenceByConceptId = new Map(
      ((latestPlacement?.conceptEvidence as unknown as ConceptEvidence[] | null) ?? []).map((e) => [e.conceptId, e.level]),
    );

    const recentByConceptId = new Map<string, boolean[]>();
    for (const attempt of recentAttempts) {
      for (const conceptId of attempt.conceptIds) {
        const list = recentByConceptId.get(conceptId);
        if (list) {
          if (list.length < RECENT_ATTEMPT_WINDOW) list.push(attempt.correct);
        } else {
          recentByConceptId.set(conceptId, [attempt.correct]);
        }
      }
    }

    const signals: ConceptPracticeSignal[] = conceptIds.map((conceptId) => {
      const mastery = masteryByConceptId.get(conceptId);
      const recent = recentByConceptId.get(conceptId) ?? [];
      return {
        conceptId,
        status: (mastery?.status as MasteryStatus | undefined) ?? null,
        exerciseConfidence: mastery?.exerciseConfidence ?? 0,
        lastPracticedAt: mastery?.lastPracticedAt ?? null,
        nextDueAt: mastery?.nextRevisionDueAt ?? null,
        placementEvidenceLevel: evidenceByConceptId.get(conceptId) ?? null,
        recentIncorrectCount: recent.filter((correct) => !correct).length,
      };
    });
    rankedConcepts = rankConceptsForPractice(signals);
  }

  return (
    <main>
      <WarmUpRunner
        candidates={candidates}
        conceptMastery={conceptMastery}
        rankedConcepts={rankedConcepts}
        isSignedIn={!!user}
      />
    </main>
  );
}
