"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Lesson, Principle } from "@movewise/exercise-schema";
import { starsForPerformance } from "../lib/mastery";
import { PROFICIENT_STATUSES, type MasteryStatus } from "../lib/masteryModel";
import { clearGuestProgress, readGuestProgress } from "../lib/guestProgress";
import { readStartedLessons } from "../lib/lessonProgressUI";
import { Stars } from "./ui/Stars";
import { MasteryBadge } from "./ui/MasteryBadge";
import { ProgressBar } from "./ui/ProgressBar";
import { UnitMotif } from "./UnitMotif";
import { DailyGoalStrip } from "./ui/DailyGoalStrip";

export interface UnitWithLessons {
  id: string;
  title: string;
  lessons: Lesson[];
  /** ADR-0008 principle groupings for this unit — empty for units not yet restructured. */
  principles: Principle[];
}

/**
 * Five-state progression model (Phase 4). "locked"/"available"/"completed"
 * are the real, server-verifiable states everything else (gating,
 * `nextUp`) is computed against — see `statusOf` below, unchanged in
 * meaning from before this pass. "in-progress" and "mastered" are display
 * refinements layered on top, computed in the render loop from data
 * `statusOf` doesn't need: "in-progress" from the client-only "started"
 * signal (lib/lessonProgressUI.ts, never gates anything), "mastered" from
 * a completed lesson's own 3-star performance — a *lesson-level*
 * distinction, not to be confused with `MasteryStatus`'s "mastered"
 * concept-level state (masteryModel.ts), which is Phase C/gameApplication-
 * Score territory and not reachable yet.
 */
type LessonStatus = "locked" | "available" | "in-progress" | "completed" | "mastered";
type CoreStatus = "locked" | "available" | "completed";

/**
 * Mirrors the server-side gate in app/learn/[lessonId]/page.tsx exactly —
 * a lesson that would redirect when opened must not show as "available"
 * here, or the learner sees an inviting ▶ that just bounces them back.
 * Lesson completion alone (the old `prerequisites`-only check) is not
 * sufficient once a lesson is a principle's first sub-lesson (ADR-0008).
 *
 * `conceptMastery` must be the raw per-session value here — `null` means
 * "no signed-in session, no UserConceptMastery to check" (a guest),
 * `Map` (even an empty one) means "signed in, real tracking exists".
 * Collapsing that distinction away (as an earlier version of this
 * function did, via a derived "effective" value that went `null` once
 * *any* progress existed, guest or not) meant a guest's missing mastery
 * data read as "checked and not proficient" instead of "nothing to
 * check" — a real bug: a guest who aced a principle's lessons still saw
 * its next principle's first lesson as locked, even though the
 * server-side route guard (below, already correctly scoped to
 * `if (user && ...)`) would have let them straight in by URL. Confirmed
 * live via Playwright before this fix, not assumed from reading the code.
 */
function statusOf(
  lesson: Lesson,
  completedIds: Set<string> | null,
  principlesById: Map<string, Principle>,
  principlesInOrder: Principle[],
  conceptMastery: Map<string, MasteryStatus> | null,
): CoreStatus {
  if (completedIds === null) return "available"; // guest: no progress tracked, nothing to lock against
  if (completedIds.has(lesson.id)) return "completed";
  if (!lesson.prerequisites.every((p) => completedIds.has(p))) return "locked";

  // No signed-in session to check proficiency against at all (a guest) —
  // skip the principle gate entirely rather than reading "no data" as
  // "not proficient". Matches the server-side guard's own `if (user && ...)`.
  if (lesson.principleId && conceptMastery !== null) {
    const principle = principlesById.get(lesson.principleId);
    if (principle && principle.subLessonIds[0] === lesson.id) {
      const index = principlesInOrder.findIndex((p) => p.id === principle.id);
      const previous = index > 0 ? principlesInOrder[index - 1] : undefined;
      if (previous) {
        const status = conceptMastery.get(previous.conceptId);
        if (!status || !PROFICIENT_STATUSES.has(status)) return "locked";
      }
    }
  }

  return "available";
}

/**
 * What a locked lesson needs before it opens — shown on the row itself
 * (Phase 4: "clearly show what is required to unlock a lesson"), not just
 * as a banner after a bounced direct-URL attempt.
 */
