import Link from "next/link";
import { prisma } from "@movewise/db";
import { Nav } from "../../components/Nav";
import { PlayRunner } from "../../components/PlayRunner";
import { getSession } from "../../lib/auth";
import { allLessonTitles } from "../../lib/lessons";
import { buildDemoGameReview } from "../../lib/gameAnalysis";

export default async function PlayPage() {
  const user = await getSession();

  let totalXp = 0;
  if (user) {
    const rows = await prisma.lessonCompletion.findMany({ where: { userId: user.id } });
    totalXp = rows.reduce((sum, c) => sum + c.xpEarned, 0);
  }

  // Deterministic sample data (lib/gameAnalysis.ts) — resolved server-side
  // since lesson titles need filesystem access (lib/lessons.ts), same as
  // every other lesson lookup in this app. Every lesson's title, not just
  // the demo's own fixed set — a real game review's recommendations
  // (computed client-side, then resolved server-side, ADR-0008 Phase B)
  // can point at any lesson id, not a fixed known-in-advance set.
  const demoReview = buildDemoGameReview();
  const lessonTitleById = allLessonTitles();

  return (
    <div className="mw-app-shell">
      <Nav active="play" user={user ? { email: user.email } : null} totalXp={totalXp} />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "var(--mw-space-6) var(--mw-space-4)" }}>
        {user && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--mw-space-3)" }}>
            <Link href="/play/history" className="mw-btn mw-btn--ghost">
              Past games
            </Link>
          </div>
        )}
        <PlayRunner demoReview={demoReview} lessonTitleById={lessonTitleById} signedIn={user !== null} />
      </main>
    </div>
  );
}
