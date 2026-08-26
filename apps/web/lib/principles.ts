import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { parsePrinciple, type Principle } from "@movewise/exercise-schema";

const PRINCIPLES_ROOT = path.join(process.cwd(), "..", "..", "packages", "content", "principles");
const CONCEPTS_FILE = path.join(process.cwd(), "..", "..", "packages", "content", "concepts.json");

/** conceptId -> human-readable title, for surfaces (the Progress dashboard) that only have a bare conceptId to display. */
export function loadConceptTitles(): Record<string, string> {
  if (!existsSync(CONCEPTS_FILE)) return {};
  const data = JSON.parse(readFileSync(CONCEPTS_FILE, "utf-8"));
  return Object.fromEntries(data.map((c: { id: string; name: string }) => [c.id, c.name]));
}

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

/** Finds a principle by id across every unit — the /practice/[principleId] route only has the id, not which unit it belongs to. */
export function findPrincipleById(principleId: string): Principle | null {
  if (!existsSync(PRINCIPLES_ROOT)) return null;
  for (const file of readdirSync(PRINCIPLES_ROOT)) {
    if (!file.endsWith(".json")) continue;
    const unitId = file.replace(/\.json$/, "");
    const match = loadUnitPrinciples(unitId).find((p) => p.id === principleId);
    if (match) return match;
  }
  return null;
}

/** Finds a principle by the concept it's built around — the join point docs/concept-taxonomy.md describes between a Play & Learn mistake's conceptId and the SubLesson that teaches it. */
export function findPrincipleByConceptId(conceptId: string): Principle | null {
  if (!existsSync(PRINCIPLES_ROOT)) return null;
  for (const file of readdirSync(PRINCIPLES_ROOT)) {
    if (!file.endsWith(".json")) continue;
    const unitId = file.replace(/\.json$/, "");
    const match = loadUnitPrinciples(unitId).find((p) => p.conceptId === conceptId);
    if (match) return match;
  }
  return null;
}

/** The principle immediately before this one in the same unit, by `order` — null if this is the first. */
export function findPreviousPrinciple(principle: Principle): Principle | null {
  const siblings = loadUnitPrinciples(principle.unitId);
  const index = siblings.findIndex((p) => p.id === principle.id);
  return index > 0 ? (siblings[index - 1] ?? null) : null;
}