function unlockReason(
  lesson: Lesson,
  completedIds: Set<string> | null,
  lessonsById: Map<string, Lesson>,
  principlesById: Map<string, Principle>,
  principlesInOrder: Principle[],
  hasConceptMasteryTracking: boolean,
): string | null {
  if (completedIds === null) return null; // guest: no per-row reason, matches statusOf's "everything open" treatment
  const missingPrereq = lesson.prerequisites.find((p) => !completedIds.has(p));
  if (missingPrereq) {
    const title = lessonsById.get(missingPrereq)?.title ?? missingPrereq;
    return `Unlocks after "${title}"`;
  }
  // No session to check proficiency against — same reasoning as statusOf:
  // a guest is never locked by the principle gate, so there's no reason
  // to report for it either.
  if (lesson.principleId && hasConceptMasteryTracking) {
    const principle = principlesById.get(lesson.principleId);
    if (principle && principle.subLessonIds[0] === lesson.id) {
      const index = principlesInOrder.findIndex((p) => p.id === principle.id);
      const previous = index > 0 ? principlesInOrder[index - 1] : undefined;
      if (previous) return `Unlocks once "${previous.title}" is proficient`;
    }
  }
  return null;
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
  // "In progress" (Phase 4) is a client-only UI signal (lib/lessonProgressUI.ts)
  // — read after mount, same reasoning as guestCompletions below: it must
  // match the server's first paint (nothing "in progress" yet) to avoid a
  // hydration mismatch.
  const [startedIds, setStartedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    setStartedIds(readStartedLessons());
  }, []);

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
  // `conceptMastery` itself is already the right "do we have a real
  // session to check proficiency against" signal — `null` for a guest
  // (no UserConceptMastery rows exist without a session), a real Map
  // (possibly empty) once signed in. No derived "effective" value needed
  // — a previous version of this file had one that collapsed to `null`
  // for guests via a different, unrelated condition (`completedIds`),
  // which happened to produce the same `null` value here but obscured
  // that `statusOf`/`unlockReason` need this exact "have a session or
  // not" distinction, not a stand-in for it. See statusOf's doc comment
  // for the real bug that caused.
  const hasConceptMasteryTracking = conceptMastery !== null;

  const allLessons = units.flatMap((u) => u.lessons);
  const allLessonsById = new Map(allLessons.map((l) => [l.id, l]));
  const allPrinciplesById = new Map(units.flatMap((u) => u.principles).map((p) => [p.id, p]));
  const statusFor = (lesson: Lesson) =>
    statusOf(
      lesson,
      completedIds,
      allPrinciplesById,
      units.find((u) => u.id === lesson.unitId)?.principles ?? [],
      conceptMastery,
    );
  const unlockReasonFor = (lesson: Lesson) =>
    unlockReason(
      lesson,
      completedIds,
      allLessonsById,
      allPrinciplesById,
      units.find((u) => u.id === lesson.unitId)?.principles ?? [],
      hasConceptMasteryTracking,
    );
  // Layers "in-progress" and "mastered" onto the three core, gating-
  // relevant statuses — see the LessonStatus/CoreStatus doc comment above.
  const displayStatusFor = (lesson: Lesson): LessonStatus => {
    const core = statusFor(lesson);
    if (core === "available" && startedIds.has(lesson.id)) return "in-progress";
    if (core === "completed") {
      const record = effectiveCompletions?.get(lesson.id);
      if (record && starsForPerformance(record.mistakes, record.hintsUsed) === 3) return "mastered";
    }
    return core;
  };
  const nextUp = allLessons.find((l) => statusFor(l) === "available");

  // Phase 5's "review-needed section": principles whose concept has
  // regressed to "struggling" per lib/masteryModel.ts — real signal
  // already computed from ExerciseAttempt history, not a placeholder.
  // Signed-in only, same reasoning as everywhere else conceptMastery is
  // used: guests have no server-tracked mastery to flag.
  const needsReview =
    conceptMastery === null
      ? []
      : units
          .flatMap((u) => u.principles.map((p) => ({ unit: u, principle: p })))
          .filter(({ principle }) => conceptMastery.get(principle.conceptId) === "struggling");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-6)" }}>
      <DailyGoalStrip />

      {needsReview.length > 0 && (
        <div className="mw-review-needed">
          <h2 className="mw-review-needed-title">Review needed</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-2)" }}>
            {needsReview.map(({ principle }) => (
              <Link key={principle.id} href={`/review/${principle.id}`} className="mw-review-needed-item">
                <span className="mw-review-needed-item-title">{principle.title}</span>
                <span className="mw-review-needed-item-detail">
                  A few recent attempts went wrong — a quick refresher and some easier practice will help this stick.
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

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

        const unitComplete = unit.lessons.length > 0 && completedInUnit === unit.lessons.length;

        return (
          <section key={unit.id}>
            <div className="mw-unit-header">
              <span className="mw-unit-motif">
                <UnitMotif unitId={unit.id} />
              </span>
              <h2 className="mw-unit-title">{unit.title}</h2>
              {unitComplete ? (
                <span className="mw-badge mw-badge--success">Chapter complete</span>
              ) : (
                <span className="mw-unit-count">
                  {completedInUnit} / {unit.lessons.length}
                </span>
              )}
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
                        const status = principle ? conceptMastery?.get(principle.conceptId) : undefined;
                        return <MasteryBadge status={status} />;
                      })()}
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--mw-space-2)" }}>
                    {group.lessons.map((lesson) => {
                      const coreStatus = statusFor(lesson);
                      const status = displayStatusFor(lesson);
                      const record = effectiveCompletions?.get(lesson.id);
                      const reason = coreStatus === "locked" ? unlockReasonFor(lesson) : null;

                      const icon =
                        status === "locked"
                          ? "🔒"
                          : status === "in-progress"
                            ? "◐"
                            : status === "mastered"
                              ? "✓"
                              : status === "completed"
                                ? "✓"
                                : "▶";

                      const row = (
                        <div className={`mw-lesson-node mw-lesson-node--${status}`}>
                          <span className="mw-lesson-node-icon" aria-hidden="true">
                            {icon}
                          </span>
                          <span className="mw-lesson-node-body">
                            <span className="mw-lesson-node-title">{lesson.title}</span>
                            {reason && <span className="mw-lesson-node-reason">{reason}</span>}
                            {status === "in-progress" && <span className="mw-lesson-node-reason">In progress</span>}
                          </span>
                          {status === "mastered" && <span className="mw-badge mw-badge--success">Mastered</span>}
                          {(status === "completed" || status === "mastered") && record && (
                            <Stars count={starsForPerformance(record.mistakes, record.hintsUsed)} />
                          )}
                        </div>
                      );

                      return coreStatus === "locked" ? (
                        <div key={lesson.id} aria-disabled="true">
                          {row}
                        </div>
                      ) : (
                        <Link key={lesson.id} href={`/learn/${lesson.id}`} className="mw-lesson-node-link">
                          {row}
                        </Link>
                      );
                    })}
                    {(() => {
                      // Puzzle pool (ADR-0008): a principle's own practice
                      // exercises, reachable once every one of its
                      // sub-lessons is done — matches docs/learner-model.md's
                      // `practising` state ("sub-lessons done, working
                      // through concept-tagged Puzzles") and the server-side
                      // gate in app/practice/[principleId]/page.tsx exactly,
                      // same reasoning as the lesson-locking mirror above.
                      const principle = unit.principles[groupIndex];
                      if (!principle || principle.puzzleIds.length === 0) return null;
                      const allSubLessonsDone = group.lessons.every((l) => statusFor(l) === "completed");
                      if (!allSubLessonsDone) return null;
                      return (
                        <Link
                          href={`/practice/${principle.id}`}
                          className="mw-lesson-node-link"
                        >
                          <div className="mw-lesson-node mw-lesson-node--available">
                            <span className="mw-lesson-node-icon" aria-hidden="true">
                              🧩
                            </span>
                            <span className="mw-lesson-node-body">
                              <span className="mw-lesson-node-title">Practice puzzles</span>
                              <span className="mw-lesson-node-reason">
                                {principle.puzzleIds.length} puzzle{principle.puzzleIds.length === 1 ? "" : "s"}
                              </span>
                            </span>
                          </div>
                        </Link>
                      );
                    })()}
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
