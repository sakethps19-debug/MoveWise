/**
 * Phase 6 / ADR-0008 Phase B (Play & Learn game review): the typed data
 * model for a completed game's move-by-move analysis, a deterministic
 * demo generator, and — now — the real, engine-driven builder
 * (`buildMoveAnalysis`) that replaces the hand-picked demo values for an
 * actually-played game. Deliberately fs-free and Worker-free: this file
 * only combines numbers/strings the caller already has (an
 * `EngineAnalysis.score` from `packages/engine`, `lib/moveClassification.ts`,
 * `lib/conceptDetection.ts`) into a `MoveAnalysis`/`GameReview`, so it's
 * safe to import from both a Client Component (the live analysis pass,
 * which runs against the browser's own Stockfish Worker) and a Server
 * Component. Mapping a mistake's `conceptIds` to a real recommended
 * lesson needs filesystem access (`lib/principles.ts`) and so is
 * deliberately kept out of this file — see `lib/studyPlan.ts`, imported
 * only server-side.
 */

import type { Move } from "@movewise/chess-rules";
import { detectConcepts } from "./conceptDetection";
import { classifyMove, computeEvalLoss } from "./moveClassification";

/**
 * ADR-0008's fixed 8-value enum ("Decision — move classification"). This
 * previously drifted from the ADR (a "great" value with no "excellent" or
 * "forced") since it was written before Phase B's real classifier existed
 * to test it against — corrected here now that lib/moveClassification.ts
 * is the real implementation.
 */
export type MoveClassification =
  | "brilliant"
  | "best"
  | "excellent"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "forced";

export const CLASSIFICATION_LABEL: Record<MoveClassification, string> = {
  brilliant: "Brilliant",
  best: "Best",
  excellent: "Excellent",
  good: "Good",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder",
  forced: "Forced",
};

export interface MoveAnalysis {
  moveNumber: number;
  color: "w" | "b";
  /** Standard Algebraic Notation, e.g. "Nf3". */
  playedMove: string;
  bestMove: string;
  /** Centipawns, from White's perspective, before this move was played. */
  evalBefore: number;
  /** Centipawns, from White's perspective, after this move was played. */
  evalAfter: number;
  /** Centipawns lost relative to the engine's best move, from the mover's own perspective. Always >= 0. */
  evalLoss: number;
  classification: MoveClassification;
  /** Plain-language, beginner-safe — no notation-only explanations (Phase 2's language bar applies here too). */
  explanation: string;
  /** A tactical or strategic motif, e.g. "Fork", "Development", "King safety". Optional — not every move has one. */
  theme?: string;
  /** docs/concept-taxonomy.md's real join point — zero or more, populated only when lib/conceptDetection.ts recognizes the mistake. Empty for demo data's hand-authored moves (their recommendedLessonIds are set directly instead). */
  conceptIds: string[];
  /** Real packages/content lesson ids this mistake maps to, ranked, capped short (docs/concept-taxonomy.md's ranking rules). Empty on a freshly-built real MoveAnalysis until lib/studyPlan.ts (server-side, fs-based) fills it in. */
  recommendedLessonIds: string[];
}

export interface GameReview {
  /** True for every review this build can produce — no real engine analysis is wired up yet (see below). */
  isDemo: boolean;
  moves: MoveAnalysis[];
  summary: Record<MoveClassification, number>;
  /** Deduped, ranked, capped — the "small set of prioritised lessons" requirement (Phase 6 / docs/testing-strategy.md row 7). */
  recommendedLessonIds: string[];
}

/** Exported for app/actions.ts to persist as GameAnalysis.summary. */
export function summarize(moves: MoveAnalysis[]): Record<MoveClassification, number> {
  const summary: Record<MoveClassification, number> = {
    brilliant: 0,
    best: 0,
    excellent: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
    forced: 0,
  };
  for (const move of moves) summary[move.classification]++;
  return summary;
}

/**
 * Fixed, hand-authored sample data — deliberately NOT derived from the
 * game the learner just played. Deriving fake evaluations from a real
 * move list would make a demo look like real analysis of *their* game,
 * which is exactly the misrepresentation Phase 6 rules out. This is
 * instead a clearly-labeled preview of what game review will look like,
 * built from a short, real, illustrative sequence (an Italian Game line)
 * so every explanation is still chess-accurate.
 */
