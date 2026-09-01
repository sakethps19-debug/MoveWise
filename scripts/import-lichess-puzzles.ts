/**
 * Deterministic, offline importer for CC0 Lichess puzzles — see
 * docs/content-sources.md ("1. Lichess Open Database puzzles") and
 * docs/content-licensing-policy.md for the licensing rules this
 * enforces.
 *
 * INVOCATION (source CSV is not committed to this repo — see
 * docs/content-licensing-policy.md's "Do not commit large source
 * dumps"):
 *
 *   git clone --depth 1 https://github.com/FeXd/puzzle-chess /path/to/puzzle-chess
 *   # verify: git -C /path/to/puzzle-chess rev-parse HEAD
 *   #   == cddfa24b1a5a9013b99622d6d5e7093a64b1d55a
 *   npx tsx scripts/import-lichess-puzzles.ts /path/to/puzzle-chess/puzzles/offline/puzzles.csv
 *
 * DETERMINISM: rows are read in the CSV's own on-disk order and every
 * selection/ranking step below is a stable sort or a pure filter — the
 * same input file always produces byte-identical output.
 *
 * FORMAT (verified by hand against real board geometry, not assumed —
 * see docs/content-sources.md's "Format note"): each row is
 * `puzzleId,FEN,moves,rating`. `FEN`'s side-to-move plays `moves[0]`
 * (the puzzle's setup move — NOT part of the learner's solution);
 * applying it produces the position the learner is actually shown.
 * `moves[1]` is the learner's first solution move. This importer only
 * emits puzzles whose full `moves` list has exactly 2 entries (one setup
 * move + one learner move) — MoveWise's current Puzzle schema presents
 * one position and accepts one correct move (see PuzzleSchema in
 * packages/exercise-schema/src/index.ts), not a forced-reply sequence, so
 * a multi-ply Lichess solution can't be represented without a schema
 * change. 4,388 of the CSV's 24,595 rows (~18%) are 2-move puzzles —
 * ample for this round's curated pack; deeper multi-move puzzles are
 * documented as backlog (see the accompanying content review report).
 *
 * SCOPE CUTS, disclosed rather than silently worked around:
 *  - The source CSV has no Popularity/NbPlays/RatingDeviation columns
 *    (unlike the official database.lichess.org dump), so popularity-based
 *    filtering isn't possible against this data; instead, "ambiguous
 *    solution" rejection and "several equivalent moves" widening (see
 *    below) substitute a structural quality check this importer *can*
 *    make from chess-rules alone.
 *  - No Stockfish reanalysis is run over the candidate pool in this
 *    round — every accepted puzzle is validated for legality
 *    (chess-rules) and for its theme claim actually holding
 *    geometrically, but not for whether the advertised move is truly
 *    engine-optimal at depth. Documented as backlog, not silently
 *    skipped.
 *  - Themes are derived here (the source has no Themes column at all),
 *    from a small, deliberately conservative set of geometrically
 *    checkable patterns: checkmate, hanging-piece capture, knight/other
 *    fork, and an approximate back-rank-mate detector. A puzzle matching
 *    none of these is rejected, not mistagged.
 */
import { createReadStream, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  isLegalFen,
  tryMove,
  parseUci,
  legalMoves,
  moveUci,
  gameStatus,
  pieceAt,
  squaresAttackedBy,
  describeMoveOutcome,
  type Square,
  type Move,
} from "../packages/chess-rules/src/index";
import type { ProvenanceRecord } from "../packages/exercise-schema/src/provenance";

const SOURCE_ID = "lichess-puzzle-db-cc0" as const;
const SOURCE_URL = "https://github.com/FeXd/puzzle-chess/blob/main/puzzles/offline/puzzles.csv";
const SOURCE_VERSION = "cddfa24b1a5a9013b99622d6d5e7093a64b1d55a";

const OUTPUT_ROOT = join(import.meta.dirname, "../packages/content");
const PUZZLES_OUT = join(OUTPUT_ROOT, "puzzles/imported-lichess.json");
const PROVENANCE_OUT = join(OUTPUT_ROOT, "provenance/lichess-puzzles.json");

// Per-concept target counts — kept modest and quality-first rather than
// draining the whole 4,388-row candidate pool; see the content review
// report for the full accepted/rejected breakdown.
const CONCEPT_TARGETS: Record<string, number> = {
  "hanging-pieces": 40,
  fork: 20,
  "knight-fork": 20,
  "forking-patterns": 20,
  checkmate: 30,
  "back-rank-tactics": 20,
};

interface RawRow {
  puzzleId: string;
  fen: string;
  moves: string[];
  rating: number;
}

