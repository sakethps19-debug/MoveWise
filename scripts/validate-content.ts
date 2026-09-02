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
import { parseLesson, parseConcept, parsePrinciple, parsePuzzle, type Lesson, type Puzzle, type Principle } from "../packages/exercise-schema/src/index";
import { validateLesson, validatePuzzle, impliedMoveConceptIds } from "../packages/exercise-schema/src/validate-chess";
import { validateInstructionalQuality, validatePuzzleInstructionalQuality } from "../packages/exercise-schema/src/validate-instructional";
import { DETECTABLE_CONCEPT_IDS } from "../apps/web/lib/conceptDetection";
import { parseProvenanceRecord, validateProvenanceManifest, type ProvenanceRecord } from "../packages/exercise-schema/src/provenance";

const CONTENT_ROOT = join(import.meta.dirname, "../packages/content");
const UNITS_ROOT = join(CONTENT_ROOT, "units");
const CONCEPTS_FILE = join(CONTENT_ROOT, "concepts.json");
const PRINCIPLES_ROOT = join(CONTENT_ROOT, "principles");
const PUZZLES_ROOT = join(CONTENT_ROOT, "puzzles");
const PROVENANCE_ROOT = join(CONTENT_ROOT, "provenance");

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

// Provenance manifest (P0 content-provenance requirement — see
// docs/content-licensing-policy.md). Every ProvenanceRecord is validated
// individually and cross-manifest (duplicate contentId, content-hash
// drift, source/licence mismatch); every puzzle that declares a
// provenanceId must resolve to a real, non-rejected record.
const provenanceById = new Map<string, ProvenanceRecord>();
if (existsSync(PROVENANCE_ROOT)) {
  const allRecords: ProvenanceRecord[] = [];
  for (const file of readdirSync(PROVENANCE_ROOT)) {
    if (!file.endsWith(".json")) continue;
    const filePath = join(PROVENANCE_ROOT, file);
    const raw = JSON.parse(readFileSync(filePath, "utf-8"));
    let fileOk = true;
    for (const entry of raw) {
      const record = parseProvenanceRecord(entry); // throws on structural schema violation
      allRecords.push(record);
      provenanceById.set(record.contentId, record);
    }
    if (fileOk) console.log(`✓ ${filePath} (${raw.length} provenance records)`);
  }
  const provenanceIssues = validateProvenanceManifest(allRecords);
  for (const issue of provenanceIssues) {
    failures += 1;
    console.error(`\n✗ ${PROVENANCE_ROOT}\n  [${issue.contentId}] ${issue.message}`);
  }
}

