import { prisma } from "@movewise/db";
import { loadUnitLessons } from "../../lib/lessons";
import { loadUnitPrinciples } from "../../lib/principles";
import { getSession } from "../../lib/auth";
import { PracticeHub } from "../../components/PracticeHub";
import { Nav } from "../../components/Nav";
import type { MasteryStatus } from "../../lib/masteryModel";

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
  if (user) {
    const [rows, masteryRows] = await Promise.all([
      prisma.lessonCompletion.findMany({ where: { userId: user.id } }),
      prisma.userConceptMastery.findMany({ where: { userId: user.id } }),
    ]);
    totalXp = rows.reduce((sum, c) => sum + c.xpEarned, 0);
    completions = new Map(
      rows.map((c) => [c.lessonId, { xpEarned: c.xpEarned, mistakes: c.mistakes, hintsUsed: c.hintsUsed }]),
    );
    conceptMastery = new Map(masteryRows.map((m) => [m.conceptId, m.status as MasteryStatus]));
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

        <PracticeHub units={units} completions={completions} conceptMastery={conceptMastery} />
      </main>
    </div>
  );
}
