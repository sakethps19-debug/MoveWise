/**
 * Walks packages/content/units/**\/*.json, parses each file against
 * LessonSchema, then runs the chess-legality validator over it. Exits
 * non-zero if anything fails, so CI (`pnpm validate:content`) blocks a
 * merge on an illegal FEN, an unreachable exercise, or a mis-declared
 * expected move — the exact acceptance criteria from the Phase 0 doc.
 *
 * Also validates the ADR-0008 content-hierarchy layer added on top of
 * lessons: packages/content/concepts.json (the Concept registry),
 * packages/content/principles/*.json (Principle groupings), and
 * packages/content/puzzles/*.json (pooled Puzzle content, same
 * chess-legality checks as a lesson's move-piece steps), including
 * cross-referential integrity — a principle's subLessonIds/puzzleIds/
 * masteryChallengeLessonId must reference real lessons/puzzles, its
 * conceptId (and every lesson's masteryTags, every puzzle's conceptIds)
 * must reference a registered concept. This catches a typo'd id the same
 * way a broken FEN gets caught: at validate-content time, not by a
 * learner hitting a 404 mid-lesson.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseLesson, parseConcept, parsePrinciple, parsePuzzle, type Lesson, type Puzzle } from "../packages/exercise-schema/src/index";
import { validateLesson, validatePuzzle } from "../packages/exercise-schema/src/validate-chess";
import { validateInstructionalQuality, validatePuzzleInstructionalQuality } from "../packages/exercise-schema/src/validate-instructional";

const CONTENT_ROOT = join(import.meta.dirname, "../packages/content");
const UNITS_ROOT = join(CONTENT_ROOT, "units");
const CONCEPTS_FILE = join(CONTENT_ROOT, "concepts.json");
const PRINCIPLES_ROOT = join(CONTENT_ROOT, "principles");
const PUZZLES_ROOT = join(CONTENT_ROOT, "puzzles");

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
const lessonFilePathById = new Map<string, string>();

for (const filePath of walkLessonFiles(UNITS_ROOT)) {
  checked += 1;
  const raw = JSON.parse(readFileSync(filePath, "utf-8"));

  const parsed = parseLesson(raw); // throws on structural schema violation
  if (lessonsById.has(parsed.id)) {
    failures += 1;
    console.error(
      `\n✗ ${filePath}\n  duplicate lesson id "${parsed.id}" (already defined in ${lessonFilePathById.get(parsed.id)})`,
    );
  }
  lessonsById.set(parsed.id, parsed);
  lessonFilePathById.set(parsed.id, filePath);
  const issues = [...validateLesson(parsed), ...validateInstructionalQuality(parsed)];

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

// Puzzle pools (ADR-0008) — same structural + chess-legality validation as
// lessons, one file per unit.
let puzzlesChecked = 0;
const puzzlesById = new Map<string, Puzzle>();
if (existsSync(PUZZLES_ROOT)) {
  for (const file of readdirSync(PUZZLES_ROOT)) {
    if (!file.endsWith(".json")) continue;
    const filePath = join(PUZZLES_ROOT, file);
    const raw = JSON.parse(readFileSync(filePath, "utf-8"));
    let fileOk = true;
    for (const entry of raw) {
      puzzlesChecked += 1;
      const puzzle = parsePuzzle(entry); // throws on structural schema violation
      if (puzzlesById.has(puzzle.id)) {
        failures += 1;
        fileOk = false;
        console.error(`\n✗ ${filePath}\n  duplicate puzzle id "${puzzle.id}"`);
      }
      puzzlesById.set(puzzle.id, puzzle);
      const issues = [...validatePuzzle(puzzle), ...validatePuzzleInstructionalQuality(puzzle)];
      if (issues.length > 0) {
        failures += issues.length;
        fileOk = false;
        console.error(`\n✗ ${filePath}`);
        for (const issue of issues) console.error(`  [${issue.stepId}] ${issue.message}`);
      }
    }
    if (fileOk) console.log(`✓ ${filePath} (${raw.length} puzzles)`);
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

// Every puzzle's conceptIds should be registered concepts too — same
// reasoning as lesson masteryTags above.
for (const puzzle of puzzlesById.values()) {
  for (const conceptId of puzzle.conceptIds) {
    if (!conceptIds.has(conceptId)) {
      failures += 1;
      console.error(`\n✗ ${puzzle.id}\n  conceptIds entry "${conceptId}" is not a registered concept (packages/content/concepts.json)`);
    }
  }
}

// Principle groupings — cross-referential integrity
const principlesByUnit = new Map<string, { id: string; order: number; subLessonIds: string[] }[]>();
if (existsSync(PRINCIPLES_ROOT)) {
  for (const file of readdirSync(PRINCIPLES_ROOT)) {
    if (!file.endsWith(".json")) continue;
    const filePath = join(PRINCIPLES_ROOT, file);
    const raw = JSON.parse(readFileSync(filePath, "utf-8"));
    let fileOk = true;
    for (const entry of raw) {
      const principle = parsePrinciple(entry); // throws on structural violation
      const unitList = principlesByUnit.get(principle.unitId) ?? [];
      unitList.push({ id: principle.id, order: principle.order, subLessonIds: principle.subLessonIds });
      principlesByUnit.set(principle.unitId, unitList);

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
      for (const puzzleId of principle.puzzleIds) {
        if (!puzzlesById.has(puzzleId)) {
          failures += 1;
          fileOk = false;
          console.error(`\n✗ ${filePath}\n  [${principle.id}] puzzleIds references unknown puzzle "${puzzleId}"`);
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

// Curriculum graph — the authoritative source every one of Learning-path
// display, route-level gating (app/learn/[lessonId]/page.tsx), unit
// progress, practice unlocking, and lesson recommendations reads
// `lesson.prerequisites` from. Never validated before this: a
// contradiction like "King safety and castling" (a real, confirmed
// production defect — displayed before "Unit mastery challenge" while its
// own prerequisite chain said it unlocked *after* it) could ship
// undetected, since nothing checked that the prerequisite graph and the
// displayed learning-path order actually agreed.
{
  // 1. Every prerequisite must reference a real, known lesson.
  for (const lesson of lessonsById.values()) {
    for (const prereqId of lesson.prerequisites) {
      if (!lessonsById.has(prereqId)) {
        failures += 1;
        console.error(
          `\n✗ ${lessonFilePathById.get(lesson.id)}\n  [${lesson.id}] prerequisites references unknown lesson "${prereqId}"`,
        );
      }
    }
  }

  // 2. A lesson can never list itself as its own prerequisite — the
  // simplest possible cycle, and the specific "mastery challenge depends
  // on itself" case call out on its own since it's the easiest authoring
  // slip (copy-pasting a principle's masteryChallengeLessonId back into
  // that same lesson's own prerequisites).
  for (const lesson of lessonsById.values()) {
    if (lesson.prerequisites.includes(lesson.id)) {
      failures += 1;
      console.error(`\n✗ ${lessonFilePathById.get(lesson.id)}\n  [${lesson.id}] lists itself as its own prerequisite`);
    }
  }

  // 3. No cycles anywhere in the full prerequisite graph (DFS with a
  // recursion stack — a cycle is any back-edge into a node still on the
  // current path). Self-references are already caught above but would
  // also surface here as a 1-node cycle; reported once, not twice.
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  for (const id of lessonsById.keys()) color.set(id, WHITE);

  function findCycleFrom(startId: string): string[] | null {
    const path: string[] = [];
    const stack: { id: string; prereqIndex: number }[] = [{ id: startId, prereqIndex: 0 }];
    color.set(startId, GRAY);
    path.push(startId);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const lesson = lessonsById.get(frame.id);
      const prereqs = lesson?.prerequisites ?? [];

      if (frame.prereqIndex >= prereqs.length) {
        color.set(frame.id, BLACK);
        path.pop();
        stack.pop();
        continue;
      }

      const next = prereqs[frame.prereqIndex]!;
      frame.prereqIndex += 1;
      const nextColor = color.get(next);
      if (nextColor === GRAY) {
        // Found the back-edge — return the cycle itself, not the whole path.
        const cycleStart = path.indexOf(next);
        return [...path.slice(cycleStart), next];
      }
      if (nextColor === WHITE && lessonsById.has(next)) {
        color.set(next, GRAY);
        path.push(next);
        stack.push({ id: next, prereqIndex: 0 });
      }
    }
    return null;
  }

  for (const id of lessonsById.keys()) {
    if (color.get(id) !== WHITE) continue;
    const cycle = findCycleFrom(id);
    if (cycle) {
      failures += 1;
      console.error(`\n✗ Curriculum graph\n  cycle detected: ${cycle.join(" → ")}`);
      break; // one report is enough to act on; the graph needs fixing regardless of how many cycles it has
    }
  }

  // 4. Card-level (learning-path display) vs. route-level (gating) must
  // agree, per unit: reproduces LearningPath.tsx's own ordering rule
  // exactly — lessons grouped by principle (principles sorted by their
  // own `order`, each principle's lessons in its declared subLessonIds
  // order), then any lesson belonging to no principle appended after
  // every principle group, in the order its file was encountered. A
  // lesson whose prerequisite is displayed *after* it (this exact
  // ordering) is shown as available before the very thing that's
  // supposed to unlock it — this is precisely the reported production
  // defect, now enforced so it can't silently return.
  const lessonsByUnit = new Map<string, Lesson[]>();
  for (const lesson of lessonsById.values()) {
    const list = lessonsByUnit.get(lesson.unitId) ?? [];
    list.push(lesson);
    lessonsByUnit.set(lesson.unitId, list);
  }

  for (const [unitId, unitLessons] of lessonsByUnit) {
    const principles = [...(principlesByUnit.get(unitId) ?? [])].sort((a, b) => a.order - b.order);
    const displayOrder: string[] = [];
    const placed = new Set<string>();
    for (const principle of principles) {
      for (const subLessonId of principle.subLessonIds) {
        if (lessonsById.has(subLessonId) && !placed.has(subLessonId)) {
          displayOrder.push(subLessonId);
          placed.add(subLessonId);
        }
      }
    }
    for (const lesson of unitLessons) {
      if (!placed.has(lesson.id)) {
        displayOrder.push(lesson.id);
        placed.add(lesson.id);
      }
    }
    const displayIndex = new Map(displayOrder.map((id, index) => [id, index]));

    for (const lesson of unitLessons) {
      for (const prereqId of lesson.prerequisites) {
        const prereqLesson = lessonsById.get(prereqId);
        if (!prereqLesson || prereqLesson.unitId !== unitId) continue; // cross-unit prerequisites are checked for existence above, not ordered against this unit's own display
        const prereqIndex = displayIndex.get(prereqId);
        const lessonIndex = displayIndex.get(lesson.id);
        if (prereqIndex !== undefined && lessonIndex !== undefined && prereqIndex >= lessonIndex) {
          failures += 1;
          console.error(
            `\n✗ ${lessonFilePathById.get(lesson.id)}\n  [${lesson.id}] is displayed on the learning path at or before its own prerequisite "${prereqId}" — a learner would see this lesson's card before the lesson that's supposed to unlock it`,
          );
        }
      }
    }
  }
}

console.log(`\n${checked} lesson file(s), ${puzzlesChecked} puzzle(s) checked, ${failures} issue(s) found.`);
if (failures > 0) process.exit(1);