for (const puzzle of puzzlesById.values()) {
  if (!puzzle.provenanceId) continue;
  const record = provenanceById.get(puzzle.provenanceId);
  if (!record) {
    failures += 1;
    console.error(`\n✗ ${puzzle.id}\n  provenanceId "${puzzle.provenanceId}" has no matching record in ${PROVENANCE_ROOT}`);
  } else if (record.validationStatus === "rejected") {
    failures += 1;
    console.error(`\n✗ ${puzzle.id}\n  provenanceId "${puzzle.provenanceId}" is marked "rejected" and must not be referenced by shipped content`);
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

// Every concept id lib/conceptDetection.ts's detectConcepts can actually
// emit for a real analysed game must be registered too — a gap here means
// a genuine game-detected mistake renders as a raw slug (e.g.
// "opposition-key-squares") instead of a real title anywhere a concept
// name is displayed (the Progress dashboard's "Mistakes from analysed
// games", lib/principles.ts's loadConceptTitles()).
for (const conceptId of DETECTABLE_CONCEPT_IDS) {
  if (!conceptIds.has(conceptId)) {
    failures += 1;
    console.error(
      `\n✗ apps/web/lib/conceptDetection.ts\n  detectable concept id "${conceptId}" is not a registered concept (packages/content/concepts.json)`,
    );
  }
}

// Principle groupings — cross-referential integrity
const principlesByUnit = new Map<string, { id: string; order: number; subLessonIds: string[] }[]>();
const principlesById = new Map<string, Principle>();
if (existsSync(PRINCIPLES_ROOT)) {
  for (const file of readdirSync(PRINCIPLES_ROOT)) {
    if (!file.endsWith(".json")) continue;
    const filePath = join(PRINCIPLES_ROOT, file);
    const raw = JSON.parse(readFileSync(filePath, "utf-8"));
    let fileOk = true;
    for (const entry of raw) {
      const principle = parsePrinciple(entry); // throws on structural violation
      principlesById.set(principle.id, principle);
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

  // 5. A cross-unit prerequisite must point at its unit's own terminal
  // lesson (the one nothing else in that unit lists as a prerequisite),
  // not an earlier lesson partway through it — otherwise the next
  // chapter can start before the previous one is actually finished. A
  // real, confirmed instance of this: Basic Tactics' first lesson
  // depended on Check and Checkmate's 3rd of 4 lessons, so a learner
  // could reach Basic Tactics without ever seeing Check and Checkmate's
  // last lesson. Skips units with no internal chain at all (a single-
  // lesson unit, or one where every lesson only has cross-unit/no
  // prerequisites) — nothing to be "partway through" there.
  const referencedWithinUnit = new Map<string, Set<string>>(); // unitId -> lesson ids some other same-unit lesson depends on
  for (const lesson of lessonsById.values()) {
    for (const prereqId of lesson.prerequisites) {
      const prereqLesson = lessonsById.get(prereqId);
      if (!prereqLesson || prereqLesson.unitId !== lesson.unitId) continue;
      const set = referencedWithinUnit.get(lesson.unitId) ?? new Set<string>();
      set.add(prereqId);
      referencedWithinUnit.set(lesson.unitId, set);
    }
  }
  const terminalLessonsByUnit = new Map<string, Set<string>>();
  for (const [unitId, unitLessons] of lessonsByUnit) {
    const referenced = referencedWithinUnit.get(unitId) ?? new Set<string>();
    if (referenced.size === 0) continue; // no internal chain in this unit — nothing to bypass
    terminalLessonsByUnit.set(unitId, new Set(unitLessons.filter((l) => !referenced.has(l.id)).map((l) => l.id)));
  }

  for (const lesson of lessonsById.values()) {
    for (const prereqId of lesson.prerequisites) {
      const prereqLesson = lessonsById.get(prereqId);
      if (!prereqLesson || prereqLesson.unitId === lesson.unitId) continue; // same-unit prerequisites are checked above, not here
      const terminals = terminalLessonsByUnit.get(prereqLesson.unitId);
      if (terminals && !terminals.has(prereqId)) {
        failures += 1;
        console.error(
          `\n✗ ${lessonFilePathById.get(lesson.id)}\n  [${lesson.id}] depends on "${prereqId}", which isn't the last lesson of unit "${prereqLesson.unitId}" — a learner could start this lesson before finishing that unit`,
        );
      }
    }
  }
}

// Curriculum/practice concept integrity — real, reproduced production
// defect this exists to catch: Board Basics Practice (meet-the-pieces'
// very first, earliest-unlocking principle) required playing king moves
// (Ka1-b2, Ke1-f2) although "Meet the king" — six principles later —
// hadn't been taught, and its own declared conceptIds (board-orientation,
// square-identification) didn't mention king-movement at all, so the
// mismatch was invisible to every check above. This pass computes, for
// every lesson and every principle's puzzle pool, the real set of
// concepts an "ordinarily unlocked" learner (no placement bypass) can
// actually be assumed to know by the time they reach it — from the exact
// prerequisite graph already validated acyclic above, not a separate
// guess — and fails if anything assessed there, declared OR structurally
// implied by the actual moves on the board, falls outside that set.
{
  const conceptsIntroducedByCache = new Map<string, Set<string>>();
  function conceptsIntroducedBy(lesson: Lesson): Set<string> {
    if (conceptsIntroducedByCache.has(lesson.id)) return conceptsIntroducedByCache.get(lesson.id)!;
    const declared = lesson.introducedConceptIds;
    const result = new Set<string>(declared && declared.length > 0 ? declared : lesson.masteryTags);
    conceptsIntroducedByCache.set(lesson.id, result);
    return result;
  }

  // Every concept available once this lesson has been completed —
  // everything its own (transitive) prerequisites make available, plus
  // whatever this lesson itself introduces and any explicit
  // prerequisiteConceptIds it declares. The prerequisite graph is
  // already confirmed acyclic above, so plain memoized recursion is safe.
  const availableAfterCache = new Map<string, Set<string>>();
  function conceptsAvailableAfter(lessonId: string): Set<string> {
    const cached = availableAfterCache.get(lessonId);
    if (cached) return cached;
    const acc = new Set<string>();
    availableAfterCache.set(lessonId, acc); // populated in place below; safe even if re-entered, graph is acyclic
    const lesson = lessonsById.get(lessonId);
    if (!lesson) return acc;
    for (const prereqId of lesson.prerequisites) {
      for (const c of conceptsAvailableAfter(prereqId)) acc.add(c);
    }
    for (const c of conceptsIntroducedBy(lesson)) acc.add(c);
    for (const c of lesson.prerequisiteConceptIds ?? []) acc.add(c);
    return acc;
  }

  // Every concept available *while working through* this lesson — its
  // prerequisites' availability, plus this lesson's own introduced
  // concepts (a lesson may teach something in an early step and assess it
  // in a later one within itself) and its own explicit extra assumptions.
  function conceptsAvailableFor(lesson: Lesson): Set<string> {
    const acc = new Set<string>();
    for (const prereqId of lesson.prerequisites) {
      for (const c of conceptsAvailableAfter(prereqId)) acc.add(c);
    }
    for (const c of conceptsIntroducedBy(lesson)) acc.add(c);
    for (const c of lesson.prerequisiteConceptIds ?? []) acc.add(c);
    return acc;
  }

  function moveConceptsForStep(step: Lesson["steps"][number]): { fen: string; moves: string[] } | null {
    switch (step.type) {
      case "move-piece":
        return { fen: step.fen, moves: [...step.expectedMoves, ...step.altValid] };
      case "capture":
        return { fen: step.fen, moves: step.expectedMoves };
      case "find-legal-move":
        return { fen: step.fen, moves: step.validMoves };
      default:
        return null;
    }
  }

  function reportMissing(where: string, missing: Set<string>) {
    for (const concept of missing) {
      failures += 1;
      console.error(
        `\n✗ ${where}\n  requires concept "${concept}" that hasn't been taught yet (not introduced by this content or any of its prerequisites) — an ordinarily unlocked learner couldn't know this`,
      );
    }
  }

  // Every lesson: its declared assessedConceptIds (falling back to
  // masteryTags when not authored) must be available; so must every
  // concept structurally implied by its own move-based steps' correct
  // moves, whether or not the content declared it.
  for (const lesson of lessonsById.values()) {
    const available = conceptsAvailableFor(lesson);
    const declaredAssessed = lesson.assessedConceptIds && lesson.assessedConceptIds.length > 0 ? lesson.assessedConceptIds : lesson.masteryTags;
    const missing = new Set(declaredAssessed.filter((c) => !available.has(c)));
    for (const step of lesson.steps) {
      const moveInfo = moveConceptsForStep(step);
      if (!moveInfo) continue;
      for (const uci of moveInfo.moves) {
        for (const concept of impliedMoveConceptIds(moveInfo.fen, uci)) {
          if (!available.has(concept)) missing.add(concept);
        }
      }
    }
    if (missing.size > 0) reportMissing(`${lessonFilePathById.get(lesson.id)} [${lesson.id}]`, missing);
  }

  // Every principle's practice pool: reachable once that principle's own
  // sub-lessons are complete (practice/[principleId]'s real unlock gate),
  // so the concepts available to it are exactly the union of what its own
  // sub-lessons make available, plus any explicit prerequisiteConceptIds.
  for (const principle of principlesById.values()) {
    const available = new Set<string>();
    for (const subLessonId of principle.subLessonIds) {
      for (const c of conceptsAvailableAfter(subLessonId)) available.add(c);
    }
    for (const c of principle.prerequisiteConceptIds ?? []) available.add(c);

    for (const puzzleId of principle.puzzleIds) {
      const puzzle = puzzlesById.get(puzzleId);
      if (!puzzle) continue; // unknown-id case already reported above
      const missing = new Set(puzzle.conceptIds.filter((c) => !available.has(c)));
      for (const c of puzzle.prerequisiteConceptIds ?? []) {
        if (!available.has(c)) missing.add(c);
      }
      if (puzzle.kind === "move") {
        for (const uci of puzzle.correctMoves ?? []) {
          for (const concept of impliedMoveConceptIds(puzzle.fen, uci)) {
            if (!available.has(concept)) missing.add(concept);
          }
        }
      }
      if (missing.size > 0) reportMissing(`${PUZZLES_ROOT}/${principle.unitId}.json [${puzzle.id}] (principle "${principle.id}")`, missing);
    }
  }

  // The placement assessment is deliberately exempt: probing whether an
  // untaught concept is already known (e.g. a rated adult who already
  // knows how a king moves) is placement's entire purpose, and it has no
  // "taught by a prerequisite" chain to check against — nothing has been
  // taught yet when it runs. It still gets every other check above
  // (FEN legality, registered concept ids, schema validity).
}

console.log(`\n${checked} lesson file(s), ${puzzlesChecked} puzzle(s) checked, ${failures} issue(s) found.`);
if (failures > 0) process.exit(1);
