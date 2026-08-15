import Link from "next/link";
import { prisma } from "@movewise/db";
import { loadUnitLessons } from "../lib/lessons";
import { loadUnitPrinciples } from "../lib/principles";
import { getSession } from "../lib/auth";
import { logoutAction } from "./actions";
import { LearningPath } from "../components/LearningPath";
import { Nav } from "../components/Nav";
import { DevResetControl } from "../components/DevResetControl";
import type { MasteryStatus } from "../lib/masteryModel";

const UNITS = [
  { id: "meet-the-pieces", title: "Meet the Pieces" },
  { id: "check-and-checkmate", title: "Check and Checkmate Basics" },
  { id: "basic-tactics", title: "Basic Tactics" },
];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ locked?: string; needs?: string; needsProficiency?: string }>;
}) {
  const { locked, needs, needsProficiency } = await searchParams;
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
      <Nav active="learn" user={user ? { email: user.email } : null} totalXp={totalXp} />
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "var(--mw-space-6) var(--mw-space-4)" }}>
        <div className="mw-page-head">
          <div>
            <h1 className="mw-page-title">Learn &amp; Play</h1>
            <p className="mw-page-subtitle">Learn how to think during a chess game.</p>
          </div>
          {user ? (
            <form action={logoutAction}>
              <button type="submit" className="mw-btn mw-btn--ghost">
                Sign out
              </button>
            </form>
          ) : (
            <div style={{ fontSize: 14 }}>
              <Link href="/login">Sign in</Link> or <Link href="/signup">create an account</Link>
            </div>
          )}
        </div>

        {process.env.NODE_ENV === "development" && <DevResetControl isGuest={!user} />}

        {locked && (
          <p role="alert" className="mw-feedback mw-feedback--error" style={{ marginBottom: "var(--mw-space-5)" }}>
            {needsProficiency
              ? `"${locked}" is locked until your performance on "${needsProficiency}" is strong enough — completing the lessons isn't quite enough on its own. Try its exercises again for a stronger result.`
              : needs
                ? `"${locked}" is locked until you complete "${needs}" first.`
                : `"${locked}" is locked until you complete its prerequisites first.`}
          </p>
        )}

        <LearningPath units={units} completions={completions} conceptMastery={conceptMastery} />
      </main>
    </div>
  );
}
