"use client";

import { useEffect, useMemo, useState } from "react";
import type { Lesson } from "@movewise/exercise-schema";
import {
  gameStatus,
  isGameOver,
  legalTargetsFrom,
  moveMatches,
  parseUci,
  tryMove,
  type Square,
} from "@movewise/chess-rules";
import { sideToMove } from "@movewise/engine";
import { useStockfishEngine } from "../lib/useStockfishEngine";
import { Board } from "./Board";

interface LessonRunnerProps {
  lesson: Lesson;
  onComplete?: (xpEarned: number) => void;
}

type StepStatus = "active" | "correct" | "incorrect";

/**
 * Arrow hints (hint level 3) are rendered as highlighted from/to
 * squares rather than a drawn arrow line — a real SVG arrow overlay
 * (the prototype had one) is a visual-polish follow-up, not a
 * blocker for the exercise logic itself.
 *
 * guided-sequence and mini-game steps hold their own live board state
 * (sequenceFen/miniGameFen) separate from the step's starting `fen`,
 * since — unlike every other step type — the position mutates across
 * several moves within a single step. Both reset whenever stepIndex
 * changes. mini-game's "win condition" is free text in the schema, not
 * a machine-checkable predicate, so completion is simply "the game
 * reached a terminal state" (checkmate/stalemate/draw) — the student
 * reads the objective text to judge whether they actually achieved it.
 */
