"use client";

import { useMemo, useState } from "react";
import type { Lesson } from "@movewise/exercise-schema";
import { legalTargetsFrom, moveMatches, tryMove, type Square } from "@movewise/chess-rules";
import { Board } from "./Board";

interface LessonRunnerProps {
  lesson: Lesson;
  onComplete?: (xpEarned: number) => void;
}

type StepStatus = "active" | "correct" | "incorrect";

/**
 * Note on scope: this covers exactly the step types the 12 authored
 * "Meet the Pieces" lessons use (explain, select-square, move-piece,
 * capture, find-legal-move, mcq, true-false, review). order-steps,
 * find-check/find-checkmate, guided-sequence, and mini-game exist in
 * the schema but aren't rendered here yet — later units that use
 * them will need this switch extended before they can ship.
 *
 * Arrow hints (hint level 3) are rendered as highlighted from/to
 * squares rather than a drawn arrow line — a real SVG arrow overlay
 * (the prototype had one) is a visual-polish follow-up, not a
 * blocker for the exercise logic itself.
 */
export function LessonRunner({ lesson, onComplete }: LessonRunnerProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [selected, setSelected] = useState<Square | null>(null);
  const [status, setStatus] = useState<StepStatus>("active");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [xpEarned, setXpEarned] = useState(0);

  const step = lesson.steps[stepIndex];
  const isLastStep = stepIndex === lesson.steps.length - 1;

  const legalTargets = useMemo(() => {
    if (!selected || !("fen" in step) || !step.fen) return [];
    return legalTargetsFrom(step.fen, selected);
  }, [selected, step]);

  const activeHint = "hints" in step ? step.hints.find((h) => h.level === hintLevel) : undefined;
  const highlightSquares =
    activeHint && "highlightSquares" in activeHint ? activeHint.highlightSquares : [];
  const arrowSquares =
    activeHint && "arrowFrom" in activeHint ? [activeHint.arrowFrom, activeHint.arrowTo] : [];

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
    if (status !== "active") return;

    if (step.type === "select-square") {
      const correct = step.correctSquares.includes(square);
      if (correct) markCorrect(5);
      else markIncorrect(square);
      return;
    }

    if (step.type === "move-piece" || step.type === "capture" || step.type === "find-legal-move") {
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
    }
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
            <Board fen={step.boardFen} highlightSquares={step.highlights ?? []} interactive={false} />
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
        step.type === "find-legal-move") && (
        <>
          <Board
            fen={step.fen}
            selected={selected}
            legalTargets={legalTargets}
            highlightSquares={[...highlightSquares, ...arrowSquares]}
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
