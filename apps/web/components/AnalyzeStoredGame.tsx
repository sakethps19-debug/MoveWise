"use client";

import { replayPgn } from "@movewise/chess-rules";
import { useStockfishEngine } from "../lib/useStockfishEngine";
import { useGameAnalysisRunner } from "../lib/useGameAnalysisRunner";
import { positionsFromPlies } from "../lib/gameAnalysis";
import { Button } from "./ui/Button";
import { GameReviewWorkspace } from "./GameReviewWorkspace";

/**
 * The game-history counterpart to PlayRunner's own "Analyze this game"
 * flow — for a `Game` the learner left before analyzing. Reconstructs
 * the per-ply FEN history from the stored PGN (chess-rules' replayPgn,
 * the inverse of buildPgn) since only the live PlayRunner's in-memory
 * move list carries that; a persisted `Game` row only keeps the PGN.
 * Runs the identical analysis pipeline (lib/useGameAnalysisRunner.ts)
 * against its own freshly-loaded Stockfish Worker.
 */
export function AnalyzeStoredGame({
  gameId,
  pgn,
  lessonTitleById,
  playerColor,
}: {
  gameId: string;
  pgn: string;
  lessonTitleById: Record<string, string>;
  playerColor: "w" | "b";
}) {
  const { engineRef, ready: engineReady, error: engineError } = useStockfishEngine(true);
  const { analyzing, progress, review, error, runAnalysis } = useGameAnalysisRunner(engineRef);
  const plies = replayPgn(pgn);

  if (review) {
    return (
      <GameReviewWorkspace
        review={review}
        lessonTitleById={lessonTitleById}
        positions={positionsFromPlies(plies)}
        learnerColor={playerColor}
      />
    );
  }

  return (
    <div className="mw-play-analysis-entry">
      {engineError && (
        <p role="alert" className="mw-feedback mw-feedback--error">
          {engineError}
        </p>
      )}
      {error && (
        <p role="alert" className="mw-feedback mw-feedback--error">
          {error}
        </p>
      )}
      <p>
        {analyzing
          ? `Analyzing move ${progress?.done ?? 0}/${progress?.total ?? plies.length}…`
          : "This game hasn't been analyzed yet — run a real, move-by-move engine review."}
      </p>
      <Button variant="ghost" fullWidth onClick={() => runAnalysis(gameId, plies)} disabled={analyzing || !engineReady}>
        {analyzing ? "Analyzing…" : "Analyze this game"}
      </Button>
    </div>
  );
}
