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
  { id: "tactical-vision", title: "Tactical Vision" },
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
  let evidenceLevels: Map<string, string> | null = null;
  let laterContradictedConceptIds = new Set<string>();
  // Which unlocked pools rest on an inferred-only placement signal
  // (never itself directly checked) rather than a direct item or real
  // subsequent practice — P1 "complete placement confirmation": these get
  // an optional "Confirm your placement result" prompt in PracticeHub, not
  // a lock (the content is already legitimately unlocked; this only offers
  // to convert that inference into a directly-checked fact). A concept
  // already run through confirmConceptAction (success or failure) is
  // excluded so it's never offered the prompt twice — see the
  // CONFIRMATION_OUTCOME_LEVELS comment below for exactly which
  // evidenceLevel values that means, and the real bug an earlier, broader
  // exclusion check caused.
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
    evidenceLevels = new Map(masteryRows.filter((m) => m.evidenceLevel).map((m) => [m.conceptId, m.evidenceLevel!]));
    laterContradictedConceptIds = new Set(
      masteryRows.filter((m) => m.evidenceLevel === "later_contradicted").map((m) => m.conceptId),
    );
    const evidence = (latestPlacement?.conceptEvidence as unknown as ConceptEvidence[] | null) ?? [];
    // Real, confirmed gap this fixes: submitPlacementAction (app/actions.ts)
    // writes UserConceptMastery status:"proficient" immediately for every
    // concept in BYPASS_EVIDENCE_LEVELS — directly_demonstrated AND
    // inferred_high_confidence both — so a masteryRow for an
    // inferred_high_confidence concept always exists by the time this page
    // loads. Excluding on "any masteryRow exists at all" (the previous
    // check) therefore excluded every single one of them, making the
    // "confirm your placement result?" prompt permanently unreachable for a
    // signed-in learner via its only real discovery path — reachable only
    // by guessing the /practice/confirm/[principleId] URL directly.
    // Excluding once `evidenceLevel` is confirmation_passed or
    // later_contradicted specifically (confirmation already attempted,
    // success or failure — see confirmConceptAction's own doc comment on
    // why it's never offered twice) is the correct "already confirmed"
    // signal — not "any evidenceLevel value", since those two are the only
    // values real app code ever writes to this column (every other
    // ConceptEvidenceLevel value lives only in PlacementAttempt.conceptEvidence
    // JSON, never here — see lib/placementEvidence.ts's own type comment).
    const CONFIRMATION_OUTCOME_LEVELS: ReadonlySet<string> = new Set(["confirmation_passed", "later_contradicted"]);
    const alreadyConfirmedConceptIds = new Set(
      masteryRows.filter((m) => m.evidenceLevel && CONFIRMATION_OUTCOME_LEVELS.has(m.evidenceLevel)).map((m) => m.conceptId),
    );
    unconfirmedConceptIds = new Set(
      [...conceptIdsAtOrAbove(evidence, NEEDS_CONFIRMATION_LEVELS)].filter((id) => !alreadyConfirmedConceptIds.has(id)),
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
          evidenceLevels={evidenceLevels}
          unconfirmedConceptIds={unconfirmedConceptIds}
          laterContradictedConceptIds={laterContradictedConceptIds}
        />
      </main>
    </div>
  );
}
