"use client";

import { useEffect, useState } from "react";
import {
  gameStatus,
  inCheck,
  isGameOver,
  legalTargetsFrom,
  parseUci,
  tryMove,
  type Square,
} from "@movewise/chess-rules";
import { sideToMove } from "@movewise/engine";
import { useStockfishEngine } from "../lib/useStockfishEngine";
import { Board } from "./Board";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const SKILL_LEVELS = [
  { label: "Beginner", value: 0 },
  { label: "Easy", value: 5 },
  { label: "Medium", value: 10 },
  { label: "Hard", value: 15 },
  { label: "Maximum", value: 20 },
] as const;

type PlayerColor = "w" | "b";

function statusText(fen: string, playerColor: PlayerColor, thinking: boolean): string {
  const status = gameStatus(fen);
  if (status === "checkmate") {
    return sideToMove(fen) === playerColor ? "Checkmate — Stockfish wins." : "Checkmate — you win!";
  }
  if (status === "stalemate") return "Stalemate — it's a draw.";
  if (status === "insufficient-material") return "Draw — insufficient material.";
  if (status === "fifty-move-draw") return "Draw — fifty-move rule.";
  if (status === "threefold-repetition") return "Draw — threefold repetition.";
  if (status === "draw") return "Draw.";
  if (thinking) return "Stockfish is thinking…";
  if (sideToMove(fen) !== playerColor) return "Waiting for Stockfish…";
  return inCheck(fen) ? "Your move — you're in check!" : "Your move.";
}

export function PlayRunner() {
  const [fen, setFen] = useState(START_FEN);
  const [playerColor, setPlayerColor] = useState<PlayerColor>("w");
  const [skill, setSkill] = useState<number>(10);
  const [selected, setSelected] = useState<Square | null>(null);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [engineFailure, setEngineFailure] = useState<string | null>(null);

  const { engineRef, ready: engineReady, error: engineLoadError } = useStockfishEngine(true);
  const engineError = engineLoadError ?? engineFailure;

  // Whenever it's Stockfish's turn, ask the engine for a move and play it.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !engineReady || thinking || engineError) return;
    if (isGameOver(fen) || sideToMove(fen) === playerColor) return;

    setThinking(true);
    engine
      .bestMove(fen, { skill, depth: 12 })
      .then((analysis) => {
        if (analysis.bestMove === "(none)") return;
        const attempt = parseUci(analysis.bestMove);
        const result = tryMove(fen, attempt);
        if (!result) return;
        setFen(result.fenAfter);
        setLastMove({ from: attempt.from, to: attempt.to });
      })
      .catch(() => setEngineFailure("Stockfish stopped responding."))
      .finally(() => setThinking(false));
  }, [fen, engineRef, engineReady, playerColor, skill, thinking, engineError]);

  const legalTargets = selected ? legalTargetsFrom(fen, selected) : [];
  const canInteract = engineReady && !thinking && !isGameOver(fen) && sideToMove(fen) === playerColor;

  function handleSquareClick(square: Square) {
    if (!canInteract) return;

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
    if (!result) return;
    setFen(result.fenAfter);
    setLastMove({ from: selected, to: square });
  }

  function newGame(color: PlayerColor) {
    setFen(START_FEN);
    setSelected(null);
    setLastMove(null);
    setPlayerColor(color);
    setEngineFailure(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 480, margin: "0 auto" }}>
      <div>
        <h1>Play vs. Stockfish</h1>
        <p style={{ opacity: 0.7 }}>Freeform practice — no lesson, no hints, just a game.</p>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 14 }}>
        <label>
          Play as:{" "}
          <select value={playerColor} onChange={(e) => newGame(e.target.value as PlayerColor)}>
            <option value="w">White</option>
            <option value="b">Black</option>
          </select>
        </label>
        <label>
          Difficulty:{" "}
          <select value={skill} onChange={(e) => setSkill(Number(e.target.value))}>
            {SKILL_LEVELS.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => newGame(playerColor)}>
          New game
        </button>
      </div>

      {engineError ? (
        <p role="alert" style={{ color: "#b3261e" }}>
          {engineError}
        </p>
      ) : (
        <p role="status">{engineReady ? statusText(fen, playerColor, thinking) : "Loading Stockfish…"}</p>
      )}

      <Board
        fen={fen}
        selected={selected}
        legalTargets={legalTargets}
        lastMove={lastMove}
        onSquareClick={handleSquareClick}
        interactive={canInteract}
      />
    </div>
  );
}
