import Link from "next/link";
import { prisma } from "@movewise/db";
import { loadUnitLessons } from "../lib/lessons";
import { getSession } from "../lib/auth";
import { logoutAction } from "./actions";

export default async function HomePage() {
  const lessons = loadUnitLessons("meet-the-pieces");
  const user = await getSession();

  let totalXp = 0;
  let completedCount = 0;
  if (user) {
    const completions = await prisma.lessonCompletion.findMany({ where: { userId: user.id } });
    totalXp = completions.reduce((sum, c) => sum + c.xpEarned, 0);
    completedCount = completions.length;
  }

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
      <h1>MoveWise</h1>
      <p style={{ opacity: 0.7 }}>Learn how to think during a chess game.</p>

      {user ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14 }}>
          <span>
            Signed in as {user.email} — {totalXp} XP, {completedCount} lesson{completedCount === 1 ? "" : "s"}{" "}
            completed
          </span>
          <form action={logoutAction}>
            <button type="submit">Sign out</button>
          </form>
        </div>
      ) : (
        <p style={{ fontSize: 14 }}>
          <Link href="/login">Sign in</Link> or <Link href="/signup">create an account</Link> to save your progress.
        </p>
      )}

      <p>
        <Link href="/play">Play vs. Stockfish →</Link>
      </p>
      <h2>Meet the Pieces</h2>
      <ol style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 20 }}>
        {lessons.map((lesson) => (
          <li key={lesson.id}>
            <Link href={`/learn/${lesson.id}`}>{lesson.title}</Link>
          </li>
        ))}
      </ol>
    </main>
  );
}
