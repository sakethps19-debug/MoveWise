import Link from "next/link";
import { prisma } from "@movewise/db";
import { loadUnitLessons } from "../lib/lessons";
import { loadUnitPrinciples } from "../lib/principles";
import { getSession } from "../lib/auth";
import { logoutAction } from "./actions";
import { LearningPath } from "../components/LearningPath";
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
    <main style={{ maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <h1>MoveWise</h1>
      <p style={{ opacity: 0.7 }}>Learn how to think during a chess game.</p>

      {user ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14 }}>
          <span>
            Signed in as {user.email} — {totalXp} XP, {completions?.size ?? 0} lesson
            {(completions?.size ?? 0) === 1 ? "" : "s"} completed
          </span>
          <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Link href="/account">Account</Link>
            <form action={logoutAction}>
              <button type="submit">Sign out</button>
            </form>
          </span>
        </div>
      ) : (
        <p style={{ fontSize: 14 }}>
          <Link href="/login">Sign in</Link> or <Link href="/signup">create an account</Link> to save your progress.
        </p>
      )}

      <p>
        <Link href="/play">Play vs. Stockfish →</Link>
      </p>

      {locked && (
        <p role="alert" style={{ background: "#fff4d6", padding: 12, borderRadius: 8 }}>
          {needsProficiency
            ? `"${locked}" is locked until your performance on "${needsProficiency}" is strong enough — completing the lessons isn't quite enough on its own. Try its exercises again for a stronger result.`
            : needs
              ? `"${locked}" is locked until you complete "${needs}" first.`
              : `"${locked}" is locked until you complete its prerequisites first.`}
        </p>
      )}

      <LearningPath units={units} completions={completions} conceptMastery={conceptMastery} />
    </main>
  );
}