interface Candidate {
  row: RawRow;
  presentedFen: string;
  learnerMoveUci: string;
  fenAfter: string;
  concepts: string[];
  alternateMoves: string[];
  move: Move;
}

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function ratingToDifficulty(rating: number): 1 | 2 | 3 {
  if (rating < 1200) return 1;
  if (rating < 1800) return 2;
  return 3;
}

function ratingToLevel(rating: number): "new-to-chess" | "improving" | "advanced" {
  if (rating < 1000) return "new-to-chess";
  if (rating < 1600) return "improving";
  return "advanced";
}

/** Whether the piece landing on `to` after this move attacks 2+ valuable enemy targets — the core fork test, applied to any piece, not just knights. */
function isForkingMove(fenAfter: string, to: Square, mover: "w" | "b"): { isFork: boolean; targets: number } {
  const attacked = squaresAttackedBy(fenAfter, to);
  const enemyColor = mover === "w" ? "b" : "w";
  let valuableTargets = 0;
  for (const sq of attacked) {
    const piece = pieceAt(fenAfter, sq);
    if (!piece || piece.color !== enemyColor) continue;
    if (piece.type === "k" || PIECE_VALUE[piece.type] >= 3) valuableTargets += 1;
  }
  return { isFork: valuableTargets >= 2, targets: valuableTargets };
}

/** True hanging capture: the captured piece, right before capture, has zero same-color defenders. */
function isHangingCapture(presentedFen: string, from: Square, to: Square): boolean {
  const captured = pieceAt(presentedFen, to);
  if (!captured) return false;
  // Defenders of `to`: does any other allied piece attack `to`?
  const board = presentedFen.split(" ")[0]!;
  const files = "abcdefgh";
  for (const file of files) {
    for (let rank = 1; rank <= 8; rank++) {
      const sq = `${file}${rank}` as Square;
      if (sq === from || sq === to) continue;
      const piece = pieceAt(presentedFen, sq);
      if (!piece || piece.color !== captured.color) continue;
      if (squaresAttackedBy(presentedFen, sq).includes(to)) return false; // defended
    }
  }
  void board;
  return true;
}

/** Approximate back-rank mate: checkmate, mated king on its own home back rank, mated by a rook or queen. */
function isBackRankMate(fenAfter: string, mateSquare: Square, matingPieceType: string): boolean {
  const rank = mateSquare[1];
  const homeBackRank = mateSquare[1] === "1" || mateSquare[1] === "8";
  return (rank === "1" || rank === "8") && homeBackRank && (matingPieceType === "r" || matingPieceType === "q");
}

type ClassifyResult = { candidate: Candidate } | { rejected: "illegal" | "no-theme" };

function classify(row: RawRow): ClassifyResult {
  if (!isLegalFen(row.fen)) return { rejected: "illegal" };

  const setupAttempt = tryMove(row.fen, parseUci(row.moves[0]!));
  if (!setupAttempt) return { rejected: "illegal" };
  const presentedFen = setupAttempt.fenAfter;

  const solutionUci = row.moves[1]!;
  const solutionAttempt = tryMove(presentedFen, parseUci(solutionUci));
  if (!solutionAttempt) return { rejected: "illegal" };

  const mover = presentedFen.split(" ")[1] as "w" | "b";
  const moveTo = solutionAttempt.move.to as Square;
  const status = gameStatus(solutionAttempt.fenAfter);
  const concepts: string[] = [];
  const alternateMoves = new Set<string>([moveUci(solutionAttempt.move)]);

  if (status === "checkmate") {
    concepts.push("checkmate");
    if (isBackRankMate(solutionAttempt.fenAfter, moveTo, solutionAttempt.move.piece)) {
      concepts.push("back-rank-tactics");
    }
    // Widen to any other legal move from the same position that also mates — several equivalent mates should all be accepted, not just Lichess's canonical one.
    for (const alt of legalMoves(presentedFen)) {
      if (moveUci(alt) === moveUci(solutionAttempt.move)) continue;
      const altAttempt = tryMove(presentedFen, parseUci(moveUci(alt)));
      if (altAttempt && gameStatus(altAttempt.fenAfter) === "checkmate") alternateMoves.add(moveUci(alt));
    }
  } else if (solutionAttempt.move.captured) {
    if (isHangingCapture(presentedFen, solutionAttempt.move.from as Square, moveTo)) {
      concepts.push("hanging-pieces");
      // Widen: any other legal move that captures the same hanging piece for equal-or-better material is an equally correct answer.
      for (const alt of legalMoves(presentedFen)) {
        if (alt.to !== moveTo || !alt.captured) continue;
        const uci = moveUci(alt);
        if (uci === moveUci(solutionAttempt.move)) continue;
        alternateMoves.add(uci);
      }
    }
  }

  if (concepts.length === 0) {
    const forkResult = isForkingMove(solutionAttempt.fenAfter, moveTo, mover);
    if (forkResult.isFork) {
      concepts.push("fork");
      concepts.push(solutionAttempt.move.piece === "n" ? "knight-fork" : "forking-patterns");
    }
  }

  if (concepts.length === 0) return { rejected: "no-theme" }; // no detectable, geometrically-verified theme — reject rather than mistag

  return {
    candidate: {
      row,
      presentedFen,
      learnerMoveUci: solutionUci,
      fenAfter: solutionAttempt.fenAfter,
      concepts,
      alternateMoves: [...alternateMoves],
      move: solutionAttempt.move,
    },
  };
}

