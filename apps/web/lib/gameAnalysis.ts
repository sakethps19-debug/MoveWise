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

import { START_FEN, legalMoves, pieceAt, pieceNameOf, type Move, type PieceSymbol, type Square } from "@movewise/chess-rules";
import { detectConcepts } from "./conceptDetection";
import { describeMateTransition } from "./evalFormat";
import { classifyMove, computeEvalLoss } from "./moveClassification";

/**
 * The interactive review workspace (components/GameReviewWorkspace.tsx)
 * needs the board position at every ply, not just before each move — and
 * must reconstruct it from stored FEN history, never infer it from
 * display SAN (a SAN string alone can't be replayed into a position
 * without already knowing the position it was legal in, which is exactly
 * the circularity this avoids). Every ply's `fenBefore`/`fenAfter` is
 * already produced by chess-rules itself (`tryMove`, `replayPgn`) at the
 * moment the move was made or replayed, so this just threads that chain
 * into one array: `positions[0]` is the position before any move,
 * `positions[k]` is the position after the k-th move (1-indexed) —
 * `positions.length === plies.length + 1`. All three real callers
 * (PlayRunner's live game, AnalyzeStoredGame's freshly-analyzed replay,
 * the game-history detail page's already-analyzed replay) already carry
 * both fields per ply, so none of them ever need to guess a position.
 */
export function positionsFromPlies(plies: { fenBefore: string; fenAfter: string }[]): string[] {
  if (plies.length === 0) return [START_FEN];
  return [plies[0].fenBefore, ...plies.map((p) => p.fenAfter)];
}

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
  /** True for buildDemoGameReview's fixed sample data; false for a real, engine-analyzed game (lib/studyPlan.ts's buildStudyPlan) — the UI must never present the former as the latter. */
  isDemo: boolean;
  moves: MoveAnalysis[];
  summary: Record<MoveClassification, number>;
  /** Deduped, ranked, capped — the "small set of prioritised lessons" requirement (Phase 6 / docs/testing-strategy.md row 7). */
  recommendedLessonIds: string[];
}

/**
 * P1 "honest short-game review": a real, reproduced defect — 1.e4 e5
 * 2.Nc3 Nf6 3.Bc4, resigned after only 2 learner moves, was reported as
 * "Clean game — no blunders or mistakes, 2 best-or-better moves" — a
 * confident overall-quality claim built from a sample size too small to
 * support it. `summarize()`'s per-classification counts are always real
 * (each one is a genuine per-move classification), but an *aggregate*
 * claim like "clean game" implies something about the learner's play in
 * general, which 1-2 moves can never actually demonstrate. Below this
 * threshold, the UI (GameReviewWorkspace) must drop every overall
 * accuracy/performance/weakness claim and say so explicitly — per-move
 * analysis stays fully available regardless (every move still has a
 * real classification, eval, and explanation).
 */
export const MIN_LEARNER_MOVES_FOR_OVERALL_ASSESSMENT = 5;

