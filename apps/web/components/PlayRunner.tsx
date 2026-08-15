"use client";

import { useEffect, useState } from "react";
import {
  gameStatus,
  inCheck,
  isGameOver,
  legalTargetsFrom,
  parseUci,
  pieceNameOf,
  tryMove,
  type Move,
  type PieceSymbol,
  type Square,
} from "@movewise/chess-rules";
import { sideToMove } from "@movewise/engine";
import { useStockfishEngine } from "../lib/useStockfishEngine";
import { Board } from "./Board";
import { Button } from "./ui/Button";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const SKILL_LEVELS = [
  { label: "Beginner", value: 0 },
  { label: "Easy", value: 5 },
  { label: "Medium", value: 10 },
  { label: "Hard", value: 15 },
  { label: "Maximum", value: 20 },
] as const;

type PlayerColor = "w" | "b";

interface RecordedMove {
  san: string;
  color: PlayerColor;
  captured: PieceSymbol | null;
}

function statusText(fen: string, playerColor: PlayerColor, thinking: boolean, resigned: boolean): string {
  if (resigned) return "You resigned. Stockfish wins.";
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
  const [moves, setMoves] = useState<RecordedMove[]>([]);
  const [resigned, setResigned] = useState(false);

  const { engineRef, ready: engineReady, error: engineLoadError } = useStockfishEngine(true);
  const engineError = engineLoadError ?? engineFailure;
  const gameOver = resigned || isGameOver(fen);

  function recordMove(move: Move, color: PlayerColor) {
    setMoves((prev) => [...prev, { san: move.san, color, captured: (move.captured as PieceSymbol | undefined) ?? null }]);
  }

  // Whenever it's Stockfish's turn, ask the engine for a move and play it.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !engineReady || thinking || engineError) return;
    if (gameOver || sideToMove(fen) === playerColor) return;

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
        recordMove(result.move, playerColor === "w" ? "b" : "w");
      })
      .catch(() => setEngineFailure("Stockfish stopped responding."))
      .finally(() => setThinking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recordMove is stable enough for this effect's purposes
  }, [fen, engineRef, engineReady, playerColor, skill, thinking, engineError, gameOver]);

  const legalTargets = selected ? legalTargetsFrom(fen, selected) : [];
  const canInteract = engineReady && !thinking && !gameOver && sideToMove(fen) === playerColor;

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
    recordMove(result.move, playerColor);
  }

  function newGame(color: PlayerColor) {
    setFen(START_FEN);
    setSelected(null);
    setLastMove(null);
    setPlayerColor(color);
    setEngineFailure(null);
    setMoves([]);
    setResigned(false);
  }

  const capturedByPlayer = moves.filter((m) => m.color === playerColor && m.captured).map((m) => m.captured!);
  const capturedByEngine = moves.filter((m) => m.color !== playerColor && m.captured).map((m) => m.captured!);
  const engineColor: PlayerColor = playerColor === "w" ? "b" : "w";
  const engineTurn = !gameOver && sideToMove(fen) !== playerColor;
  const playerTurn = !gameOver && sideToMove(fen) === playerColor;

  const movePairs: { number: number; white?: RecordedMove; black?: RecordedMove }[] = [];
  for (const move of moves) {
    if (move.color === "w") {
      movePairs.push({ number: movePairs.length + 1, white: move });
    } else if (movePairs.length > 0 && !movePairs[movePairs.length - 1].black) {
      movePairs[movePairs.length - 1].black = move;
    } else {
      movePairs.push({ number: movePairs.length + 1, black: move });
    }
  }

  return (
    <div className="mw-play-shell">
      <div className="mw-page-head">
        <h1 className="mw-page-title">Play &amp; Learn</h1>
        <p className="mw-page-subtitle">
          A full game against Stockfish — no hints, no lesson, just you and the engine.
        </p>
      </div>

      <div className="mw-play-controls">
        <div className="mw-play-control-group">
          <span className="mw-play-control-label">Play as</span>
          <div className="mw-segmented" role="group" aria-label="Choose your side">
            {(["w", "b"] as const).map((color) => (
              <button
                key={color}
                type="button"
                className={`mw-segmented-option${playerColor === color ? " mw-segmented-option--active" : ""}`}
                aria-pressed={playerColor === color}
                onClick={() => newGame(color)}
              >
                {color === "w" ? "White" : "Black"}
              </button>
            ))}
          </div>
        </div>
        <div className="mw-play-control-group">
          <span className="mw-play-control-label">Difficulty</span>
          <div className="mw-segmented" role="group" aria-label="Choose Stockfish's difficulty">
            {SKILL_LEVELS.map((level) => (
              <button
                key={level.value}
                type="button"
                className={`mw-segmented-option${skill === level.value ? " mw-segmented-option--active" : ""}`}
                aria-pressed={skill === level.value}
                onClick={() => setSkill(level.value)}
              >
                {level.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mw-play-control-group mw-play-control-group--actions">
          <Button variant="ghost" onClick={() => newGame(playerColor)}>
            New game
          </Button>
          <Button variant="danger" onClick={() => setResigned(true)} disabled={gameOver || !playerTurn}>
            Resign
          </Button>
        </div>
      </div>

      {engineError ? (
        <p role="alert" className="mw-feedback mw-feedback--error">
          {engineError}
        </p>
      ) : (
        <p role="status" className={`mw-feedback ${gameOver ? "mw-feedback--success" : "mw-feedback--neutral"}`}>
          {engineReady ? statusText(fen, playerColor, thinking, resigned) : "Loading Stockfish…"}
        </p>
      )}

      <div className="mw-play-layout">
        <div className="mw-play-board-column">
          <div className={`mw-player-card${engineTurn ? " mw-player-card--active" : ""}`}>
            <span className="mw-player-card-name">Stockfish</span>
            <span className="mw-player-card-detail">{SKILL_LEVELS.find((l) => l.value === skill)?.label}</span>
            <div className="mw-captured-row" role="group" aria-label="Pieces Stockfish has captured">
              {capturedByEngine.map((symbol, i) => (
                <img key={i} src={`/pieces/${playerColor}${symbol}.svg`} alt={pieceNameOf(symbol)} className="mw-captured-piece" />
              ))}
            </div>
          </div>

          <Board
            fen={fen}
            selected={selected}
            legalTargets={legalTargets}
            lastMove={lastMove}
            onSquareClick={handleSquareClick}
            interactive={canInteract}
            maxWidth={720}
          />

          <div className={`mw-player-card${playerTurn ? " mw-player-card--active" : ""}`}>
            <span className="mw-player-card-name">You</span>
            <span className="mw-player-card-detail">{playerColor === "w" ? "White" : "Black"}</span>
            <div className="mw-captured-row" role="group" aria-label="Pieces you've captured">
              {capturedByPlayer.map((symbol, i) => (
                <img key={i} src={`/pieces/${engineColor}${symbol}.svg`} alt={pieceNameOf(symbol)} className="mw-captured-piece" />
              ))}
            </div>
          </div>
        </div>

        <aside className="mw-play-sidebar">
          <h2 className="mw-play-sidebar-title">Moves</h2>
          <ol className="mw-move-history">
            {movePairs.length === 0 && <li className="mw-move-history-empty">No moves yet.</li>}
            {movePairs.map((pair) => (
              <li key={pair.number} className="mw-move-row">
                <span className="mw-move-number">{pair.number}.</span>
                <span className="mw-move-san">{pair.white?.san ?? ""}</span>
                <span className="mw-move-san">{pair.black?.san ?? ""}</span>
              </li>
            ))}
          </ol>

          <div className="mw-play-analysis-entry">
            <span className="mw-badge mw-badge--neutral">Soon</span>
            <p>Post-game analysis — move-by-move breakdown and a personal study plan — isn&apos;t built yet.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
