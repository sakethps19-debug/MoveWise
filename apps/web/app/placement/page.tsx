import { loadPlacementPuzzles } from "../../lib/puzzles";
import { loadConceptTitles } from "../../lib/principles";
import { getSession } from "../../lib/auth";
import { PlacementRunner } from "../../components/PlacementRunner";
import { submitPlacementAction } from "../actions";

/**
 * P0's real placement assessment route — the "Take a placement
 * assessment" option offered to a casual/rated learner at onboarding
 * (lib/onboarding.ts), and always reachable directly for anyone who wants
 * to test past the guided lessons rather than self-report their level.
 */
export default async function PlacementPage() {
  const puzzles = loadPlacementPuzzles();
  const puzzlesById = Object.fromEntries(puzzles.map((p) => [p.id, p]));
  const conceptTitles = loadConceptTitles();
  const user = await getSession();

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "var(--mw-space-6) var(--mw-space-4)" }}>
      <PlacementRunner
        puzzlesById={puzzlesById}
        conceptTitles={conceptTitles}
        isGuest={!user}
        onSubmit={user ? submitPlacementAction : undefined}
      />
    </main>
  );
}
