"use client";

import { useEffect, useRef, useState } from "react";
import {
  explainIllegalMove,
  gameStatus,
  inCheck,
  isGameOver,
  legalTargetsFrom,
  parseUci,
  pieceAt,
  pieceNameOf,
  tryMove,
  buildPgn,
  START_FEN,
  type Move,
  type PieceSymbol,
  type Square,
} from "@movewise/chess-rules";
import { sideToMove } from "@movewise/engine";
import { useStockfishEngine } from "../lib/useStockfishEngine";
import { useGameAnalysisRunner } from "../lib/useGameAnalysisRunner";
import { saveCompletedGameAction } from "../app/actions";
import { computeGameResult } from "../lib/gameResult";
import { positionsFromPlies } from "../lib/gameAnalysis";
import { recordGuestGameAnalysed, recordGuestGamePlayed } from "../lib/guestProgress";
import { Board } from "./Board";
import { Button } from "./ui/Button";
import { GameReviewWorkspace } from "./GameReviewWorkspace";

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
  /** The full chess-rules Move — carries the piece type and destination square lib/moveClassification.ts needs. */
  move: Move;
  fenBefore: string;
  fenAfter: string;
}

function statusText(fen: string, playerColor: PlayerColor, thinking: boolean, resigned: boolean, sanHistory: string[]): string {
  if (resigned) return "You resigned. Stockfish wins.";
  const status = gameStatus(fen, sanHistory);
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

export function PlayRunner({
  lessonTitleById,
  signedIn,
}: {
  lessonTitleById: Record<string, string>;
  /** Signed-in games are persisted (Game row, history, mastery updates); a guest's real analysis still runs (buildGuestGameReviewAction) but is ephemeral to the session — never written to the database. */
  signedIn: boolean;
}) {
  const [fen, setFen] = useState(START_FEN);
  const [playerColor, setPlayerColor] = useState<PlayerColor>("w");
  const [skill, setSkill] = useState<number>(10);
  const [selected, setSelected] = useState<Square | null>(null);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [engineFailure, setEngineFailure] = useState<string | null>(null);
  const [moves, setMoves] = useState<RecordedMove[]>([]);
  const [resigned, setResigned] = useState(false);

  const [gameId, setGameId] = useState<string | null>(null);
  const [gameSaveError, setGameSaveError] = useState(false);
  const gameSavedRef = useRef(false);
  const guestGameRecordedRef = useRef(false);
  const guestAnalysisRecordedRef = useRef(false);

  // Real, confirmed defect: the board was sized from available WIDTH only
  // (a fixed maxWidth=720 passed to <Board>), so on a shorter viewport —
  // a 12.9" iPad in landscape included, ~936px of actual usable height
  // once Safari's own chrome is subtracted from the 1024px device profile
  // — the board (plus everything above and below it) simply overflowed
  // past the bottom of the screen, forcing a scroll to see the whole
  // board. `boardColumnRef`/`boardWrapRef`/`belowBoardCardRef` measure the
  // *real* rendered layout (not a guessed pixel budget) on every resize:
  // how far down the board starts, how tall the player card below it
  // actually is, and the real gap the column's own CSS renders between
  // them — then caps the board at whatever square size actually fits the
  // remaining vertical space, alongside the existing 720px width cap.
  const boardColumnRef = useRef<HTMLDivElement>(null);
  const boardWrapRef = useRef<HTMLDivElement>(null);
  const belowBoardCardRef = useRef<HTMLDivElement>(null);
  const [boardMaxWidth, setBoardMaxWidth] = useState(720);

  useEffect(() => {
    function recomputeBoardSize() {
      const columnEl = boardColumnRef.current;
      const boardEl = boardWrapRef.current;
      const belowEl = belowBoardCardRef.current;
      if (!columnEl || !boardEl || !belowEl) return;
      const boardTop = boardEl.getBoundingClientRect().top;
      const belowHeight = belowEl.getBoundingClientRect().height;
      const gap = parseFloat(getComputedStyle(columnEl).rowGap || "0");
      const bottomSafetyMargin = 16;
      const availableHeight = window.innerHeight - boardTop - gap - belowHeight - bottomSafetyMargin;
      // No lower floor here beyond 0: an earlier version clamped this to a
      // minimum of 240px, which is exactly what caused a real, confirmed
      // regression of the bug this hook exists to fix — on a narrow phone
      // viewport (390x844) where the real available height computed to
      // ~199px, the 240px floor forced the board past the viewport's
      // bottom edge by ~41px anyway. Fitting the viewport is the actual
      // requirement; a smaller-than-ideal board that still fits is
      // correct, an overflowing one that hits some minimum size is not.
      setBoardMaxWidth(Math.min(720, Math.max(0, Math.floor(availableHeight))));
    }
    recomputeBoardSize();
    window.addEventListener("resize", recomputeBoardSize);
    return () => window.removeEventListener("resize", recomputeBoardSize);
    // moves.length: .mw-captured-row (design-system.css) wraps onto
    // multiple lines as captures accumulate, growing belowBoardCardRef's
    // real height over the course of a game — not just on mount/resize.
    // Re-measuring only on those two would leave boardMaxWidth stale
    // (too large) on a narrow, capture-heavy game, reproducing the exact
    // overflow this effect exists to prevent.
  }, [moves.length]);

  const {
    engineRef,
    ready: engineReady,
    error: engineLoadError,
    stage: engineStage,
    retry: retryEngine,
  } = useStockfishEngine(true);
  const engineError = engineLoadError ?? engineFailure;
  const gameOver = resigned || isGameOver(fen, moves.map((m) => m.san));
  const {
    analyzing,
    progress: analysisProgress,
    review: realReview,
    error: analysisError,
    runAnalysis,
    reset: resetAnalysis,
  } = useGameAnalysisRunner(engineRef);

  function recordMove(move: Move, color: PlayerColor, fenBefore: string, fenAfter: string) {
    setMoves((prev) => [
      ...prev,
      { san: move.san, color, captured: (move.captured as PieceSymbol | undefined) ?? null, move, fenBefore, fenAfter },
    ]);
  }

  // Whenever it's Stockfish's turn, ask the engine for a move and play it.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !engineReady || thinking || engineError) return;
    if (gameOver || sideToMove(fen) === playerColor) return;

    setThinking(true);
    const fenBefore = fen;
    engine
      .bestMove(fenBefore, { skill, depth: 12 })
      .then((analysis) => {
        if (analysis.bestMove === "(none)") return;
        const attempt = parseUci(analysis.bestMove);
        const result = tryMove(fenBefore, attempt);
        if (!result) return;
        setFen(result.fenAfter);
        setLastMove({ from: attempt.from, to: attempt.to });
        recordMove(result.move, playerColor === "w" ? "b" : "w", fenBefore, result.fenAfter);
      })
      .catch(() => setEngineFailure("Stockfish stopped responding."))
      .finally(() => setThinking(false));
  }, [fen, engineRef, engineReady, playerColor, skill, thinking, engineError, gameOver]);

  // ADR-0008 Phase B: persist the completed game once, so it can be
  // analyzed afterward. Guests aren't signed in — nothing to own the row,
  // same "session-local only" reasoning as completeLessonAction. A
  // rejected save (dropped connection, transient DB error) previously
  // left `gameId` null forever with zero indication why — "Analyze this
  // game" just stayed silently, permanently disabled. Now surfaces a
  // real, retryable error instead (mirrors the engine-failure handling
  // just above).
  function trySaveGame() {
    gameSavedRef.current = true;
    setGameSaveError(false);
    const { result, endReason, pgnResult } = computeGameResult(
      fen,
      playerColor,
      resigned,
      moves.map((m) => m.san),
    );
    const pgn = buildPgn(
      moves.map((m) => m.san),
      pgnResult,
    );
    saveCompletedGameAction({ pgn, playerColor, result, endReason })
      .then((saved) => {
        if (saved) setGameId(saved.gameId);
      })
      .catch(() => setGameSaveError(true));
  }

  useEffect(() => {
    if (!gameOver || !signedIn || gameSavedRef.current) return;
    trySaveGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per completed game, guarded by gameSavedRef
  }, [gameOver, signedIn]);

  // The guest counterpart to the save effect above: nothing to persist
  // server-side, but the fact that a game was played (and, once analysis
  // finishes, its real classification counts) is still real activity a
  // guest's own Progress page should be able to show — see
  // lib/guestProgress.ts's own doc comment on why this exists now.
  useEffect(() => {
    if (!gameOver || signedIn || guestGameRecordedRef.current) return;
    guestGameRecordedRef.current = true;
    recordGuestGamePlayed();
  }, [gameOver, signedIn]);

  useEffect(() => {
    if (!realReview || signedIn || guestAnalysisRecordedRef.current) return;
    guestAnalysisRecordedRef.current = true;
    recordGuestGameAnalysed(realReview.summary);
  }, [realReview, signedIn]);

  const legalTargets = selected ? legalTargetsFrom(fen, selected) : [];
  const canInteract = engineReady && !thinking && !gameOver && sideToMove(fen) === playerColor;

  // Real, confirmed gap: an illegal move attempt (e.g. selecting a pawn
  // then an out-of-range destination) previously did nothing at all — no
  // message, no announcement, and the empty destination square gave no
  // indication anything had been attempted. `illegalAttempt` drives a
  // brief, announced explanation plus a visible error highlight on the
  // two squares involved, auto-clearing shortly after (or immediately on
  // the learner's next interaction) so it never lingers as stale state.
  const [illegalAttempt, setIllegalAttempt] = useState<{ from: Square; to: Square; message: string } | null>(null);

  useEffect(() => {
    if (!illegalAttempt) return;
    const timer = setTimeout(() => setIllegalAttempt(null), 3000);
    return () => clearTimeout(timer);
  }, [illegalAttempt]);

  function handleSquareClick(square: Square) {
    if (!canInteract) return;

    if (!selected) {
      const piece = pieceAt(fen, square);
      if (!piece) return; // nothing there to select — no move was attempted, nothing to explain
      if (piece.color !== playerColor) {
        setIllegalAttempt({ from: square, to: square, message: "That's Stockfish's piece — you can't move it." });
        return;
      }
      setIllegalAttempt(null);
      setSelected(square);
      return;
    }
    if (selected === square) {
      setSelected(null);
      return;
    }

    // Clicking another one of your own pieces switches the selection —
    // it isn't an illegal-move attempt on the previously selected piece.
    const clickedPiece = pieceAt(fen, square);
    if (clickedPiece && clickedPiece.color === playerColor) {
      setIllegalAttempt(null);
      setSelected(square);
      return;
    }

    const fenBefore = fen;
    const result = tryMove(fenBefore, { from: selected, to: square });
    if (!result) {
      setIllegalAttempt({ from: selected, to: square, message: explainIllegalMove(fenBefore, selected, square) });
      setSelected(null);
      return;
    }
    setIllegalAttempt(null);
    setSelected(null);
    setFen(result.fenAfter);
    setLastMove({ from: selected, to: square });
    recordMove(result.move, playerColor, fenBefore, result.fenAfter);
  }

  function newGame(color: PlayerColor) {
    setFen(START_FEN);
    setSelected(null);
    setLastMove(null);
    setIllegalAttempt(null);
    setPlayerColor(color);
    setEngineFailure(null);
    setMoves([]);
    setResigned(false);
    setGameId(null);
    resetAnalysis();
    gameSavedRef.current = false;
    guestGameRecordedRef.current = false;
    guestAnalysisRecordedRef.current = false;
  }

  function analyzeThisGame() {
    if (signedIn && !gameId) return; // signed-in game must finish saving before it can be attached
    runAnalysis(
      gameId,
      moves.map((m) => ({ move: m.move, fenBefore: m.fenBefore, fenAfter: m.fenAfter })),
    );
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
          <strong>1. Play a game</strong> against Stockfish — no hints, no lesson, just you and the engine. Once it
          ends, <strong>2. review the game</strong> move by move and <strong>3. get lesson recommendations</strong>{" "}
          from what went wrong.
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
        <div className="mw-feedback mw-feedback--error" style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-2)" }}>
          <p role="alert" style={{ margin: 0 }}>
            {engineError}
          </p>
          <Button
            variant="ghost"
            onClick={() => {
              setEngineFailure(null);
              retryEngine();
            }}
          >
            Try again
          </Button>
        </div>
      ) : (
        <p role="status" className={`mw-feedback ${gameOver ? "mw-feedback--success" : "mw-feedback--neutral"}`}>
          {engineReady
            ? statusText(fen, playerColor, thinking, resigned, moves.map((m) => m.san))
            : (engineStage ?? "Preparing your opponent…")}
        </p>
      )}

      <div className="mw-play-layout">
        <div className="mw-play-board-column" ref={boardColumnRef}>
          <div className={`mw-player-card${engineTurn ? " mw-player-card--active" : ""}`}>
            <span className="mw-player-card-name">Stockfish</span>
            <span className="mw-player-card-detail">{SKILL_LEVELS.find((l) => l.value === skill)?.label}</span>
            <div className="mw-captured-row" role="group" aria-label="Pieces Stockfish has captured">
              {capturedByEngine.map((symbol, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- tiny static vector art, no optimization needed
                <img key={i} src={`/pieces/${playerColor}${symbol}.svg`} alt={pieceNameOf(symbol)} className="mw-captured-piece" />
              ))}
            </div>
          </div>

          <div ref={boardWrapRef}>
            <Board
              fen={fen}
              selected={selected}
              legalTargets={legalTargets}
              errorSquares={illegalAttempt ? [illegalAttempt.from, illegalAttempt.to] : []}
              lastMove={lastMove}
              onSquareClick={handleSquareClick}
              interactive={canInteract}
              maxWidth={boardMaxWidth}
              describedBy={illegalAttempt ? "mw-play-illegal-move" : undefined}
            />
            {illegalAttempt && (
              <p id="mw-play-illegal-move" role="alert" className="mw-feedback mw-feedback--error mw-play-illegal-move">
                {illegalAttempt.message}
              </p>
            )}
          </div>

          <div ref={belowBoardCardRef} className={`mw-player-card${playerTurn ? " mw-player-card--active" : ""}`}>
            <span className="mw-player-card-name">You</span>
            <span className="mw-player-card-detail">{playerColor === "w" ? "White" : "Black"}</span>
            <div className="mw-captured-row" role="group" aria-label="Pieces you've captured">
              {capturedByPlayer.map((symbol, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- tiny static vector art, no optimization needed
                <img key={i} src={`/pieces/${engineColor}${symbol}.svg`} alt={pieceNameOf(symbol)} className="mw-captured-piece" />
              ))}
            </div>
          </div>
        </div>

        <aside className="mw-play-sidebar">
          <h2 className="mw-play-sidebar-title">1. Moves so far</h2>
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

          {!gameOver && (
            <div className="mw-play-analysis-entry">
              <span className="mw-badge mw-badge--neutral">Locked</span>
              <p>Game review and lesson recommendations unlock once this game ends.</p>
            </div>
          )}

          {gameOver && !realReview && (
            <div className="mw-play-analysis-entry">
              {analysisError && (
                <p role="alert" className="mw-feedback mw-feedback--error">
                  {analysisError}
                </p>
              )}
              {signedIn && gameSaveError && (
                <>
                  <p role="alert" className="mw-feedback mw-feedback--error">
                    This game couldn&apos;t be saved — your connection may have dropped. Try again to unlock
                    analysis.
                  </p>
                  <Button variant="ghost" fullWidth onClick={trySaveGame}>
                    Try saving again
                  </Button>
                </>
              )}
              <p>
                {analyzing
                  ? `Analyzing move ${analysisProgress?.done ?? 0}/${analysisProgress?.total ?? moves.length}…`
                  : signedIn
                    ? "See a real, move-by-move engine review of the game you just played, with lesson recommendations for what to work on."
                    : "See a real, move-by-move engine review of the game you just played. As a guest, this review isn't saved — create an account to keep your game history."}
              </p>
              <Button
                variant="ghost"
                fullWidth
                onClick={analyzeThisGame}
                disabled={analyzing || (signedIn && !gameId)}
              >
                {analyzing ? "Analyzing…" : "Analyze this game"}
              </Button>
            </div>
          )}
        </aside>
      </div>

      {realReview && (
        <GameReviewWorkspace
          review={realReview}
          lessonTitleById={lessonTitleById}
          positions={positionsFromPlies(moves.map((m) => ({ fenBefore: m.fenBefore, fenAfter: m.fenAfter })))}
          learnerColor={playerColor}
        />
      )}
    </div>
  );
}
