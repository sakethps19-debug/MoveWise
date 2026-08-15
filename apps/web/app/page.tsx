import Link from "next/link";
import { prisma } from "@movewise/db";
import { loadUnitLessons } from "../lib/lessons";
import { getSession } from "../lib/auth";
import { logoutAction } from "./actions";
import { LearningPath } from "../components/LearningPath";

const UNITS = [
  { id: "meet-the-pieces", title: "Meet the Pieces" },
  { id: "check-and-checkmate", title: "Check and Checkmate Basics" },
  { id: "basic-tactics", title: "Basic Tactics" },
];

export default async function HomePage() {
  const units = UNITS.map((unit) => ({ ...unit, lessons: loadUnitLessons(unit.id) }));
  const user = await getSession();

  let totalXp = 0;
  let completions: Map<string, { xpEarned: number; mistakes: number }> | null = null;
  if (user) {
    const rows = await prisma.lessonCompletion.findMany({ where: { userId: user.id } });
    totalXp = rows.reduce((sum, c) => sum + c.xpEarned, 0);
    completions = new Map(rows.map((c) => [c.lessonId, { xpEarned: c.xpEarned, mistakes: c.mistakes }]));
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

      <LearningPath units={units} completions={completions} />
    </main>
  );
}
