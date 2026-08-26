import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@movewise/db";
import { Nav } from "../../../components/Nav";
import { getSession } from "../../../lib/auth";
import { RESULT_LABEL } from "../../../lib/gameResult";

/**
 * ADR-0008 Phase B: a completed game's analysis was previously only
 * visible right after playing it — leaving the Play & Learn page lost
 * it, even though `Game`/`GameAnalysis` are real, persisted rows. This
 * lists every game a signed-in learner has played, each linking to
 * /play/history/[gameId] to view (or, for a game left unanalyzed, run)
 * its full review.
 */
export default async function GameHistoryPage() {
  const user = await getSession();
  if (!user) redirect("/play");

  const [games, completions] = await Promise.all([
    prisma.game.findMany({
      where: { userId: user.id },
      orderBy: { playedAt: "desc" },
      include: { analysis: { select: { id: true } } },
    }),
    prisma.lessonCompletion.findMany({ where: { userId: user.id } }),
  ]);
  const totalXp = completions.reduce((sum, c) => sum + c.xpEarned, 0);

  return (
    <div className="mw-app-shell">
      <Nav active="play" user={{ email: user.email }} totalXp={totalXp} />
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "var(--mw-space-6) var(--mw-space-4)" }}>
        <div className="mw-page-head">
          <div>
            <h1 className="mw-page-title">Past games</h1>
            <p className="mw-page-subtitle">
              Every completed Play &amp; Learn game — revisit one to see, or run, its full analysis.
            </p>
          </div>
          <Link href="/play" className="mw-btn mw-btn--ghost">
            Play a new game
          </Link>
        </div>

        {games.length === 0 ? (
          <p className="mw-page-subtitle">No games yet — finish a game in Play &amp; Learn and it&apos;ll show up here.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-2)" }}>
            {games.map((game) => (
              <Link key={game.id} href={`/play/history/${game.id}`} className="mw-lesson-node-link">
                <div className="mw-lesson-node mw-lesson-node--available">
                  <span className="mw-lesson-node-icon" aria-hidden="true">
                    ♟
                  </span>
                  <span className="mw-lesson-node-body">
                    <span className="mw-lesson-node-title">
                      {game.playerColor === "w" ? "White" : "Black"} · {RESULT_LABEL[game.result] ?? game.result}
                    </span>
                    <span className="mw-lesson-node-reason">
                      {new Date(game.playedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </span>
                  {game.analysis ? (
                    <span className="mw-badge mw-badge--success">Analyzed</span>
                  ) : (
                    <span className="mw-badge mw-badge--neutral">Not yet analyzed</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