/** How many of `moves` were actually played by the learner — every move when `learnerColor` isn't known (a stand-alone review with no game-side context, where every move is already treated as equally real per GameReviewWorkspace's own doc comment). */
export function learnerMoveCount(moves: MoveAnalysis[], learnerColor?: "w" | "b"): number {
  return learnerColor ? moves.filter((m) => m.color === learnerColor).length : moves.length;
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
  // The classic "Scholar's Mate" trap — 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7#.
  // Every ply here was verified legal via packages/chess-rules'
  // tryMove/gameStatus before being written (SAN generated by chess.js
  // itself, not hand-typed): e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#, terminating in
  // real, engine-confirmed checkmate. That's the whole reason this
  // specific line was chosen over a hand-invented one — no move exists
  // after Qxf7# because the game is actually over there, not because the
  // list was arbitrarily truncated. A previous version of this data kept
  // listing Black moves (Nc6, Nge7, Ng6) *after* Qxf7# already appeared —
  // a real, confirmed chess-impossible sequence (nothing can move once
  // checkmate ends the game) — and used non-standard move numbering
  // (1, 2, 4, 6, 8, 10, 12, skipping and mixing ply/move counts) on top
  // of it. Every entry below uses real, sequential, standard move numbers
  // (1 through 4, both colors), and evalBefore/evalAfter chain
  // continuously from one move to the next, same as a real evaluation
  // curve would. Mate-score magnitude (99000 / 100000) matches
  // packages/engine's own normalizeScore sentinel convention for "mate in
  // N", not an arbitrary number.
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
      moveNumber: 1,
      color: "b",
      playedMove: "e5",
      bestMove: "e5",
      evalBefore: 25,
      evalAfter: 20,
      evalLoss: 0,
      classification: "best",
      explanation: "The symmetrical, most principled reply — Black claims an equal share of the center too.",
      theme: "Development",
      conceptIds: [],
      recommendedLessonIds: [],
    },
    {
      moveNumber: 2,
      color: "w",
      playedMove: "Bc4",
      bestMove: "Bc4",
      evalBefore: 20,
      evalAfter: 25,
      evalLoss: 0,
      classification: "best",
      explanation: "Develops a piece toward the center and eyes the f7 square, a common early target.",
      theme: "Development",
      conceptIds: [],
      recommendedLessonIds: [],
    },
    {
      moveNumber: 2,
      color: "b",
      playedMove: "Nc6",
      bestMove: "Nf6",
      evalBefore: 25,
      evalAfter: 55,
      evalLoss: 30,
      classification: "good",
      explanation:
        "A natural developing move, though ...Nf6 develops toward the center while also attacking White's e4 pawn — a slightly more active choice here.",
      theme: "Development",
      conceptIds: [],
      recommendedLessonIds: [],
    },
    {
      moveNumber: 3,
      color: "w",
      playedMove: "Qh5?!",
      bestMove: "Nf3",
      evalBefore: 55,
      evalAfter: -20,
      evalLoss: 75,
      classification: "inaccuracy",
      explanation:
        "Bringing the queen out this early lets Black attack it and gain time — developing a knight first keeps more pieces working together. It only pays off here because of what Black plays next.",
      theme: "Development",
      conceptIds: [],
      recommendedLessonIds: ["basic-tactics.03-opening-development"],
    },
    {
      moveNumber: 3,
      color: "b",
      playedMove: "Nf6??",
      bestMove: "g6",
      evalBefore: -20,
      evalAfter: 99000,
      evalLoss: 99020,
      classification: "blunder",
      explanation:
        "This develops a piece but ignores the real threat: White's queen and bishop are both aimed at f7, defended only by the king. Playing g6 (attacking the queen) or otherwise addressing f7 was essential — instead, White now has an immediate, unstoppable checkmate.",
      theme: "Missed threat",
      conceptIds: [],
      recommendedLessonIds: ["check-and-checkmate.01-what-is-check"],
    },
    {
      moveNumber: 4,
      color: "w",
      playedMove: "Qxf7#",
      bestMove: "Qxf7#",
      evalBefore: 99000,
      evalAfter: 100000,
      evalLoss: 0,
      classification: "best",
      explanation:
        "Checkmate — the beginner 'Scholar's Mate' pattern. The queen captures the pawn on f7, delivering check with no legal reply: the king can't capture (the bishop on c4 defends f7), can't block, and has no escape square. The game ends here; nothing can be played after checkmate.",
      theme: "Checkmate pattern",
      conceptIds: [],
      recommendedLessonIds: ["check-and-checkmate.02-what-is-checkmate"],
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
    if (conceptIds.includes("opposition-key-squares")) {
      return "This is a pure king-and-pawn ending, where precise technique decides the result — a single inaccurate move here can turn a win into a draw, or a draw into a loss.";
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

const CENTER_SQUARES: ReadonlySet<string> = new Set(["d4", "d5", "e4", "e5"]);

/** Where each side's minor pieces start — leaving one of these squares is the concrete, checkable fact "development" means. */
const MINOR_PIECE_HOME_SQUARES: Record<"w" | "b", ReadonlySet<string>> = {
  w: new Set(["b1", "c1", "f1", "g1"]),
  b: new Set(["b8", "c8", "f8", "g8"]),
};

/** Flips only the side-to-move field — the same technique `isLegalFen` (chess-rules) uses to ask "is the other side in check," applied here to ask "what could the side that just moved do next." Not a claim about the actual next move (the opponent moves next in reality); framed to the learner as an immediate capture opportunity the position now contains, which is what it verifiably is. */
function withFlippedTurn(fen: string): string {
  const parts = fen.split(" ");
  parts[1] = parts[1] === "w" ? "b" : "w";
  return parts.join(" ");
}

/**
 * A capture the just-moved piece could make if it got to move again
 * immediately — a genuine, engine-verified (via chess-rules' own legal
 * move generator, not a heuristic guess) newly-available threat, not an
 * invented tactical claim. Returns null (never throws) if the flipped
 * position is one chess.js rejects for unrelated structural reasons
 * (same caveat `isLegalFen` documents) or there's simply no such capture.
 */
function immediateCaptureThreat(fenAfter: string, from: string): { to: string; captured: PieceSymbol } | null {
  try {
    const found = legalMoves(withFlippedTurn(fenAfter)).find((m) => m.from === from && m.captured !== undefined);
    return found ? { to: found.to, captured: found.captured! } : null;
  } catch {
    return null;
  }
}

/** A real, checkable structural fact: 2+ of the mover's own pawns now share `file` — not a value judgment about whether that's bad here. */
function createsDoubledPawn(fenAfter: string, file: string, color: "w" | "b"): boolean {
  let count = 0;
  for (let rank = 1; rank <= 8; rank++) {
    const piece = pieceAt(fenAfter, `${file}${rank}` as Square);
    if (piece && piece.color === color && piece.type === "p") count++;
  }
  return count >= 2;
}

/**
 * Position-grounded explanations built from detectable, verifiable facts
 * about the actual move played — central control, development, king
 * safety (castling), captures, checks, a newly-created capture threat,
 * and pawn structure (a new doubled pawn) — instead of a generic
 * classification-tier phrase ("The strongest move available," "A solid,
 * reasonable move"). Checked in priority order, first match wins; never
 * fabricates a claim this file can't verify (no invented "this sets up a
 * fork" or "this wins the exchange" language) — a quiet move that
 * doesn't trip any detector below (an ordinary pawn shuffle to a
 * non-central square that develops nothing and threatens nothing) simply
 * falls through to the classification-tier text via `explanationFor`,
 * same honest fallback as before this existed. Only reached for
 * classifications outside mistake/blunder-with-a-matched-concept — those
 * already get a real, specific problem description from
 * `explanationFor`'s own concept branch, which nothing here overrides.
 */
function groundedExplanation(move: Move, fenAfter: string, classification: MoveClassification): string | null {
  const pieceName = pieceNameOf(move.piece);
  const isCheck = move.san.includes("+");
  const threat = immediateCaptureThreat(fenAfter, move.to);

  if (move.captured && isCheck) {
    return `Captures the ${pieceNameOf(move.captured)} on ${move.to} with check — a forcing move that wins material and gives the opponent no time to respond freely.`;
  }
  if (move.captured) {
    return `Captures the ${pieceNameOf(move.captured)} on ${move.to}, picking up material.`;
  }
  if (isCheck) {
    return "Gives check, forcing an immediate response — real tempo, since the opponent has to deal with the king before doing anything else.";
  }
  if (move.san === "O-O" || move.san === "O-O-O") {
    return `Castles ${move.san === "O-O" ? "kingside" : "queenside"}, tucking the king away from the center and connecting the rooks — a concrete king-safety improvement.`;
  }
  if (threat) {
    return `Creates an immediate threat to capture the ${pieceNameOf(threat.captured)} on ${threat.to} next move.`;
  }
  if ((move.piece === "n" || move.piece === "b") && MINOR_PIECE_HOME_SQUARES[move.color].has(move.from)) {
    return `Develops the ${pieceName} off its starting square toward the center — a normal early-game priority.`;
  }
  if (CENTER_SQUARES.has(move.to)) {
    return `Moves into the center (${move.to}), claiming one of the board's most valuable squares.`;
  }
  if (move.piece === "p" && classification !== "forced" && createsDoubledPawn(fenAfter, move.to[0], move.color)) {
    return `This pawn move creates a doubled pawn on the ${move.to[0]}-file — not necessarily bad, but a real structural change worth noticing.`;
  }
  return null;
}

/**
 * The explanation `buildMoveAnalysis` actually stores: a matched mistake/
 * blunder concept (`explanationFor`'s own branch) always wins first —
 * that's the most specific, already-real information available. Every
 * other case tries `groundedExplanation` before falling back to
 * `explanationFor`'s generic classification-tier text, so a learner
 * reading "Best" or "Good" gets a reason grounded in what the move
 * actually did on the board, not just a repeated tier label.
 */
export function explainMove(move: Move, fenAfter: string, classification: MoveClassification, conceptIds: string[]): string {
  const hasMatchedMistakeConcept = (classification === "mistake" || classification === "blunder") && conceptIds.length > 0;
  if (!hasMatchedMistakeConcept) {
    const grounded = groundedExplanation(move, fenAfter, classification);
    if (grounded) return grounded;
  }
  return explanationFor(classification, conceptIds);
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
  /** UCI form of the played move (chess-rules' `moveUci`) — see lib/moveClassification.ts's `isEngineBestByIdentity`. */
  playedUci?: string;
  /** UCI form of the engine's own best-move selection (packages/engine's raw `bestMove` string). */
  bestUci?: string;
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
  // A single rules fact (never guessed from eval numbers), fed identically
  // into classifyMove, computeEvalLoss, and describeMateTransition below —
  // so the badge, the numeric loss, and the explanation text can never
  // disagree about whether this move delivered checkmate.
  const isCheckmateNow = input.move.san.endsWith("#");

  const classification = classifyMove({
    move: input.move,
    fenAfter: input.fenAfter,
    color: input.color,
    evalBefore: input.evalBefore,
    evalAfter: input.evalAfter,
    legalMoveCountBefore: input.legalMoveCountBefore,
    playedUci: input.playedUci,
    bestUci: input.bestUci,
    isCheckmateNow,
  });
  const conceptIds = detectConcepts({
    move: input.move,
    fenAfter: input.fenAfter,
    color: input.color,
    moveNumber: input.moveNumber,
    classification,
  });
  // A move that touches a forced mate deserves the specific "Missed mate
  // in 1" / "Allowed mate in 2" / "Found checkmate" / "Escaped a mating
  // threat" language over the generic classification-level text — see
  // lib/evalFormat.ts.
  const mateExplanation = describeMateTransition(input.evalBefore, input.evalAfter, input.color, isCheckmateNow);
  return {
    moveNumber: input.moveNumber,
    color: input.color,
    playedMove: input.move.san,
    bestMove: input.bestMoveSan,
    evalBefore: input.evalBefore,
    evalAfter: input.evalAfter,
    evalLoss: computeEvalLoss(
      input.evalBefore,
      input.evalAfter,
      input.color,
      input.playedUci,
      input.bestUci,
      isCheckmateNow,
    ),
    classification,
    explanation: mateExplanation ?? explainMove(input.move, input.fenAfter, classification, conceptIds),
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
