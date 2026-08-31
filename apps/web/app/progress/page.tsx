import { prisma } from "@movewise/db";
import { Nav } from "../../components/Nav";
import { ProgressDashboard } from "../../components/ProgressDashboard";
import { getSession } from "../../lib/auth";
import { loadUnitLessons } from "../../lib/lessons";
import { loadConceptTitles, findPrincipleByConceptId } from "../../lib/principles";
import { buildProgressSummary, recommendNextAction } from "../../lib/progressSummary";
import { statusOf } from "../../lib/lessonStatus";
import { loadUnitPrinciples } from "../../lib/principles";
import type { MasteryStatus } from "../../lib/masteryModel";

const UNITS = [
  { id: "meet-the-pieces", title: "Meet the Pieces" },
  { id: "check-and-checkmate", title: "Check and Checkmate Basics" },
  { id: "basic-tactics", title: "Basic Tactics" },
  { id: "tactical-vision", title: "Tactical Vision" },
];

/**
 * Replaces the Nav's old "Progress — Soon" placeholder with a real
 * dashboard. Guests get a lighter, localStorage-only view (rendered
 * client-side by ProgressDashboard itself, since guest progress never
 * touches the server) — this server component only fetches the
 * signed-in, database-backed half.
 */
export default async function ProgressPage() {
  const user = await getSession();
  const unitsWithLessons = UNITS.map((u) => ({ ...u, lessons: loadUnitLessons(u.id) }));
  const totalLessons = unitsWithLessons.reduce((sum, u) => sum + u.lessons.length, 0);
  const conceptTitleById = loadConceptTitles();

  if (!user) {
    return (
      <div className="mw-app-shell">
        <Nav active="progress" user={null} totalXp={0} />
        <main style={{ maxWidth: 900, margin: "0 auto", padding: "var(--mw-space-6) var(--mw-space-4)" }}>
          <ProgressDashboard isGuest summary={null} nextAction={null} totalLessons={totalLessons} />
        </main>
      </div>
    );
  }

  const [completions, masteryRows, exerciseAttempts, games] = await Promise.all([
    prisma.lessonCompletion.findMany({ where: { userId: user.id } }),
    prisma.userConceptMastery.findMany({ where: { userId: user.id } }),
    prisma.exerciseAttempt.findMany({ where: { userId: user.id, puzzleId: { not: null } } }),
    prisma.game.findMany({
      where: { userId: user.id },
      include: { analysis: { include: { moves: true } } },
    }),
  ]);

  const lessonUnitById = new Map<string, string>();
  for (const u of unitsWithLessons) for (const l of u.lessons) lessonUnitById.set(l.id, u.id);

  const totalXp = completions.reduce((sum, c) => sum + c.xpEarned, 0);

  const conceptToPrincipleId: Record<string, string> = {};
  for (const m of masteryRows) {
    const principle = findPrincipleByConceptId(m.conceptId);
    if (principle) conceptToPrincipleId[m.conceptId] = principle.id;
  }

  const summary = buildProgressSummary({
    totalLessons,
    unitLessonCounts: unitsWithLessons.map((u) => ({ unitId: u.id, title: u.title, total: u.lessons.length })),
    completions: completions.map((c) => ({
      lessonId: c.lessonId,
      unitId: lessonUnitById.get(c.lessonId) ?? "",
      xpEarned: c.xpEarned,
      completedAt: c.completedAt,
    })),
    mastery: masteryRows.map((m) => ({
      conceptId: m.conceptId,
      status: m.status as MasteryStatus,
      lastPracticedAt: m.lastPracticedAt,
    })),
    conceptTitleById,
    conceptToPrincipleId,
    practiceAttempts: exerciseAttempts.map((a) => ({ correct: a.correct })),
    gamesPlayed: games.length,
    mistakes: games.flatMap((g) => g.analysis?.moves ?? []).filter((m) => m.conceptIds.length > 0),
  });

  const completedIds = new Set(completions.map((c) => c.lessonId));
  const conceptMastery = new Map(masteryRows.map((m) => [m.conceptId, m.status as MasteryStatus]));
  let nextLessonTitle: string | null = null;
  outer: for (const unit of unitsWithLessons) {
    const principles = loadUnitPrinciples(unit.id);
    const principlesById = new Map(principles.map((p) => [p.id, p]));
    for (const lesson of unit.lessons) {
      if (statusOf(lesson, completedIds, principlesById, principles, conceptMastery) === "available") {
        nextLessonTitle = lesson.title;
        break outer;
      }
    }
  }

  return (
    <div className="mw-app-shell">
      <Nav active="progress" user={{ email: user.email }} totalXp={totalXp} />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "var(--mw-space-6) var(--mw-space-4)" }}>
        <ProgressDashboard
          isGuest={false}
          summary={summary}
          nextAction={recommendNextAction(summary, nextLessonTitle)}
          totalLessons={totalLessons}
        />
      </main>
    </div>
  );
}
