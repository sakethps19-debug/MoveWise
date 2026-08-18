import { prisma } from "@movewise/db";
import { Nav } from "../../components/Nav";
import { PlayRunner } from "../../components/PlayRunner";
import { getSession } from "../../lib/auth";
import { loadLesson } from "../../lib/lessons";
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
  // every other lesson lookup in this app.
  const demoReview = buildDemoGameReview();
  const lessonTitleById = Object.fromEntries(
    demoReview.recommendedLessonIds.map((id) => [id, loadLesson(id)?.title ?? id]),
  );

  return (
    <div className="mw-app-shell">
      <Nav active="play" user={user ? { email: user.email } : null} totalXp={totalXp} />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "var(--mw-space-6) var(--mw-space-4)" }}>
        <PlayRunner demoReview={demoReview} lessonTitleById={lessonTitleById} />
      </main>
    </div>
  );
}
