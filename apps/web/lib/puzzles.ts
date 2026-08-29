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

/** Finds a puzzle by id across every unit's pool — mirrors lib/lessons.ts's loadLesson, since a server action recording an attempt only has the puzzle id, not which unit it belongs to. */
export function findPuzzle(puzzleId: string): Puzzle | null {
  if (!existsSync(PUZZLES_ROOT)) return null;
  for (const file of readdirSync(PUZZLES_ROOT)) {
    if (!file.endsWith(".json")) continue;
    const data = JSON.parse(readFileSync(path.join(PUZZLES_ROOT, file), "utf-8"));
    const match = data.find((p: { id?: string }) => p.id === puzzleId);
    if (match) return parsePuzzle(match);
  }
  return null;
}

/** A Principle's own puzzle pool, in the order its `puzzleIds` declares. */
export function loadPuzzlesForPrinciple(principle: Principle): Puzzle[] {
  const pool = loadUnitPuzzles(principle.unitId);
  const byId = new Map(pool.map((p) => [p.id, p]));
  return principle.puzzleIds.map((id) => byId.get(id)).filter((p): p is Puzzle => p !== undefined);
}

/** The placement assessment's own item bank (packages/content/puzzles/placement.json) — not tied to any unit/principle, reused here since it lives in the same directory `loadUnitPuzzles` already reads from. */
export function loadPlacementPuzzles(): Puzzle[] {
  return loadUnitPuzzles("placement");
}
