/**
 * Walks packages/content/units/**\/*.json, parses each file against
 * LessonSchema, then runs the chess-legality validator over it. Exits
 * non-zero if anything fails, so CI (`pnpm validate:content`) blocks a
 * merge on an illegal FEN, an unreachable exercise, or a mis-declared
 * expected move — the exact acceptance criteria from the Phase 0 doc.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseLesson } from "../packages/exercise-schema/src/index";
import { validateLesson } from "../packages/exercise-schema/src/validate-chess";

const CONTENT_ROOT = join(import.meta.dirname, "../packages/content/units");

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

for (const filePath of walkLessonFiles(CONTENT_ROOT)) {
  checked += 1;
  const raw = JSON.parse(readFileSync(filePath, "utf-8"));

  const parsed = parseLesson(raw); // throws on structural schema violation
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

console.log(`\n${checked} lesson file(s) checked, ${failures} issue(s) found.`);
if (failures > 0) process.exit(1);
