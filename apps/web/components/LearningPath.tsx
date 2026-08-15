"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Lesson, Principle } from "@movewise/exercise-schema";
import { starsForPerformance } from "../lib/mastery";
import { PROFICIENT_STATUSES, type MasteryStatus } from "../lib/masteryModel";
import { clearGuestProgress, readGuestProgress } from "../lib/guestProgress";
import { Stars } from "./ui/Stars";
import { MasteryBadge } from "./ui/MasteryBadge";
import { ProgressBar } from "./ui/ProgressBar";
import { UnitMotif } from "./UnitMotif";

export interface UnitWithLessons {
  id: string;
  title: string;
  lessons: Lesson[];
  /** ADR-0008 principle groupings for this unit — empty for units not yet restructured. */
  principles: Principle[];
}

type LessonStatus = "locked" | "available" | "completed";

/**
 * Mirrors the server-side gate in app/learn/[lessonId]/page.tsx exactly —
 * a lesson that would redirect when opened must not show as "available"
 * here, or the learner sees an inviting ▶ that just bounces them back.
 * Lesson completion alone (the old `prerequisites`-only check) is not
 * sufficient once a lesson is a principle's first sub-lesson (ADR-0008).
 */
function statusOf(
  lesson: Lesson,
  completedIds: Set<string> | null,
  principlesById: Map<string, Principle>,
  principlesInOrder: Principle[],
  conceptMastery: Map<string, MasteryStatus> | null,
): LessonStatus {
  if (completedIds === null) return "available"; // guest: no progress tracked, nothing to lock against
  if (completedIds.has(lesson.id)) return "completed";
  if (!lesson.prerequisites.every((p) => completedIds.has(p))) return "locked";

  if (lesson.principleId) {
    const principle = principlesById.get(lesson.principleId);
    if (principle && principle.subLessonIds[0] === lesson.id) {
      const index = principlesInOrder.findIndex((p) => p.id === principle.id);
      const previous = index > 0 ? principlesInOrder[index - 1] : undefined;
      if (previous) {
        const status = conceptMastery?.get(previous.conceptId);
        if (!status || !PROFICIENT_STATUSES.has(status)) return "locked";
      }
    }
  }

  return "available";
}

/**
 * The default home screen: a status-aware syllabus (locked / available /
 * completed, with mastery stars), not a flat link list. Deliberately not
 * a winding node-path — a clean vertical list of unit sections, each a
 * row per lesson, reads as a course outline rather than a Duolingo-style
 * bubble path (docs/design/visual-directions.md).
 *
 * "In progress" and "due for revision" aren't modeled — both need real
 * attempt-tracking / spaced-repetition infrastructure this pass doesn't
 * build (the product brief itself scopes spaced repetition to a later
 * phase). Guests fall back to locally-persisted progress (below) —
 * everything unlocked only until localStorage is read, mirroring the
 * signed-in behavior instead of always showing everything open.
 */
