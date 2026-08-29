import { prisma } from "@movewise/db";
import { loadUnitLessons } from "../../../lib/lessons";
import { loadUnitPrinciples } from "../../../lib/principles";
import { loadPuzzlesForPrinciple } from "../../../lib/puzzles";
import { getSession } from "../../../lib/auth";
import type { MasteryStatus } from "../../../lib/masteryModel";
import type { WarmUpCandidate } from "../../../lib/warmUp";
import { WarmUpRunner } from "../../../components/WarmUpRunner";

const UNIT_IDS = ["meet-the-pieces", "check-and-checkmate", "basic-tactics"] as const;

/**
 * P0 "personalize the Daily Warm-up" — previously a fixed, never-gated
 * pool (meet-the-pieces' board-basics puzzles) served identically to
 * every learner regardless of level; a rated player's warm-up was
 * elementary king-movement puzzles, exactly the "brutal user journey"
 * bug this pass exists to fix. Still never gated (no prerequisite check
 * here at all — this route stays reachable with zero lessons completed),
 * but the CONTENT now reflects the learner's real level: their placement
 * result or ordinary proficiency (lib/useDemonstratedConcepts.ts) picks
 * which unit's puzzles to draw from (lib/warmUp.ts's `frontierUnitId`),
 * and a manual difficulty selector plus "Too easy"/"Too hard" feedback
 * are always available on top of that (components/WarmUpRunner.tsx).
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

  let conceptMastery: Map<string, MasteryStatus> | null = null;
  if (user) {
    const masteryRows = await prisma.userConceptMastery.findMany({ where: { userId: user.id } });
    conceptMastery = new Map(masteryRows.map((m) => [m.conceptId, m.status as MasteryStatus]));
  }

  return (
    <main>
      <WarmUpRunner
        candidates={candidates}
        units={units.map((u) => ({ id: u.id, principles: u.principles.map((p) => ({ conceptId: p.conceptId })) }))}
        conceptMastery={conceptMastery}
        isSignedIn={!!user}
      />
    </main>
  );
}
