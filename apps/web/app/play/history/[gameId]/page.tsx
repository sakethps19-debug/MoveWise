import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@movewise/db";
import { replayPgn } from "@movewise/chess-rules";
import { Nav } from "../../../../components/Nav";
import { AnalyzeStoredGame } from "../../../../components/AnalyzeStoredGame";
import { GameReviewWithRetry } from "../../../../components/GameReviewWithRetry";
import { getSession } from "../../../../lib/auth";
import { allLessonTitles } from "../../../../lib/lessons";
import { buildStoredGameReview } from "../../../../lib/studyPlan";
import type { MasteryStatus } from "../../../../lib/masteryModel";
import type { MoveAnalysis } from "../../../../lib/gameAnalysis";

const RESULT_LABEL: Record<string, string> = {
  win: "Won",
  loss: "Lost",
  draw: "Draw",
  resigned: "Resigned",
};

/**
 * Revisits one persisted `Game` (ADR-0008 Phase B). Already analyzed:
 * the stored review is reassembled server-side (lib/studyPlan.ts's
 * buildStoredGameReview) — recommendations are recomputed at read time,
 * not stored, so improved content later surfaces naturally without a
 * backfill. Not yet analyzed: hands off to AnalyzeStoredGame, which
 * reconstructs the game client-side (chess-rules' replayPgn) and runs
 * the same real analysis pipeline PlayRunner uses right after a game.
 */
export default async function GameHistoryDetailPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const user = await getSession();
  if (!user) redirect("/play");

  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game || game.userId !== user.id) notFound();

  const [analysis, completions] = await Promise.all([
    prisma.gameAnalysis.findUnique({ where: { gameId }, include: { moves: { orderBy: { ply: "asc" } } } }),
    prisma.lessonCompletion.findMany({ where: { userId: user.id } }),
  ]);
  const totalXp = completions.reduce((sum, c) => sum + c.xpEarned, 0);
  const lessonTitleById = allLessonTitles();

  return (
    <div className="mw-app-shell">
      <Nav active="play" user={{ email: user.email }} totalXp={totalXp} />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "var(--mw-space-6) var(--mw-space-4)" }}>
        <div className="mw-page-head">
          <div>
            <h1 className="mw-page-title">
              {game.playerColor === "w" ? "White" : "Black"} · {RESULT_LABEL[game.result] ?? game.result}
            </h1>
            <p className="mw-page-subtitle">
              {new Date(game.playedAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
          <Link href="/play/history" className="mw-btn mw-btn--ghost">
            Back to past games
          </Link>
        </div>

        {analysis ? (
          <GameReviewWithRetry
            review={await buildAnalyzedReview(analysis.moves, user.id)}
            lessonTitleById={lessonTitleById}
            fenBeforeByPly={replayPgn(game.pgn).map((p) => p.fenBefore)}
          />
        ) : (
          <AnalyzeStoredGame gameId={game.id} pgn={game.pgn} lessonTitleById={lessonTitleById} />
        )}
      </main>
    </div>
  );
}

async function buildAnalyzedReview(
  storedMoves: {
    moveNumber: number;
    color: string;
    playedMove: string;
    bestMove: string;
    evalBefore: number;
    evalAfter: number;
    evalLoss: number;
    classification: string;
    conceptIds: string[];
    explanation: string | null;
  }[],
  userId: string,
) {
  const masteryRows = await prisma.userConceptMastery.findMany({ where: { userId } });
  const conceptMastery = new Map(masteryRows.map((m) => [m.conceptId, m.status as MasteryStatus]));
  return buildStoredGameReview(
    storedMoves.map((m) => ({
      ...m,
      color: m.color as "w" | "b",
      classification: m.classification as MoveAnalysis["classification"],
      explanation: m.explanation ?? "",
    })),
    conceptMastery,
  );
}
