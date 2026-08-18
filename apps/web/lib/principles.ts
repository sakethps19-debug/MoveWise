import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parsePrinciple, type Principle } from "@movewise/exercise-schema";

const PRINCIPLES_ROOT = path.join(process.cwd(), "..", "..", "packages", "content", "principles");

/** Loads a unit's Principle groupings, ordered. Empty for a unit that hasn't been restructured into principles yet — see ADR-0008; all three curated units (meet-the-pieces, check-and-checkmate, basic-tactics) have these now, step-type-preview deliberately doesn't. */
export function loadUnitPrinciples(unitId: string): Principle[] {
  const file = path.join(PRINCIPLES_ROOT, `${unitId}.json`);
  if (!existsSync(file)) return [];
  const data = JSON.parse(readFileSync(file, "utf-8"));
  return data.map(parsePrinciple).sort((a: Principle, b: Principle) => a.order - b.order);
}

/** Which Principle a given lesson belongs to, if the unit has been restructured (ADR-0008). */
export function findPrincipleForLesson(lessonId: string, unitId: string): Principle | null {
  return loadUnitPrinciples(unitId).find((p) => p.subLessonIds.includes(lessonId)) ?? null;
}

/** The principle immediately before this one in the same unit, by `order` — null if this is the first. */
export function findPreviousPrinciple(principle: Principle): Principle | null {
  const siblings = loadUnitPrinciples(principle.unitId);
  const index = siblings.findIndex((p) => p.id === principle.id);
  return index > 0 ? (siblings[index - 1] ?? null) : null;
}