export function buildDemoGameReview(): GameReview {
  const moves: MoveAnalysis[] = [
    {
      moveNumber: 1,
      color: "w",
      playedMove: "e4",
      bestMove: "e4",
      evalBefore: 20,
      evalAfter: 25,
      evalLoss: 0,
      classification: "best",
      explanation: "A strong, principled opening move — it claims the center and opens lines for the bishop and queen.",
      theme: "Development",
      conceptIds: [],
      recommendedLessonIds: [],
    },
    {
      moveNumber: 2,
      color: "w",
      playedMove: "Bc4",
      bestMove: "Bc4",
      evalBefore: 15,
      evalAfter: 20,
      evalLoss: 0,
      classification: "best",
      explanation: "Develops a piece toward the center and eyes the f7 square, a common early target.",
      theme: "Development",
      conceptIds: [],
      recommendedLessonIds: [],
    },
    {
      moveNumber: 4,
      color: "w",
      playedMove: "Qh5",
      bestMove: "Nf3",
      evalBefore: 10,
      evalAfter: -40,
      evalLoss: 50,
      classification: "inaccuracy",
      explanation:
        "Bringing the queen out this early lets Black attack it and gain time. Developing a knight first keeps more pieces working together.",
      theme: "Development",
      conceptIds: [],
      recommendedLessonIds: [],
    },
    {
      moveNumber: 6,
      color: "w",
      playedMove: "Qxf7#",
      bestMove: "d3",
      evalBefore: -30,
      evalAfter: 900,
      evalLoss: 0,
      classification: "brilliant",
      explanation:
        "This particular line ends in a real checkmate pattern (the beginner 'Scholar's Mate') — included here to show what a genuinely great move looks like in review, not just a safe one.",
      theme: "Checkmate pattern",
      conceptIds: [],
      recommendedLessonIds: ["check-and-checkmate.02-what-is-checkmate"],
    },
    {
      moveNumber: 8,
      color: "b",
      playedMove: "Nc6",
      bestMove: "Nf6",
      evalBefore: -20,
      evalAfter: -10,
      evalLoss: 10,
      classification: "good",
      explanation: "A reasonable developing move, though bringing the kingside knight out first slightly better defends against threats to f7.",
      theme: "Development",
      conceptIds: [],
      recommendedLessonIds: [],
    },
    {
      moveNumber: 10,
      color: "b",
      playedMove: "Nge7",
      bestMove: "Nf6",
      evalBefore: 30,
      evalAfter: 220,
      evalLoss: 190,
      classification: "mistake",
      explanation:
        "This blocks Black's own bishop and knight from developing naturally, and hands White a much easier game — a small positional slip, not a losing blunder on its own.",
      theme: "Piece coordination",
      conceptIds: [],
      recommendedLessonIds: ["meet-the-pieces.09-meet-the-knight"],
    },
    {
      moveNumber: 12,
      color: "b",
      playedMove: "Ng6??",
      bestMove: "O-O",
      evalBefore: 200,
      evalAfter: 650,
      evalLoss: 450,
      classification: "blunder",
      explanation:
        "This walks the knight into a fork — one white piece now attacks two undefended black pieces at once, and Black can only save one of them.",
      theme: "Fork",
      conceptIds: [],
      recommendedLessonIds: ["basic-tactics.01-the-knight-fork"],
    },
  ];

  const recommendedLessonIds = [...new Set(moves.flatMap((m) => m.recommendedLessonIds))].slice(0, 4);

  return { isDemo: true, moves, summary: summarize(moves), recommendedLessonIds };
}

/**
 * Beginner-safe, plain-language explanation for a classified move — no
 * notation-only text (Phase 2's language bar applies here too, same as
 * every lesson's own feedback copy). `conceptIds` sharpens generic
 * classification-level text into the specific detected problem when one
 * of lib/conceptDetection.ts's 3 detectors fired; otherwise falls back to
 * a classification-level explanation. Every `mistake`/`blunder`/
 * `inaccuracy` branch returns a non-empty string — see
 * docs/testing-strategy.md row 5, unit tested directly against this
 * invariant in gameAnalysis.test.ts.
 */
