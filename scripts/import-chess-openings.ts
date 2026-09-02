/**
 * Deterministic, offline importer for the CC0 lichess-org/chess-openings
 * dataset — see docs/content-sources.md ("2. lichess-org/chess-openings")
 * and docs/content-licensing-policy.md.
 *
 * INVOCATION (source TSVs are not committed — see
 * docs/content-licensing-policy.md's "Do not commit large source
 * dumps"):
 *
 *   git clone --depth 1 https://github.com/lichess-org/chess-openings /path/to/chess-openings
 *   # verify: git -C /path/to/chess-openings rev-parse HEAD
 *   #   == 4b8622759e7ae6f93f011cc6c83a3823401ab45e
 *   npx tsx scripts/import-chess-openings.ts /path/to/chess-openings
 *
 * Every row's `pgn` field (a SAN move list, e.g. "1. e4 e5 2. Nf3 Nc6
 * 3. Bb5") is parsed into a plain SAN array and replayed from the
 * standard starting position with chess-rules — a row whose moves aren't
 * actually legal in sequence is rejected rather than shipped, the same
 * "verify every historical/converted position with chess-rules"
 * discipline the importer for puzzles applies. Output is deterministic:
 * rows are processed in on-disk file order (a.tsv, b.tsv, c.tsv, d.tsv,
 * e.tsv, each already sorted), one JSON entry per row, no shuffling.
 *
 * MAX_PLY caps output to lines of at most 10 plies (5 full moves each
 * side). Two independent reasons converge on the same cutoff: (1) the
 * founding brief is explicit that opening identification must never
 * become "memorization of long forced lines for beginners" — a
 * 25-move theoretical main line has no pedagogical value for MoveWise's
 * audience; (2) this dataset is imported directly into a client
 * component's bundle (apps/web/lib/openingBook.ts), so trimming ~3,800
 * rows to the ~2,300 shortest, most-recognizable ones keeps that bundle
 * from growing by nearly a megabyte for lines nobody needed anyway.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { tryMove, legalMoves, moveUci, parseUci, START_FEN } from "../packages/chess-rules/src/index";
import type { ProvenanceRecord } from "../packages/exercise-schema/src/provenance";

const SOURCE_ID = "lichess-org-chess-openings" as const;
const SOURCE_URL = "https://github.com/lichess-org/chess-openings";
const SOURCE_VERSION = "4b8622759e7ae6f93f011cc6c83a3823401ab45e";
const TSV_FILES = ["a.tsv", "b.tsv", "c.tsv", "d.tsv", "e.tsv"];
const MAX_PLY = 10;

const OUTPUT_ROOT = join(import.meta.dirname, "../packages/content");
const OPENINGS_OUT = join(OUTPUT_ROOT, "openings/chess-openings.json");
const PROVENANCE_OUT = join(OUTPUT_ROOT, "provenance/chess-openings.json");

interface OpeningEntry {
  eco: string;
  name: string;
  sanMoves: string[];
}

function parsePgnToSan(pgn: string): string[] {
  return pgn
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0 && !/^\d+\.+$/.test(token));
}

/** Resolves a SAN move to its UCI form in the given position, by finding the matching legal move — same technique as chess-rules' own sanToSquares. */
function sanToUci(fen: string, san: string): string | null {
  const normalized = san.replace(/[+#]/g, "");
  const match = legalMoves(fen).find((m) => m.san.replace(/[+#]/g, "") === normalized);
  return match ? moveUci(match) : null;
}

function validateLine(sanMoves: string[]): boolean {
  let fen = START_FEN;
  for (const san of sanMoves) {
    const uci = sanToUci(fen, san);
    if (!uci) return false;
    const result = tryMove(fen, parseUci(uci));
    if (!result) return false;
    fen = result.fenAfter;
  }
  return true;
}

function main() {
  const repoDir = process.argv[2];
  if (!repoDir) {
    console.error("Usage: npx tsx scripts/import-chess-openings.ts <path-to-chess-openings-repo>");
    process.exit(1);
  }

  const entries: OpeningEntry[] = [];
  let rowsRead = 0;
  let rejectedIllegal = 0;
  const seenLines = new Set<string>();
  let rejectedDuplicate = 0;

  for (const file of TSV_FILES) {
    const path = join(repoDir, file);
    if (!existsSync(path)) {
      console.error(`Missing ${path} — is this the chess-openings repo root?`);
      process.exit(1);
    }
    const lines = readFileSync(path, "utf-8").split("\n").slice(1); // drop header row
    for (const line of lines) {
      if (!line.trim()) continue;
      rowsRead += 1;
      const [eco, name, pgn] = line.split("\t");
      if (!eco || !name || !pgn) continue;
      const sanMoves = parsePgnToSan(pgn);
      if (sanMoves.length > MAX_PLY) continue; // see MAX_PLY doc comment above — not counted as a rejection, a deliberate scope cut
      if (!validateLine(sanMoves)) {
        rejectedIllegal += 1;
        continue;
      }
      const key = sanMoves.join(" ");
      if (seenLines.has(key)) {
        rejectedDuplicate += 1;
        continue;
      }
      seenLines.add(key);
      entries.push({ eco, name, sanMoves });
    }
  }

  mkdirSync(join(OUTPUT_ROOT, "openings"), { recursive: true });
  mkdirSync(join(OUTPUT_ROOT, "provenance"), { recursive: true });
  // Minified, not pretty-printed: this file is imported directly into a
  // client component's bundle (apps/web/lib/openingBook.ts) — every byte
  // of indentation whitespace ships to every learner's browser for zero
  // benefit, since nobody hand-edits a 2,000+ row generated dataset.
  writeFileSync(OPENINGS_OUT, JSON.stringify(entries) + "\n");

  const importTimestamp = new Date().toISOString();
  const fullDatasetHash = createHash("sha256").update(entries.map((e) => `${e.eco}|${e.name}|${e.sanMoves.join(" ")}`).join("\n")).digest("hex");
  const provenance: ProvenanceRecord[] = [
    {
      contentId: "openings.lichess-org-chess-openings-dataset",
      sourceId: SOURCE_ID,
      sourceUrl: SOURCE_URL,
      sourceVersionOrDate: SOURCE_VERSION,
      licence: "CC0-1.0",
      originalRecordId: "a.tsv+b.tsv+c.tsv+d.tsv+e.tsv (full dataset)",
      transformationsPerformed: [
        "parsed PGN move-number tokens out of the pgn column",
        "replayed each move sequence with chess-rules to verify legality; illegal rows rejected",
        "deduplicated by exact move sequence",
      ],
      validationStatus: "passed",
      attributionRequired: false,
      importTimestamp,
      contentHash: fullDatasetHash,
    },
  ];
  writeFileSync(PROVENANCE_OUT, JSON.stringify(provenance, null, 2) + "\n");

  console.log(`Rows read: ${rowsRead}`);
  console.log(`Rejected (illegal move sequence): ${rejectedIllegal}`);
  console.log(`Rejected (duplicate move sequence): ${rejectedDuplicate}`);
  console.log(`Entries written: ${entries.length}`);
  console.log(`Wrote ${OPENINGS_OUT}`);
  console.log(`Wrote ${PROVENANCE_OUT}`);
}

main();
