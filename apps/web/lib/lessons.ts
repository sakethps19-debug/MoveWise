import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseLesson, type Lesson } from "@movewise/exercise-schema";

const CONTENT_ROOT = path.join(process.cwd(), "..", "..", "packages", "content", "units");

function allLessonFiles(): string[] {
  const files: string[] = [];
  for (const unit of readdirSync(CONTENT_ROOT, { withFileTypes: true })) {
    if (!unit.isDirectory()) continue;
    const unitDir = path.join(CONTENT_ROOT, unit.name);
    for (const entry of readdirSync(unitDir)) {
      if (entry.endsWith(".json")) files.push(path.join(unitDir, entry));
    }
  }
  return files.sort();
}

/**
 * Loads and schema-validates every lesson in a unit, in filename
 * order (lesson-01-..., lesson-02-..., ...). Throws if any lesson
 * fails LessonSchema — a broken lesson should fail the page render
 * loudly in development rather than silently skip.
 */
export function loadUnitLessons(unitId: string): Lesson[] {
  return allLessonFiles()
    .filter((f) => f.includes(`${path.sep}${unitId}${path.sep}`))
    .map((f) => parseLesson(JSON.parse(readFileSync(f, "utf-8"))));
}

export function loadLesson(lessonId: string): Lesson | null {
  for (const file of allLessonFiles()) {
    const data = JSON.parse(readFileSync(file, "utf-8"));
    if (data.id === lessonId) return parseLesson(data);
  }
  return null;
}