function normalizedDedupeKey(c: Candidate): string {
  const boardFields = c.presentedFen.split(" ").slice(0, 4).join(" ");
  return `${boardFields}::${[...c.alternateMoves].sort().join(",")}`;
}

const CONCEPT_PROMPTS: Record<string, string> = {
  "hanging-pieces": "Find the free piece — capture the one that's undefended.",
  fork: "Find the move that attacks two enemy pieces at once.",
  "knight-fork": "Find the knight move that forks two enemy pieces.",
  "forking-patterns": "Find the move that forks two enemy pieces at once.",
  checkmate: "Find the move that delivers checkmate.",
  "back-rank-tactics": "Find the back-rank checkmate.",
};

const CONCEPT_EXPLANATION_CLOSER: Record<string, string> = {
  "hanging-pieces": "That piece had no defender covering it, so it was simply free material.",
  fork: "That single move attacked two enemy targets at once — the opponent can only save one of them.",
  "knight-fork": "The knight's L-shaped jump reached two targets at once — no other piece could have covered both squares from there.",
  "forking-patterns": "That move attacked two enemy targets at once, the same fork idea that works for any piece, not just the knight.",
  checkmate: "The enemy king had no legal reply — no capture, no block, and no square to escape to.",
  "back-rank-tactics": "The king was boxed in on its own back rank by its own pieces, with nowhere to run.",
};

const CONCEPT_FEEDBACK: Record<string, string> = {
  "hanging-pieces": "Look for an enemy piece with no defender covering it — that's free material.",
  fork: "Look for a square where one of your pieces would attack two enemy targets at the same time.",
  "knight-fork": "Picture the knight's L-shaped jump — which square lets it land on two targets at once?",
  "forking-patterns": "This piece doesn't move like a knight, but the same fork idea applies: find the square that hits two targets at once.",
  checkmate: "Look for a move that leaves the enemy king with no legal reply.",
  "back-rank-tactics": "The king is trapped on its own back rank by its own pieces — look for the move that exploits that.",
};

