"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Lesson, Principle } from "@movewise/exercise-schema";
import { starsForPerformance } from "../lib/mastery";
import { PROFICIENT_STATUSES, type MasteryStatus } from "../lib/masteryModel";
import { clearGuestProgress, readGuestProgress } from "../lib/guestProgress";

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

function Stars({ count }: { count: 1 | 2 | 3 }) {
  return (
    <span aria-label={`${count} of 3 stars`} style={{ color: "#c68a00", letterSpacing: 1 }}>
      {"★".repeat(count)}
      <span style={{ opacity: 0.3 }}>{"★".repeat(3 - count)}</span>
    </span>
  );
}

const MASTERY_LABELS: Record<MasteryStatus, string> = {
  "not-started": "Not started",
  learning: "Learning",
  practising: "Practising",
  "ready-for-assessment": "Ready for assessment",
  proficient: "Proficient",
  mastered: "Mastered",
  "revision-due": "Revision due",
  struggling: "Needs review",
  recovered: "Recovered",
};

function MasteryBadge({ status }: { status: MasteryStatus | undefined }) {
  if (!status || status === "not-started") return null;
  const color = status === "struggling" ? "#b3261e" : PROFICIENT_STATUSES.has(status) ? "#1e7a34" : "#6b6b78";
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color }}>
      {MASTERY_LABELS[status]}
    </span>
  );
}

/**
 * The default home screen: a status-aware syllabus (locked / available /
 * completed, with mastery stars), not a flat link list. Deliberately not
 * a winding node-path — a clean vertical list of unit sections, each a
 * row per lesson, reads as a course outline rather than a Duolingo-style
 * bubble path.
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
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {nextUp && (
        <Link
          href={`/learn/${nextUp.id}`}
          style={{
            display: "block",
            padding: "14px 16px",
            borderRadius: 10,
            background: "#4c3fd6",
            color: "#fff",
            textDecoration: "none",
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.85, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {completedIds && completedIds.size > 0 ? "Continue learning" : "Start here"}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{nextUp.title}</div>
        </Link>
      )}

      {units.map((unit) => {
        const completedInUnit = unit.lessons.filter((l) => statusFor(l) === "completed").length;
        const progress = unit.lessons.length > 0 ? completedInUnit / unit.lessons.length : 0;

        // ADR-0008: group by Principle where the unit has been
        // restructured into one; fall back to a flat lesson list for
        // units that haven't been (check-and-checkmate, basic-tactics,
        // step-type-preview — see docs/roadmap.md's Phase A priority to
        // restructure one unit fully before the others).
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
          <div key={unit.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h2 style={{ margin: "0 0 6px" }}>{unit.title}</h2>
              <span style={{ fontSize: 13, opacity: 0.6 }}>
                {completedInUnit} / {unit.lessons.length}
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: "#e5e5ea", marginBottom: 10, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress * 100}%`, background: "#4c3fd6" }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {groups.map((group, groupIndex) => (
                <div key={group.heading ?? `ungrouped-${groupIndex}`}>
                  {group.heading && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 4px" }}>
                      <h3 style={{ margin: 0, fontSize: 14, opacity: 0.85 }}>{group.heading}</h3>
                      {(() => {
                        const principle = unit.principles[groupIndex];
                        const status = principle ? effectiveConceptMastery?.get(principle.conceptId) : undefined;
                        return <MasteryBadge status={status} />;
                      })()}
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {group.lessons.map((lesson) => {
                      const status = statusFor(lesson);
                      const record = effectiveCompletions?.get(lesson.id);

                      const row = (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 12px",
                            borderRadius: 8,
                            border: "1px solid #e5e5ea",
                            opacity: status === "locked" ? 0.5 : 1,
                            background: status === "completed" ? "#faf8ff" : "transparent",
                          }}
                        >
                          <span aria-hidden="true" style={{ width: 20, textAlign: "center" }}>
                            {status === "locked" ? "🔒" : status === "completed" ? "✓" : "▶"}
                          </span>
                          <span style={{ flex: 1 }}>{lesson.title}</span>
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
                        <Link
                          key={lesson.id}
                          href={`/learn/${lesson.id}`}
                          style={{ textDecoration: "none", color: "inherit" }}
                        >
                          {row}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
