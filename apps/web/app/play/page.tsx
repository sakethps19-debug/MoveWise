import { prisma } from "@movewise/db";
import { Nav } from "../../components/Nav";
import { PlayRunner } from "../../components/PlayRunner";
import { getSession } from "../../lib/auth";

export default async function PlayPage() {
  const user = await getSession();

  let totalXp = 0;
  if (user) {
    const rows = await prisma.lessonCompletion.findMany({ where: { userId: user.id } });
    totalXp = rows.reduce((sum, c) => sum + c.xpEarned, 0);
  }

  return (
    <div className="mw-app-shell">
      <Nav active="play" user={user ? { email: user.email } : null} totalXp={totalXp} />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "var(--mw-space-6) var(--mw-space-4)" }}>
        <PlayRunner />
      </main>
    </div>
  );
}