export function explanationFor(classification: MoveClassification, conceptIds: string[]): string {
  if (classification === "blunder" || classification === "mistake") {
    if (conceptIds.includes("hanging-pieces")) {
      return "This leaves a piece where the opponent can capture it for free — a costly way to lose material.";
    }
    if (conceptIds.includes("knight-fork")) {
      return "This lets the opponent's knight fork two of your pieces at once — only one can be saved.";
    }
    if (conceptIds.includes("king-safety-castling")) {
      return "Your king is still in the centre this late in the game, and this move doesn't address it — an exposed king is a real, ongoing risk.";
    }
    if (conceptIds.includes("queen-development-timing")) {
      return "Bringing the queen out this early, before your minor pieces, lets the opponent attack it and gain time developing their own pieces.";
    }
    if (conceptIds.includes("back-rank-safety")) {
      return "Your back rank is undefended and your king has no escape square — the opponent has an immediate back-rank checkmate available.";
    }
    if (conceptIds.includes("trade-evaluation")) {
      return "Playing out this capture loses material once the opponent recaptures — the exchange isn't worth it.";
    }
  }
  switch (classification) {
    case "forced":
      return "The only legal move available in this position.";
    case "brilliant":
      return "A non-obvious move — giving up material here leads to a much stronger position than a safer alternative would have.";
    case "best":
      return "The strongest move available in this position.";
    case "excellent":
      return "A very strong move, just a touch short of the engine's own top choice.";
    case "good":
      return "A solid, reasonable move.";
    case "inaccuracy":
      return "A small slip — there was a noticeably stronger option here.";
    case "mistake":
      return "This loses meaningful ground — there was a clearly better option here.";
    case "blunder":
      return "A costly mistake — this loses significant material or position.";
  }
}

export interface BuildMoveAnalysisInput {
  moveNumber: number;
  color: "w" | "b";
  /** From chess-rules' tryMove — carries the SAN, piece, and destination square this analysis needs. */
  move: Move;
  fenAfter: string;
  /** White-relative centipawns (packages/engine's own convention), the engine's evaluation of the position before this move. */
  evalBefore: number;
  /** White-relative centipawns, the engine's evaluation of the position after this move was played. */
  evalAfter: number;
  bestMoveSan: string;
  /** Number of legal moves available in the position before this move. */
  legalMoveCountBefore: number;
}

/**
 * The real (non-demo) counterpart to buildDemoGameReview's hand-picked
 * entries — combines lib/moveClassification.ts and lib/conceptDetection.ts
 * into one `MoveAnalysis` row. Deliberately does not resolve
 * `recommendedLessonIds` (needs filesystem access — see this file's own
 * top doc comment and lib/studyPlan.ts); callers get an empty array here
 * and fill it in server-side afterward.
 */
export function buildMoveAnalysis(input: BuildMoveAnalysisInput): MoveAnalysis {
  const classification = classifyMove({
    move: input.move,
    fenAfter: input.fenAfter,
    color: input.color,
    evalBefore: input.evalBefore,
    evalAfter: input.evalAfter,
    legalMoveCountBefore: input.legalMoveCountBefore,
  });
  const conceptIds = detectConcepts({
    move: input.move,
    fenAfter: input.fenAfter,
    color: input.color,
    moveNumber: input.moveNumber,
    classification,
  });
  return {
    moveNumber: input.moveNumber,
    color: input.color,
    playedMove: input.move.san,
    bestMove: input.bestMoveSan,
    evalBefore: input.evalBefore,
    evalAfter: input.evalAfter,
    evalLoss: computeEvalLoss(input.evalBefore, input.evalAfter, input.color),
    classification,
    explanation: explanationFor(classification, conceptIds),
    conceptIds,
    recommendedLessonIds: [],
  };
}

/**
 * ADR-0008's fair-play invariant ("Decision — fair play"), a real,
 * directly-tested check rather than something trusted to code review —
 * see `Game.analysisAllowed`'s own doc comment in schema.prisma for why
 * this field exists now, before any human-vs-human mode is even
 * scaffolded. Trivially true for every game this codebase can produce
 * today (Stockfish is the only source).
 */
export function canAnalyze(game: { analysisAllowed: boolean }): boolean {
  return game.analysisAllowed;
}
