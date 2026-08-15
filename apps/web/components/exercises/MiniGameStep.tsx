"use client";

import { useEffect, useState } from "react";
import type { MiniGameStep as MiniGameStepData } from "@movewise/exercise-schema";
import { gameStatus, isGameOver, legalTargetsFrom, parseUci, tryMove, type Square } from "@movewise/chess-rules";
import { sideToMove, type EngineHandle } from "@movewise/engine";
import { Board } from "../Board";
import { STEP_XP, type ExerciseHandlers } from "./types";

/**
 * mini-game's "win condition" is free text in the schema, not a
 * machine-checkable predicate, so completion is simply "the game reached
 * a terminal state" — the student reads the objective to judge whether
 * they actually achieved it.
 */
export function MiniGameStep({
  step,
  status,
  onCorrect,
  isLastStep,
  onAdvance,
  engineRef,
  engineReady,
  engineError,
}: {
  step: MiniGameStepData;
  engineRef: React.RefObject<EngineHandle | null>;
  engineReady: boolean;
  engineError: string | null;
} & Pick<ExerciseHandlers, "status" | "onCorrect"> & { isLastStep: boolean; onAdvance: () => void }) {
  const [fen, setFen] = useState(step.fen);
  const [selected, setSelected] = useState<Square | null>(null);
  const [thinking, setThinking] = useState(false);
  const playerColor = sideToMove(step.fen);

  // Whenever it's the engine's turn, ask it for a move and play it.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !engineReady || thinking || engineError) return;
    if (isGameOver(fen) || sideToMove(fen) === playerColor) return;

    setThinking(true);
    engine
      .bestMove(fen, { skill: 10, depth: 10 })
      .then((analysis) => {
        if (analysis.bestMove === "(none)") return;
        const result = tryMove(fen, parseUci(analysis.bestMove));
        if (result) setFen(result.fenAfter);
      })
      .finally(() => setThinking(false));
  }, [fen, playerColor, engineRef, engineReady, engineError, thinking]);

  // Complete once the game reaches a terminal state.
  useEffect(() => {
    if (status !== "active") return;
    if (isGameOver(fen)) onCorrect(STEP_XP);
  }, [fen, status]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleClick(square: Square) {
    if (status !== "active" || thinking || isGameOver(fen) || sideToMove(fen) !== playerColor) return;
    if (!selected) {
      setSelected(square);
      return;
    }
    if (selected === square) {
      setSelected(null);
      return;
    }
    const result = tryMove(fen, { from: selected, to: square });
    setSelected(null);
    if (result) setFen(result.fenAfter);
  }

  return (
    <>
      <p id={`${step.id}-prompt`} className="movewise-exercise-prompt">
        <strong>Objective:</strong> {step.objective}
      </p>
      <p style={{ opacity: 0.7 }}>{step.winCondition}</p>
      {engineError && (
        <p role="alert" style={{ color: "#b3261e" }}>
          {engineError}
        </p>
      )}
      {!engineError && (
        <>
          <Board
            fen={fen}
            selected={selected}
            legalTargets={selected ? legalTargetsFrom(fen, selected) : []}
            onSquareClick={handleClick}
            interactive={engineReady && !thinking && status === "active" && sideToMove(fen) === playerColor}
            describedBy={`${step.id}-prompt`}
          />
          <p role="status">
            {!engineReady
              ? "Loading Stockfish…"
              : status === "correct"
                ? `Game over: ${gameStatus(fen)}.`
                : thinking
                  ? "Stockfish is thinking…"
                  : "Your move."}
          </p>
        </>
      )}
      {status === "correct" && (
        <button type="button" onClick={onAdvance}>
          {isLastStep ? "Finish lesson" : "Continue"}
        </button>
      )}
    </>
  );
}
