"use client";

import { useState } from "react";
import { legalMoves, moveUci, resolveUciToSan, type Move } from "@movewise/chess-rules";
import type { EngineHandle } from "@movewise/engine";
import { buildMoveAnalysis, type GameReview } from "./gameAnalysis";
import { saveGameAnalysisAction, buildGuestGameReviewAction, type SubmittedMoveAnalysis } from "../app/actions";

export interface AnalyzableMove {
  move: Move;
  fenBefore: string;
  fenAfter: string;
}

/**
 * The real (non-demo) per-ply analysis pass, extracted from
 * components/PlayRunner.tsx so a second caller — the game-history detail
 * page, analyzing a game reconstructed via chess-rules' replayPgn instead
 * of PlayRunner's own live move list — can run the identical pipeline
 * rather than a second, drifting copy. Runs client-side against the same
 * Stockfish Web Worker Play mode already uses (no background-job
 * infrastructure exists in this codebase), with real per-move progress,
 * then persists via saveGameAnalysisAction (which also enforces the
 * fair-play invariant server-side and returns the cached result if this
 * game was already analyzed, rather than re-running the engine).
 */
export function useGameAnalysisRunner(engineRef: React.RefObject<EngineHandle | null>) {
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [review, setReview] = useState<GameReview | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** `gameId` is null for a guest — nothing persisted server-side to attach it to (see buildGuestGameReviewAction). */
  async function runAnalysis(gameId: string | null, plies: AnalyzableMove[]) {
    const engine = engineRef.current;
    if (!engine) return;
    setAnalyzing(true);
    setError(null);
    setProgress({ done: 0, total: plies.length });

    try {
      const analyses: SubmittedMoveAnalysis[] = [];
      for (let i = 0; i < plies.length; i++) {
        const ply = plies[i];
        const legalCountBefore = legalMoves(ply.fenBefore).length;
        const before = await engine.bestMove(ply.fenBefore, { depth: 10 });
        const after = await engine.evaluate(ply.fenAfter, { depth: 10 });
        // P0 "verify every best move is legal in the associated FEN" —
        // resolveUciToSan checks legality before turning the engine's raw
        // UCI string into a displayed SAN (see its own doc comment and
        // packages/chess-rules/src/index.test.ts for the illegal-move case).
        const bestMoveSan = resolveUciToSan(ply.fenBefore, before.bestMove);
        // Compared by UCI, not SAN — see lib/moveClassification.ts's
        // isEngineBestByIdentity for why (a real production bug: two
        // independent engine searches can disagree by a few cp even when
        // the played move IS the engine's own top choice).
        const playedUci = moveUci(ply.move);

        analyses.push(
          buildMoveAnalysis({
            moveNumber: Math.floor(i / 2) + 1,
            color: ply.move.color,
            move: ply.move,
            fenAfter: ply.fenAfter,
            evalBefore: before.score,
            evalAfter: after.score,
            bestMoveSan,
            legalMoveCountBefore: legalCountBefore,
            playedUci,
            bestUci: before.bestMove,
          }),
        );
        setProgress({ done: i + 1, total: plies.length });
      }

      const saved = gameId ? await saveGameAnalysisAction(gameId, analyses) : await buildGuestGameReviewAction(analyses);
      if ("error" in saved) {
        setError(saved.error);
      } else {
        setReview(saved);
      }
    } catch {
      setError("Analysis failed — the engine stopped responding.");
    } finally {
      setAnalyzing(false);
    }
  }

  function reset() {
    setAnalyzing(false);
    setProgress(null);
    setReview(null);
    setError(null);
  }

  return { analyzing, progress, review, error, runAnalysis, reset };
}
