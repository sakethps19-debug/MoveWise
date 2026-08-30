import { prisma } from "@movewise/db";
import { loadUnitLessons } from "../../lib/lessons";
import { loadUnitPrinciples } from "../../lib/principles";
import { getSession } from "../../lib/auth";
import { PracticeHub } from "../../components/PracticeHub";
import { Nav } from "../../components/Nav";
import type { MasteryStatus } from "../../lib/masteryModel";
import { conceptIdsAtOrAbove, NEEDS_CONFIRMATION_LEVELS, type ConceptEvidence } from "../../lib/placementEvidence";

const UNITS = [
  { id: "meet-the-pieces", title: "Meet the Pieces" },
  { id: "check-and-checkmate", title: "Check and Checkmate Basics" },
  { id: "basic-tactics", title: "Basic Tactics" },
];

export default async function PracticeHubPage() {
  const units = UNITS.map((unit) => ({
    ...unit,
    lessons: loadUnitLessons(unit.id),
    principles: loadUnitPrinciples(unit.id),
  }));
  const user = await getSession();

  let totalXp = 0;
  let completions: Map<string, { xpEarned: number; mistakes: number; hintsUsed: number }> | null = null;
  let conceptMastery: Map<string, MasteryStatus> | null = null;
  // Which unlocked pools rest on an inferred-only placement signal
  // (never itself directly checked) rather than a direct item or real
  // subsequent practice — P1 "complete placement confirmation": these get
  // an optional "Confirm your placement result" prompt in PracticeHub, not
  // a lock (the content is already legitimately unlocked; this only offers
  // to convert that inference into a directly-checked fact). Any concept
  // with its own UserConceptMastery row already (any status) has real,
  // more-current evidence than a possibly-stale placement attempt, so it's
  // excluded here regardless of what that placement said.
  let unconfirmedConceptIds = new Set<string>();
  if (user) {
    const [rows, masteryRows, latestPlacement] = await Promise.all([
      prisma.lessonCompletion.findMany({ where: { userId: user.id } }),
      prisma.userConceptMastery.findMany({ where: { userId: user.id } }),
      prisma.placementAttempt.findFirst({ where: { userId: user.id }, orderBy: { completedAt: "desc" } }),
    ]);
    totalXp = rows.reduce((sum, c) => sum + c.xpEarned, 0);
    completions = new Map(
      rows.map((c) => [c.lessonId, { xpEarned: c.xpEarned, mistakes: c.mistakes, hintsUsed: c.hintsUsed }]),
    );
    conceptMastery = new Map(masteryRows.map((m) => [m.conceptId, m.status as MasteryStatus]));
    const evidence = (latestPlacement?.conceptEvidence as unknown as ConceptEvidence[] | null) ?? [];
    unconfirmedConceptIds = new Set(
      [...conceptIdsAtOrAbove(evidence, NEEDS_CONFIRMATION_LEVELS)].filter((id) => !conceptMastery!.has(id)),
    );
  }

  return (
    <div className="mw-app-shell">
      <Nav active="practice" user={user ? { email: user.email } : null} totalXp={totalXp} />
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "var(--mw-space-6) var(--mw-space-4)" }}>
        <div className="mw-page-head">
          <div>
            <h1 className="mw-page-title">Practice</h1>
            <p className="mw-page-subtitle">
              Puzzle pools from every unit, plus anything due for review, gathered in one place.
            </p>
          </div>
        </div>

        <PracticeHub
          units={units}
          completions={completions}
          conceptMastery={conceptMastery}
          unconfirmedConceptIds={unconfirmedConceptIds}
        />
      </main>
    </div>
  );
}