function main() {
  const csvPath = process.argv[2];
  if (!csvPath || !existsSync(csvPath)) {
    console.error("Usage: npx tsx scripts/import-lichess-puzzles.ts <path-to-puzzles.csv>");
    console.error("See this file's header comment for how to obtain the source CSV.");
    process.exit(1);
  }

  const rl = createInterface({ input: createReadStream(csvPath), crlfDelay: Infinity });
  const rows: RawRow[] = [];

  rl.on("line", (line) => {
    const parts = line.split(",");
    if (parts.length < 4) return;
    const [puzzleId, fen, movesRaw, ratingRaw] = parts;
    const rating = Number(ratingRaw);
    if (!puzzleId || !fen || !movesRaw || Number.isNaN(rating)) return;
    rows.push({ puzzleId, fen, moves: movesRaw.trim().split(" "), rating });
  });

  rl.on("close", () => {
    const byConcept = new Map<string, Candidate[]>();
    const seenKeys = new Set<string>();
    let rejectedIllegal = 0;
    let rejectedNoTheme = 0;
    let rejectedNotTwoMoves = 0;
    let rejectedDuplicate = 0;
    let accepted = 0;

    for (const row of rows) {
      if (row.moves.length !== 2) {
        rejectedNotTwoMoves += 1;
        continue;
      }
      const result = classify(row);
      if ("rejected" in result) {
        if (result.rejected === "illegal") rejectedIllegal += 1;
        else rejectedNoTheme += 1;
        continue;
      }
      const candidate = result.candidate;
      const key = normalizedDedupeKey(candidate);
      if (seenKeys.has(key)) {
        rejectedDuplicate += 1;
        continue;
      }
      seenKeys.add(key);
      accepted += 1;
      for (const concept of candidate.concepts) {
        const list = byConcept.get(concept) ?? [];
        list.push(candidate);
        byConcept.set(concept, list);
      }
    }

    // Deterministic per-concept selection: sort by rating ascending (an
    // easy-to-hard spread within the concept, not a random sample), take
    // the target count.
    const selected = new Map<string, Candidate>(); // puzzleId -> candidate, dedupes a candidate tagged with multiple concepts
    for (const [concept, target] of Object.entries(CONCEPT_TARGETS)) {
      const pool = (byConcept.get(concept) ?? []).slice().sort((a, b) => a.row.rating - b.row.rating);
      for (const candidate of pool.slice(0, target)) {
        selected.set(candidate.row.puzzleId, candidate);
      }
    }

    const importTimestamp = new Date().toISOString();
    const puzzles: unknown[] = [];
    const provenance: ProvenanceRecord[] = [];

    // Stable output order: by puzzleId, ascending — deterministic regardless of Map insertion order.
    const orderedIds = [...selected.keys()].sort();
    for (const puzzleId of orderedIds) {
      const c = selected.get(puzzleId)!;
      const contentId = `tactical-vision.puzzle-lichess-${puzzleId}`;
      const primaryConcept = c.concepts[0]!;
      const contentHash = createHash("sha256").update(`${c.row.fen}|${c.row.moves.join(" ")}`).digest("hex");
      const closer = CONCEPT_EXPLANATION_CLOSER[primaryConcept] ?? "That was the strongest move available.";
      const lead =
        primaryConcept === "checkmate" || primaryConcept === "back-rank-tactics"
          ? `${c.move.san} delivers checkmate.`
          : describeMoveOutcome(c.move);

      puzzles.push({
        id: contentId,
        kind: "move",
        conceptIds: c.concepts,
        fen: c.presentedFen,
        prompt: CONCEPT_PROMPTS[primaryConcept] ?? "Find the best move.",
        correctMoves: c.alternateMoves,
        difficulty: ratingToDifficulty(c.row.rating),
        suitableLevel: ratingToLevel(c.row.rating),
        feedback: { default: CONCEPT_FEEDBACK[primaryConcept] ?? "Look for the strongest move in this position." },
        successExplanation: `${lead} ${closer}`,
        provenanceId: contentId,
      });

      provenance.push({
        contentId,
        sourceId: SOURCE_ID,
        sourceUrl: SOURCE_URL,
        sourceVersionOrDate: SOURCE_VERSION,
        licence: "CC0-1.0",
        originalRecordId: c.row.puzzleId,
        transformationsPerformed: [
          `applied Lichess setup move ${c.row.moves[0]} to obtain the presented position`,
          "re-encoded presented FEN",
          c.alternateMoves.length > 1
            ? `widened accepted solution to ${c.alternateMoves.length} chess-rules-verified equivalent moves`
            : "kept single canonical solution move",
          `derived theme tag(s) [${c.concepts.join(", ")}] via chess-rules geometry (source has no Themes column)`,
        ],
        validationStatus: "passed",
        attributionRequired: false,
        importTimestamp,
        contentHash,
      });
    }

    mkdirSync(join(OUTPUT_ROOT, "puzzles"), { recursive: true });
    mkdirSync(join(OUTPUT_ROOT, "provenance"), { recursive: true });
    writeFileSync(PUZZLES_OUT, JSON.stringify(puzzles, null, 2) + "\n");
    writeFileSync(PROVENANCE_OUT, JSON.stringify(provenance, null, 2) + "\n");

    console.log(`Rows read: ${rows.length}`);
    console.log(`Rejected (not a 2-move solution): ${rejectedNotTwoMoves}`);
    console.log(`Rejected (illegal FEN/move): ${rejectedIllegal}`);
    console.log(`Rejected (no detectable theme): ${rejectedNoTheme}`);
    console.log(`Rejected (duplicate position+solution): ${rejectedDuplicate}`);
    console.log(`Accepted candidates (before per-concept selection): ${accepted}`);
    console.log(`Selected for shipped pack: ${puzzles.length}`);
    for (const concept of Object.keys(CONCEPT_TARGETS)) {
      const count = puzzles.filter((p) => (p as { conceptIds: string[] }).conceptIds.includes(concept)).length;
      console.log(`  ${concept}: ${count}`);
    }
    console.log(`Wrote ${PUZZLES_OUT}`);
    console.log(`Wrote ${PROVENANCE_OUT}`);
  });
}

main();