export function LearningPath({
  units,
  completions,
  conceptMastery,
}: {
  units: UnitWithLessons[];
  completions: Map<string, { xpEarned: number; mistakes: number; hintsUsed: number }> | null;
  /** Null for a guest — concept mastery isn't tracked server-side without a session (ADR-0008). */
  conceptMastery: Map<string, MasteryStatus> | null;
}) {
  const [guestCompletions, setGuestCompletions] = useState<Map<
    string,
    { xpEarned: number; mistakes: number; hintsUsed: number }
  > | null>(null);

  // Server-rendered `completions` is only non-null for a signed-in user.
  // For a guest, fall back to whatever this browser has recorded locally
  // (read after mount, so the first paint matches the server's guest
  // render and avoids a hydration mismatch). Once signed in, any
  // lingering local guest data has already been migrated into the
  // account (see migrateGuestProgress in app/actions.ts) and is now
  // stale, so clear it rather than let it resurface after a future
  // logout.
  useEffect(() => {
    if (completions === null) {
      setGuestCompletions(new Map(Object.entries(readGuestProgress())));
    } else {
      clearGuestProgress();
    }
  }, [completions]);

  const effectiveCompletions = completions ?? guestCompletions;
  const completedIds = effectiveCompletions ? new Set(effectiveCompletions.keys()) : null;
  // Guests get no principle-proficiency gate either — same reasoning as
  // completions: no server session to track UserConceptMastery against.
  const effectiveConceptMastery = completedIds === null ? null : conceptMastery;

  const allLessons = units.flatMap((u) => u.lessons);
  const allPrinciplesById = new Map(units.flatMap((u) => u.principles).map((p) => [p.id, p]));
  const statusFor = (lesson: Lesson) =>
    statusOf(
      lesson,
      completedIds,
      allPrinciplesById,
      units.find((u) => u.id === lesson.unitId)?.principles ?? [],
      effectiveConceptMastery,
    );
  const nextUp = allLessons.find((l) => statusFor(l) === "available");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-6)" }}>
      {nextUp && (
        <Link href={`/learn/${nextUp.id}`} className="mw-continue-card">
          <div className="mw-continue-eyebrow">
            {completedIds && completedIds.size > 0 ? "Continue learning" : "Start here"}
          </div>
          <div className="mw-continue-title">{nextUp.title}</div>
          <span className="mw-continue-arrow" aria-hidden="true">
            →
          </span>
        </Link>
      )}

      {units.map((unit) => {
        const completedInUnit = unit.lessons.filter((l) => statusFor(l) === "completed").length;

        // ADR-0008: group by Principle where the unit has been
        // restructured into one; fall back to a flat lesson list for
        // units that haven't been (step-type-preview — a non-curated
        // demo unit, deliberately left out, see docs/roadmap.md's
        // Phase A).
        const groups: { heading: string | null; lessons: Lesson[] }[] =
          unit.principles.length > 0
            ? unit.principles.map((principle) => ({
                heading: principle.title,
                lessons: principle.subLessonIds
                  .map((id) => unit.lessons.find((l) => l.id === id))
                  .filter((l): l is Lesson => l !== undefined),
              }))
            : [{ heading: null, lessons: unit.lessons }];

        // Lessons in this unit that aren't part of any principle yet
        // (e.g. a unit mastery-challenge lesson spanning every principle).
        const groupedLessonIds = new Set(groups.flatMap((g) => g.lessons.map((l) => l.id)));
        const ungrouped = unit.lessons.filter((l) => !groupedLessonIds.has(l.id));
        if (ungrouped.length > 0) groups.push({ heading: null, lessons: ungrouped });

        return (
          <section key={unit.id}>
            <div className="mw-unit-header">
              <span className="mw-unit-motif">
                <UnitMotif unitId={unit.id} />
              </span>
              <h2 className="mw-unit-title">{unit.title}</h2>
              <span className="mw-unit-count">
                {completedInUnit} / {unit.lessons.length}
              </span>
            </div>
            <div className="mw-unit-progress">
              <ProgressBar value={completedInUnit} max={unit.lessons.length} label={`${unit.title} progress`} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-5)" }}>
              {groups.map((group, groupIndex) => (
                <div key={group.heading ?? `ungrouped-${groupIndex}`}>
                  {group.heading && (
                    <div className="mw-principle-header">
                      <h3 className="mw-principle-title">{group.heading}</h3>
                      {(() => {
                        const principle = unit.principles[groupIndex];
                        const status = principle ? effectiveConceptMastery?.get(principle.conceptId) : undefined;
                        return <MasteryBadge status={status} />;
                      })()}
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-2)" }}>
                    {group.lessons.map((lesson) => {
                      const status = statusFor(lesson);
                      const record = effectiveCompletions?.get(lesson.id);

                      const row = (
                        <div className={`mw-lesson-node mw-lesson-node--${status}`}>
                          <span className="mw-lesson-node-icon" aria-hidden="true">
                            {status === "locked" ? "🔒" : status === "completed" ? "✓" : "▶"}
                          </span>
                          <span className="mw-lesson-node-title">{lesson.title}</span>
                          {status === "completed" && record && (
                            <Stars count={starsForPerformance(record.mistakes, record.hintsUsed)} />
                          )}
                        </div>
                      );

                      return status === "locked" ? (
                        <div key={lesson.id} aria-disabled="true">
                          {row}
                        </div>
                      ) : (
                        <Link key={lesson.id} href={`/learn/${lesson.id}`} className="mw-lesson-node-link">
                          {row}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
