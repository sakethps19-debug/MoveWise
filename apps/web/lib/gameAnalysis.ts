/**
 * Phase 6 (Play & Learn game review): the typed data model for a
 * completed game's move-by-move analysis, plus a deterministic demo
 * generator. This is architecture, not a working analysis engine — see
 * the "remaining integration work" note at the bottom of this file and
 * docs/roadmap.md's Phase B for what's actually still required.
 *
 * `EngineAnalysis.score` (packages/engine) is already the exact
 * centipawn-from-White's-perspective shape `evalBefore`/`evalAfter`
 * below are modeled on — a real implementation calls
 * `engine.bestMove(fenBeforeMove)` and `engine.bestMove(fenAfterMove)`
 * for each ply and derives `evalLoss`/`classification` from the two
 * scores, relative to the side that moved. Nothing here talks to the
 * engine; it exists so the UI and the eventual analysis pass share one
 * contract from the start.
 */

export type MoveClassification = "brilliant" | "great" | "best" | "good" | "inaccuracy" | "mistake" | "blunder";

export const CLASSIFICATION_LABEL: Record<MoveClassification, string> = {
  brilliant: "Brilliant",
  great: "Great",
  best: "Best",
  good: "Good",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder",
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
  /** Real packages/content lesson ids this mistake maps to, ranked, capped short (docs/concept-taxonomy.md's ranking rules). */
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

function summarize(moves: MoveAnalysis[]): Record<MoveClassification, number> {
  const summary: Record<MoveClassification, number> = {
    brilliant: 0,
    great: 0,
    best: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
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
      recommendedLessonIds: [],
    },
    {
      moveNumber: 6,
      color: "w",
      playedMove: "Qxf7#??",
      bestMove: "d3",
      evalBefore: -30,
      evalAfter: 900,
      evalLoss: 0,
      classification: "brilliant",
      explanation:
        "This particular line ends in a real checkmate pattern (the beginner 'Scholar's Mate') — included here to show what a genuinely great move looks like in review, not just a safe one.",
      theme: "Checkmate pattern",
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
      recommendedLessonIds: ["basic-tactics.01-the-knight-fork"],
    },
  ];

  const recommendedLessonIds = [...new Set(moves.flatMap((m) => m.recommendedLessonIds))].slice(0, 4);

  return { isDemo: true, moves, summary: summarize(moves), recommendedLessonIds };
}

/**
 * Remaining integration work for a real (non-demo) GameReview — not built
 * in this pass:
 *
 * 1. Persist completed Play-mode games (a `Game` row: FEN history, PGN,
 *    player color, result) — Play mode is currently stateless once the
 *    page unmounts. See docs/roadmap.md's Phase B.
 * 2. For every played ply, call `engine.bestMove(fenBeforeMove)` and
 *    `engine.bestMove(fenAfterMove)` (packages/engine, already built) to
 *    get real `EngineAnalysis.score` values for `evalBefore`/`evalAfter`.
 *    Async, cached per docs/roadmap.md (a `GameAnalysis` row), never
 *    blocking the request.
 * 3. Classify each move from the eval swing using fixed thresholds (the
 *    8-value scale already named in ADR-0008/docs/testing-strategy.md
 *    row 4) instead of this file's hand-picked demo values.
 * 4. Map instructive mistakes to real `Concept` ids via
 *    docs/concept-taxonomy.md's mapping table (unit tested directly
 *    against that table per docs/testing-strategy.md row 6), then to
 *    `recommendedLessonIds` — this demo hardcodes that mapping by hand
 *    for its 8 fixed moves instead.
 * 5. Rank recommendations by recency/repetition, capped at 3-4 items
 *    (docs/concept-taxonomy.md's ranking rules), not just first-seen
 *    order like `buildDemoGameReview` does above.
 */
