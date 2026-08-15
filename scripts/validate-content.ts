/**
 * Walks packages/content/units/**\/*.json, parses each file against
 * LessonSchema, then runs the chess-legality validator over it. Exits
 * non-zero if anything fails, so CI (`pnpm validate:content`) blocks a
 * merge on an illegal FEN, an unreachable exercise, or a mis-declared
 * expected move — the exact acceptance criteria from the Phase 0 doc.
 *
 * Also validates the ADR-0008 content-hierarchy layer added on top of
 * lessons: packages/content/concepts.json (the Concept registry) and
 * packages/content/principles/*.json (Principle groupings), including
 * cross-referential integrity — a principle's subLessonIds/
 * masteryChallengeLessonId must reference real lessons, its conceptId
 * (and every lesson's masteryTags) must reference a registered concept.
 * This catches a typo'd id the same way a broken FEN gets caught: at
 * validate-content time, not by a learner hitting a 404 mid-lesson.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseLesson, parseConcept, parsePrinciple, type Lesson } from "../packages/exercise-schema/src/index";
import { validateLesson } from "../packages/exercise-schema/src/validate-chess";

const CONTENT_ROOT = join(import.meta.dirname, "../packages/content");
const UNITS_ROOT = join(CONTENT_ROOT, "units");
const CONCEPTS_FILE = join(CONTENT_ROOT, "concepts.json");
const PRINCIPLES_ROOT = join(CONTENT_ROOT, "principles");

function* walkLessonFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkLessonFiles(path);
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      yield path;
    }
  }
}

let failures = 0;
let checked = 0;
const lessonsById = new Map<string, Lesson>();

for (const filePath of walkLessonFiles(UNITS_ROOT)) {
  checked += 1;
  const raw = JSON.parse(readFileSync(filePath, "utf-8"));

  const parsed = parseLesson(raw); // throws on structural schema violation
  lessonsById.set(parsed.id, parsed);
  const issues = validateLesson(parsed);

  if (issues.length > 0) {
    failures += issues.length;
    console.error(`\n✗ ${filePath}`);
    for (const issue of issues) {
      console.error(`  [${issue.stepId}] ${issue.message}`);
    }
  } else {
    console.log(`✓ ${filePath}`);
  }
}

// Concept registry
const conceptIds = new Set<string>();
if (existsSync(CONCEPTS_FILE)) {
  const raw = JSON.parse(readFileSync(CONCEPTS_FILE, "utf-8"));
  for (const entry of raw) {
    const concept = parseConcept(entry); // throws on structural violation
    if (conceptIds.has(concept.id)) {
      failures += 1;
      console.error(`\n✗ ${CONCEPTS_FILE}\n  duplicate concept id "${concept.id}"`);
    }
    conceptIds.add(concept.id);
  }
  console.log(`✓ ${CONCEPTS_FILE} (${conceptIds.size} concepts)`);
}

// Every lesson's masteryTags should be registered concepts — catches a typo
// the same way a broken FEN gets caught, not silently ignored.
for (const lesson of lessonsById.values()) {
  for (const tag of lesson.masteryTags) {
    if (!conceptIds.has(tag)) {
      failures += 1;
      console.error(`\n✗ ${lesson.id}\n  masteryTags entry "${tag}" is not a registered concept (packages/content/concepts.json)`);
    }
  }
  if (lesson.principleId) {
    // resolved against the principle files below
  }
}

// Principle groupings — cross-referential integrity
if (existsSync(PRINCIPLES_ROOT)) {
  for (const file of readdirSync(PRINCIPLES_ROOT)) {
    if (!file.endsWith(".json")) continue;
    const filePath = join(PRINCIPLES_ROOT, file);
    const raw = JSON.parse(readFileSync(filePath, "utf-8"));
    let fileOk = true;
    for (const entry of raw) {
      const principle = parsePrinciple(entry); // throws on structural violation

      if (!conceptIds.has(principle.conceptId)) {
        failures += 1;
        fileOk = false;
        console.error(`\n✗ ${filePath}\n  [${principle.id}] conceptId "${principle.conceptId}" is not a registered concept`);
      }
      for (const subLessonId of principle.subLessonIds) {
        if (!lessonsById.has(subLessonId)) {
          failures += 1;
          fileOk = false;
          console.error(`\n✗ ${filePath}\n  [${principle.id}] subLessonIds references unknown lesson "${subLessonId}"`);
        }
      }
      if (principle.masteryChallengeLessonId) {
        const mc = lessonsById.get(principle.masteryChallengeLessonId);
        if (!mc) {
          failures += 1;
          fileOk = false;
          console.error(
            `\n✗ ${filePath}\n  [${principle.id}] masteryChallengeLessonId references unknown lesson "${principle.masteryChallengeLessonId}"`,
          );
        } else if (mc.kind !== "mastery-challenge") {
          failures += 1;
          fileOk = false;
          console.error(
            `\n✗ ${filePath}\n  [${principle.id}] masteryChallengeLessonId "${principle.masteryChallengeLessonId}" is not kind: "mastery-challenge"`,
          );
        }
      }
    }
    if (fileOk) console.log(`✓ ${filePath} (${raw.length} principles)`);
  }
}

console.log(`\n${checked} lesson file(s) checked, ${failures} issue(s) found.`);
if (failures > 0) process.exit(1);