export function LessonRunner({ lesson, onComplete }: LessonRunnerProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [selected, setSelected] = useState<Square | null>(null);
  const [status, setStatus] = useState<StepStatus>("active");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [xpEarned, setXpEarned] = useState(0);
  const [orderProgress, setOrderProgress] = useState<number[]>([]);
  const [sequenceFen, setSequenceFen] = useState<string | null>(null);
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [miniGameFen, setMiniGameFen] = useState<string | null>(null);
  const [miniGameThinking, setMiniGameThinking] = useState(false);

  const step = lesson.steps[stepIndex];
  const isLastStep = stepIndex === lesson.steps.length - 1;

  const hasMiniGame = useMemo(() => lesson.steps.some((s) => s.type === "mini-game"), [lesson]);
  const { engineRef, ready: engineReady, error: engineError } = useStockfishEngine(hasMiniGame);

  // guided-sequence/mini-game/order-steps track progress within a step;
  // reset that progress whenever the lesson moves to a different step.
  useEffect(() => {
    setOrderProgress([]);
    setSequenceIndex(0);
    setSequenceFen(step.type === "guided-sequence" ? step.fen : null);
    setMiniGameFen(step.type === "mini-game" ? step.fen : null);
  }, [stepIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeSequenceFen = sequenceFen ?? (step.type === "guided-sequence" ? step.fen : null);
  const activeMiniGameFen = miniGameFen ?? (step.type === "mini-game" ? step.fen : null);
  const miniGamePlayerColor = step.type === "mini-game" ? sideToMove(step.fen) : null;

  // Whenever it's the engine's turn in a mini-game step, ask it for a move and play it.
  useEffect(() => {
    if (step.type !== "mini-game" || !activeMiniGameFen || !miniGamePlayerColor) return;
    const engine = engineRef.current;
    if (!engine || !engineReady || miniGameThinking || engineError) return;
    if (isGameOver(activeMiniGameFen) || sideToMove(activeMiniGameFen) === miniGamePlayerColor) return;

    setMiniGameThinking(true);
    engine
      .bestMove(activeMiniGameFen, { skill: 10, depth: 10 })
      .then((analysis) => {
        if (analysis.bestMove === "(none)") return;
        const result = tryMove(activeMiniGameFen, parseUci(analysis.bestMove));
        if (result) setMiniGameFen(result.fenAfter);
      })
      .finally(() => setMiniGameThinking(false));
  }, [step, activeMiniGameFen, miniGamePlayerColor, engineRef, engineReady, engineError, miniGameThinking]);

  // A mini-game step is "complete" once the game reaches a terminal state.
  useEffect(() => {
    if (step.type !== "mini-game" || !activeMiniGameFen || status !== "active") return;
    if (isGameOver(activeMiniGameFen)) markCorrect(5);
  }, [step, activeMiniGameFen, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const legalTargets = useMemo(() => {
    if (!selected || !("fen" in step) || !step.fen) return [];
    return legalTargetsFrom(step.fen, selected);
  }, [selected, step]);

  const activeHint = "hints" in step ? step.hints.find((h) => h.level === hintLevel) : undefined;
  const highlightSquares =
    activeHint && "highlightSquares" in activeHint ? activeHint.highlightSquares : [];
  const activeArrow =
    activeHint && "arrowFrom" in activeHint
      ? { from: activeHint.arrowFrom as Square, to: activeHint.arrowTo as Square }
      : null;

  function advance() {
    setSelected(null);
    setStatus("active");
    setFeedback(null);
    setHintLevel(0);
    if (isLastStep) {
      onComplete?.(xpEarned + lesson.xpReward);
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  function markCorrect(gainedXp: number) {
    setStatus("correct");
    setFeedback(null);
    setXpEarned((xp) => xp + gainedXp);
  }

  function markIncorrect(key: string) {
    setStatus("incorrect");
    if ("feedback" in step) {
      const map = step.feedback as Record<string, string> | undefined;
      setFeedback(map?.[key] ?? map?.default ?? "Not quite — try again.");
    } else {
      setFeedback("Not quite — try again.");
    }
  }

  function handleSquareClick(square: Square) {
    if (step.type === "select-square" || step.type === "find-check" || step.type === "find-checkmate") {
      if (status !== "active") return;
      const correct = step.correctSquares.includes(square);
      if (correct) markCorrect(5);
      else markIncorrect(square);
      return;
    }

    if (step.type === "move-piece" || step.type === "capture" || step.type === "find-legal-move") {
      if (status !== "active") return;
      if (!selected) {
        setSelected(square);
        return;
      }
      if (selected === square) {
        setSelected(null);
        return;
      }
      const result = tryMove(step.fen, { from: selected, to: square });
      setSelected(null);
      if (!result) {
        markIncorrect("default");
        return;
      }
      const validSet =
        step.type === "find-legal-move" ? step.validMoves : step.expectedMoves;
      if (moveMatches(result.move, validSet)) {
        markCorrect(5);
      } else {
        markIncorrect("default");
      }
      return;
    }

    if (step.type === "guided-sequence") {
      if (status !== "active" || !activeSequenceFen) return;
      if (!selected) {
        setSelected(square);
        return;
      }
      if (selected === square) {
        setSelected(null);
        return;
      }
      const result = tryMove(activeSequenceFen, { from: selected, to: square });
      setSelected(null);
      if (!result || !moveMatches(result.move, [step.playerMoves[sequenceIndex]])) {
        markIncorrect("default");
        return;
      }
      let nextFen = result.fenAfter;
      const reply = step.forcedReplies[sequenceIndex];
      if (reply !== undefined) {
        const replyResult = tryMove(nextFen, parseUci(reply));
        if (replyResult) nextFen = replyResult.fenAfter;
      }
      setSequenceFen(nextFen);
      const nextIndex = sequenceIndex + 1;
      setSequenceIndex(nextIndex);
      if (nextIndex >= step.playerMoves.length) markCorrect(5);
      return;
    }

    if (step.type === "mini-game") {
      if (
        !activeMiniGameFen ||
        !miniGamePlayerColor ||
        status !== "active" ||
        miniGameThinking ||
        isGameOver(activeMiniGameFen) ||
        sideToMove(activeMiniGameFen) !== miniGamePlayerColor
      ) {
        return;
      }
      if (!selected) {
        setSelected(square);
        return;
      }
      if (selected === square) {
        setSelected(null);
        return;
      }
      const result = tryMove(activeMiniGameFen, { from: selected, to: square });
      setSelected(null);
      if (result) setMiniGameFen(result.fenAfter);
    }
  }

  function handleOrderItemClick(index: number) {
    if (step.type !== "order-steps" || status === "correct") return;
    if (status === "incorrect") {
      setStatus("active");
      setFeedback(null);
    }
    const expectedIndex = step.correctOrder[orderProgress.length];
    if (index !== expectedIndex) {
      markIncorrect("default");
      setOrderProgress([]);
      return;
    }
    const next = [...orderProgress, index];
    setOrderProgress(next);
    if (next.length === step.correctOrder.length) markCorrect(5);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 480, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, opacity: 0.7 }}>
        <span>{lesson.title}</span>
        <span>
          Step {stepIndex + 1} / {lesson.steps.length}
        </span>
      </div>

      {step.type === "explain" && (
        <>
          {step.boardFen && (
            <Board fen={step.boardFen} highlightSquares={(step.highlights ?? []) as Square[]} interactive={false} />
          )}
          <p>{step.text}</p>
          <button type="button" onClick={advance}>
            Continue
          </button>
        </>
      )}

      {(step.type === "select-square" ||
        step.type === "move-piece" ||
        step.type === "capture" ||
        step.type === "find-legal-move" ||
        step.type === "find-check" ||
        step.type === "find-checkmate") && (
        <>
          {(step.type === "find-check" || step.type === "find-checkmate") && (
            <p>
              {step.type === "find-checkmate"
                ? "Click the square where you can deliver checkmate."
                : "Click the square where you can put the opponent in check."}
            </p>
          )}
          <Board
            fen={step.fen}
            selected={selected}
            legalTargets={legalTargets}
            highlightSquares={highlightSquares as Square[]}
            arrow={activeArrow}
            onSquareClick={handleSquareClick}
          />
          {status === "incorrect" && feedback && (
            <p role="alert" style={{ color: "#b3261e" }}>
              {feedback}
            </p>
          )}
          {status === "correct" && (
            <>
              <p role="status" style={{ color: "#1e7a34" }}>
                Correct! +5 XP
              </p>
              <button type="button" onClick={advance}>
                {isLastStep ? "Finish lesson" : "Continue"}
              </button>
            </>
          )}
          {status !== "correct" && "hints" in step && (
            <button
              type="button"
              onClick={() => setHintLevel((l) => Math.min(4, l + 1))}
              disabled={hintLevel >= 4}
            >
              {hintLevel >= 4 ? "Solution shown" : `Hint ${hintLevel + 1}`}
            </button>
          )}
          {activeHint && <p style={{ fontStyle: "italic" }}>{activeHint.text}</p>}
        </>
      )}

      {step.type === "mcq" && (
        <>
          <p>{step.prompt}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {step.options.map((option, index) => (
              <button
                key={option}
                type="button"
                disabled={status === "correct"}
                onClick={() => {
                  if (index === step.correctIndex) markCorrect(5);
                  else markIncorrect(String(index));
                }}
              >
                {option}
              </button>
            ))}
          </div>
          {status === "incorrect" && feedback && (
            <p role="alert" style={{ color: "#b3261e" }}>
              {feedback}
            </p>
          )}
          {status === "correct" && (
            <button type="button" onClick={advance}>
              {isLastStep ? "Finish lesson" : "Continue"}
            </button>
          )}
        </>
      )}

      {step.type === "true-false" && (
        <>
          <p>{step.prompt}</p>
          <div style={{ display: "flex", gap: 8 }}>
            {[true, false].map((value) => (
              <button
                key={String(value)}
                type="button"
                disabled={status === "correct"}
                onClick={() => {
                  if (value === step.correct) markCorrect(5);
                  else markIncorrect("default");
                }}
              >
                {value ? "True" : "False"}
              </button>
            ))}
          </div>
          {status === "incorrect" && feedback && (
            <p role="alert" style={{ color: "#b3261e" }}>
              {feedback}
            </p>
          )}
          {status === "correct" && (
            <button type="button" onClick={advance}>
              {isLastStep ? "Finish lesson" : "Continue"}
            </button>
          )}
        </>
      )}

      {step.type === "order-steps" && (
        <>
          <p>Tap them in the correct order.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {step.items.map((item, index) => {
              const placedAt = orderProgress.indexOf(index);
              const isPlaced = placedAt !== -1;
              return (
                <button
                  key={item}
                  type="button"
                  disabled={isPlaced || status === "correct"}
                  onClick={() => handleOrderItemClick(index)}
                >
                  {isPlaced ? `${placedAt + 1}. ` : ""}
                  {item}
                </button>
              );
            })}
          </div>
          {status === "incorrect" && feedback && (
            <p role="alert" style={{ color: "#b3261e" }}>
              {feedback}
            </p>
          )}
          {status === "correct" && (
            <>
              <p role="status" style={{ color: "#1e7a34" }}>
                Correct! +5 XP
              </p>
              <button type="button" onClick={advance}>
                {isLastStep ? "Finish lesson" : "Continue"}
              </button>
            </>
          )}
        </>
      )}

      {step.type === "guided-sequence" && activeSequenceFen && (
        <>
          <p>
            Play the correct move. Move {Math.min(sequenceIndex + 1, step.playerMoves.length)} of{" "}
            {step.playerMoves.length}.
          </p>
          <Board
            fen={activeSequenceFen}
            selected={selected}
            legalTargets={selected ? legalTargetsFrom(activeSequenceFen, selected) : []}
            onSquareClick={handleSquareClick}
            interactive={status === "active"}
          />
          {status === "incorrect" && feedback && (
            <p role="alert" style={{ color: "#b3261e" }}>
              {feedback}
            </p>
          )}
          {status === "correct" && (
            <>
              <p role="status" style={{ color: "#1e7a34" }}>
                Correct! +5 XP
              </p>
              <button type="button" onClick={advance}>
                {isLastStep ? "Finish lesson" : "Continue"}
              </button>
            </>
          )}
        </>
      )}

      {step.type === "mini-game" && (
        <>
          <p>
            <strong>Objective:</strong> {step.objective}
          </p>
          <p style={{ opacity: 0.7 }}>{step.winCondition}</p>
          {engineError && (
            <p role="alert" style={{ color: "#b3261e" }}>
              {engineError}
            </p>
          )}
          {!engineError && activeMiniGameFen && miniGamePlayerColor && (
            <>
              <Board
                fen={activeMiniGameFen}
                selected={selected}
                legalTargets={selected ? legalTargetsFrom(activeMiniGameFen, selected) : []}
                onSquareClick={handleSquareClick}
                interactive={
                  engineReady &&
                  !miniGameThinking &&
                  status === "active" &&
                  sideToMove(activeMiniGameFen) === miniGamePlayerColor
                }
              />
              <p role="status">
                {!engineReady
                  ? "Loading Stockfish…"
                  : status === "correct"
                    ? `Game over: ${gameStatus(activeMiniGameFen)}.`
                    : miniGameThinking
                      ? "Stockfish is thinking…"
                      : "Your move."}
              </p>
            </>
          )}
          {status === "correct" && (
            <button type="button" onClick={advance}>
              {isLastStep ? "Finish lesson" : "Continue"}
            </button>
          )}
        </>
      )}

      {step.type === "review" && (
        <>
          <p>{step.summary}</p>
          <button type="button" onClick={advance}>
            Complete unit
          </button>
        </>
      )}
    </div>
  );
}
