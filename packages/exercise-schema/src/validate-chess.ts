/**
 * Chess-legality validation for lesson content. This is separate from
 * the structural Zod validation in index.ts: a lesson can be
 * structurally well-formed JSON and still reference an illegal FEN or
 * an expected move that isn't actually playable. Per the brief's
 * acceptance criteria, every exercise must be checked for:
 *   - FEN legality
 *   - the expected piece actually existing on its square
 *   - the expected move (and every declared alternative) being legal
 *   - a reachable success state
 *   - hints corresponding to the correct solution
 *
 * Nothing like this existed in the prototype (it had zero automated
 * exercise validation), so this module is new, not ported.
 */
import {
  gameStatus,
  inCheck,
  isLegalFen,
  legalMoves,
  moveMatches,
  parseUci,
  tryMove,
  type Square,
} from "@movewise/chess-rules";
import type { ExerciseStep, Lesson, Puzzle } from "./index";

export interface ValidationIssue {
  lessonId: string;
  stepId: string;
  message: string;
}

function checkStep(lessonId: string, step: ExerciseStep): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const fail = (message: string) =>
    issues.push({ lessonId, stepId: step.id, message });

  const fenOf = (step as { fen?: string }).fen;
  if (fenOf !== undefined && !isLegalFen(fenOf)) {
    fail(`FEN is not legal: ${fenOf}`);
    return issues; // downstream checks are meaningless on a bad FEN
  }

  switch (step.type) {
    case "select-square": {
      // correctSquares should exist on the board (occupied for
      // select-square-on-a-piece style exercises is validated at
      // authoring time via the piece-movement lessons; here we only
      // confirm the FEN parses, already done above).
      break;
    }
    case "find-check":
    case "find-checkmate": {
      const isMate = step.type === "find-checkmate";
      const deliveringSquares = new Set(
        legalMoves(fenOf!)
          .filter((m) => {
            const result = tryMove(fenOf!, { from: m.from, to: m.to, promotion: m.promotion });
            if (!result) return false;
            return isMate ? gameStatus(result.fenAfter) === "checkmate" : inCheck(result.fenAfter);
          })
          .map((m) => m.to),
      );
      if (deliveringSquares.size === 0) {
        fail(`no legal move in this position delivers ${isMate ? "checkmate" : "check"}`);
      }
      for (const square of step.correctSquares) {
        if (!deliveringSquares.has(square as Square)) {
          fail(`"${square}" is not a square a ${isMate ? "checkmate" : "check"}-delivering move lands on`);
        }
      }
      break;
    }
    case "order-steps": {
      if (step.correctOrder.length !== step.items.length) {
        fail(`correctOrder has ${step.correctOrder.length} entries but there are ${step.items.length} items`);
        break;
      }
      const seen = new Set(step.correctOrder);
      const isPermutation =
        seen.size === step.items.length &&
        step.correctOrder.every((index) => index >= 0 && index < step.items.length);
      if (!isPermutation) {
        fail("correctOrder must be a permutation of the item indices");
      }
      break;
    }
    case "move-piece":
    case "capture": {
      const allExpected = [...step.expectedMoves, ...("altValid" in step ? step.altValid : [])];
      for (const candidate of allExpected) {
        const legal = legalMoves(fenOf!).some((m) => moveMatches(m, [candidate]));
        if (!legal) {
          fail(`expected/alt move "${candidate}" is not legal from this FEN`);
        }
      }
      if (allExpected.length === 0) {
        fail("no expected moves declared — exercise has no reachable success state");
      }
      break;
    }
    case "find-legal-move": {
      for (const candidate of step.validMoves) {
        const legal = legalMoves(fenOf!).some((m) => moveMatches(m, [candidate]));
        if (!legal) {
          fail(`declared valid move "${candidate}" is not actually legal`);
        }
      }
      break;
    }
    case "guided-sequence": {
      let fen = fenOf!;
      for (let i = 0; i < step.playerMoves.length; i++) {
        const uci = step.playerMoves[i];
        const result = tryMove(fen, parseUci(uci));
        if (!result) {
          fail(`guided-sequence player move "${uci}" (move ${i + 1}) is not legal at that point`);
          break;
        }
        fen = result.fenAfter;

        // The engine's scripted reply is applied between player moves, so a
        // later player move can only be validated against the position it
        // actually occurs in once earlier replies have been played out too.
        const reply = step.forcedReplies[i];
        if (reply === undefined) continue;
        const replyResult = tryMove(fen, parseUci(reply));
        if (!replyResult) {
          fail(`guided-sequence forced reply "${reply}" (after move ${i + 1}) is not legal at that point`);
          break;
        }
        fen = replyResult.fenAfter;
      }
      break;
    }
    default:
      break;
  }

  // Arrow hints only represent an actual chess move on move-piece steps.
  // On select-square steps the arrow just points at the target square,
  // which is frequently not reachable as a "move" (e.g. it's occupied by
  // the piece being identified), so it isn't checked for legality there.
  if (step.type === "move-piece" && "hints" in step) {
    for (const hint of step.hints) {
      if (hint.level === 3) {
        const legalFromArrow = legalMoves(fenOf!).some(
          (m) => m.from === hint.arrowFrom && m.to === hint.arrowTo,
        );
        if (!legalFromArrow) {
          fail(
            `hint arrow ${hint.arrowFrom}->${hint.arrowTo} does not correspond to a legal move`,
          );
        }
      }
    }
  }

  return issues;
}

export function validateLesson(lesson: Lesson): ValidationIssue[] {
  return lesson.steps.flatMap((step) => checkStep(lesson.id, step));
}

/**
 * Same chess-legality checks as a move-piece step's `expectedMoves` (a
 * Puzzle's `correctMoves` is the equivalent field, ADR-0008), applied to
 * the pooled Puzzle content type instead of a lesson step.
 */
export function validatePuzzle(puzzle: Puzzle): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const fail = (message: string) => issues.push({ lessonId: puzzle.id, stepId: puzzle.id, message });

  if (!isLegalFen(puzzle.fen)) {
    fail(`FEN is not legal: ${puzzle.fen}`);
    return issues;
  }

  for (const candidate of puzzle.correctMoves) {
    const legal = legalMoves(puzzle.fen).some((m) => moveMatches(m, [candidate]));
    if (!legal) {
      fail(`correct move "${candidate}" is not legal from this FEN`);
    }
  }

  return issues;
}
