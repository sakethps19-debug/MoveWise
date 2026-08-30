import { notFound } from "next/navigation";
import { loadUnitPrinciples, loadConceptTitles } from "../../../../lib/principles";
import { loadPuzzlesForPrinciple } from "../../../../lib/puzzles";
import { getSession } from "../../../../lib/auth";
import { ConfirmationActivity } from "../../../../components/ConfirmationActivity";

const UNIT_IDS = ["meet-the-pieces", "check-and-checkmate", "basic-tactics"];

/** At most 3 puzzles for a quick confirmation check — "1-3 legal, concept-specific positions", never the whole pool. */
const CONFIRMATION_PUZZLE_COUNT = 3;

export default async function ConfirmPrinciplePage({
  params,
}: {
  params: Promise<{ principleId: string }>;
}) {
  const { principleId } = await params;
  const principle = UNIT_IDS.flatMap((unitId) => loadUnitPrinciples(unitId)).find((p) => p.id === principleId);
  if (!principle) notFound();

  const puzzles = loadPuzzlesForPrinciple(principle).slice(0, CONFIRMATION_PUZZLE_COUNT);
  if (puzzles.length === 0) notFound();

  const conceptTitles = loadConceptTitles();
  const user = await getSession();

  return (
    <main style={{ padding: "var(--mw-space-6) var(--mw-space-4)" }}>
      <ConfirmationActivity
        puzzles={puzzles}
        conceptId={principle.conceptId}
        conceptTitle={conceptTitles[principle.conceptId] ?? principle.title}
        poolTitle={principle.title}
        poolHref={`/practice/${principle.id}`}
        isSignedIn={!!user}
      />
    </main>
  );
}
