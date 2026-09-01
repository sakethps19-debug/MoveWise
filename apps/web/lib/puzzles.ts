import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { parsePuzzle, type Principle, type Puzzle } from "@movewise/exercise-schema";

const PUZZLES_ROOT = path.join(process.cwd(), "..", "..", "packages", "content", "puzzles");

/** Loads a unit's puzzle pool. Empty for a unit with no authored puzzles yet — see ADR-0008/docs/roadmap.md. */
export function loadUnitPuzzles(unitId: string): Puzzle[] {
  const file = path.join(PUZZLES_ROOT, `${unitId}.json`);
  if (!existsSync(file)) return [];
  const data = JSON.parse(readFileSync(file, "utf-8"));
  return data.map(parsePuzzle);
}

/**
 * Every puzzle across every file in packages/content/puzzles, keyed by id
 * — built once per server process and reused, not re-read from disk on
 * every call. Content files are static for the life of a running server
 * (a real content change needs a redeploy/dev-server restart regardless),
 * so this is safe, and matters now that resolving a cross-file id
 * (`loadPuzzlesForPrinciple` below) needs the *whole* directory, not one
 * small per-unit file: a real perf regression was caught this round —
 * `apps/web/app/practice/warm-up/page.tsx` calls
 * `loadPuzzlesForPrinciple` once per principle across every unit, and
 * without this cache each call re-read and re-JSON.parsed all six puzzle
 * files (now ~180 KB combined, up from a few KB before this round's CC0
 * import) from scratch — compounding into real request latency under the
 * e2e suite's load (several tests waiting on that page, or a page that
 * links to it, started timing out).
 */
let allPuzzlesByIdCache: Map<string, Puzzle> | null = null;
function allPuzzlesById(): Map<string, Puzzle> {
  if (allPuzzlesByIdCache) return allPuzzlesByIdCache;
  const byId = new Map<string, Puzzle>();
  if (existsSync(PUZZLES_ROOT)) {
    for (const file of readdirSync(PUZZLES_ROOT)) {
      if (!file.endsWith(".json")) continue;
      const data = JSON.parse(readFileSync(path.join(PUZZLES_ROOT, file), "utf-8"));
      for (const raw of data) {
        const puzzle = parsePuzzle(raw);
        byId.set(puzzle.id, puzzle);
      }
    }
  }
  allPuzzlesByIdCache = byId;
  return byId;
}

/** Finds a puzzle by id across every unit's pool — mirrors lib/lessons.ts's loadLesson, since a server action recording an attempt only has the puzzle id, not which unit it belongs to. */
export function findPuzzle(puzzleId: string): Puzzle | null {
  return allPuzzlesById().get(puzzleId) ?? null;
}

/**
 * A Principle's own puzzle pool, in the order its `puzzleIds` declares.
 *
 * Real, confirmed bug this fixes: this used to resolve ids only against
 * `principle.unitId`'s own single puzzle file (`loadUnitPuzzles`), so any
 * id belonging to a different file was silently dropped — `.filter((p) =>
 * p !== undefined)` swallowed the miss instead of surfacing it. This
 * broke as soon as content started referencing puzzles across files: the
 * imported CC0 Lichess pack (`packages/content/puzzles/imported-lichess.json`)
 * is a standalone file (its content spans multiple units' concepts, so it
 * isn't itself named after any one unit), and principles in
 * `basic-tactics.json`/`tactical-vision.json`/`check-and-checkmate.json`
 * reference its puzzle ids directly — e.g. `basic-tactics.the-knight-fork`
 * lists 14 `tactical-vision.puzzle-lichess-*` ids alongside its own 2
 * hand-authored ones. Resolving against only `basic-tactics.json` silently
 * served a 2-puzzle pool instead of the real 16-puzzle one (caught by
 * apps/web/e2e/puzzle-practice.spec.ts timing out waiting for "Puzzle
 * 1/16"). Fixed the same way `findPuzzle` already searches for a single
 * id: resolve against every puzzle file, not just one — via the shared
 * cache above.
 */
export function loadPuzzlesForPrinciple(principle: Principle): Puzzle[] {
  const byId = allPuzzlesById();
  return principle.puzzleIds.map((id) => byId.get(id)).filter((p): p is Puzzle => p !== undefined);
}

/** The placement assessment's own item bank (packages/content/puzzles/placement.json) — not tied to any unit/principle, reused here since it lives in the same directory `loadUnitPuzzles` already reads from. */
export function loadPlacementPuzzles(): Puzzle[] {
  return loadUnitPuzzles("placement");
}
