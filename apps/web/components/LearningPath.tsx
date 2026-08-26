"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Lesson, Principle } from "@movewise/exercise-schema";
import { starsForPerformance } from "../lib/mastery";
import type { MasteryStatus } from "../lib/masteryModel";
import { statusOf, unlockReason } from "../lib/lessonStatus";
import { useEffectiveCompletions, type CompletionRecord } from "../lib/useEffectiveCompletions";
import { readStartedLessons } from "../lib/lessonProgressUI";
import { Stars } from "./ui/Stars";
import { MasteryBadge } from "./ui/MasteryBadge";
import { ProgressBar } from "./ui/ProgressBar";
import { UnitMotif } from "./UnitMotif";
import { DailyGoalStrip } from "./ui/DailyGoalStrip";
import { OnboardingQuiz } from "./OnboardingQuiz";
import {
  hasSeenOnboarding,
  readOnboardingAnswers,
  greetingForGoal,
  prefersPracticeFirst,
  type OnboardingAnswers,
} from "../lib/onboarding";

export interface UnitWithLessons {
  id: string;
  title: string;
  lessons: Lesson[];
  /** ADR-0008 principle groupings for this unit — empty for units not yet restructured. */
  principles: Principle[];
}

/**
 * Five-state progression model (Phase 4). "locked"/"available"/"completed"
 * (see `CoreStatus`, lib/lessonStatus.ts) are the real, server-verifiable
 * states everything else (gating, `nextUp`) is computed against.
 * "in-progress" and "mastered" are display refinements layered on top,
 * computed in the render loop from data `statusOf` doesn't need:
 * "in-progress" from the client-only "started" signal
 * (lib/lessonProgressUI.ts, never gates anything), "mastered" from a
 * completed lesson's own 3-star performance — a *lesson-level*
 * distinction, not to be confused with `MasteryStatus`'s "mastered"
 * concept-level state (masteryModel.ts), which is Phase C/gameApplication-
 * Score territory and not reachable yet.
 */
type LessonStatus = "locked" | "available" | "in-progress" | "completed" | "mastered";

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
  completions: Map<string, CompletionRecord> | null;
  /** Null for a guest — concept mastery isn't tracked server-side without a session (ADR-0008). */
  conceptMastery: Map<string, MasteryStatus> | null;
}) {
  // "In progress" (Phase 4) is a client-only UI signal (lib/lessonProgressUI.ts)
  // — read after mount, same reasoning as effectiveCompletions below: it
  // must match the server's first paint (nothing "in progress" yet) to
  // avoid a hydration mismatch.
  const [startedIds, setStartedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    setStartedIds(readStartedLessons());
  }, []);

  // Onboarding/curriculum-collapse (P1-A): both read after mount for the
  // same hydration-mismatch reason as startedIds above — the server (and
  // a guest's very first paint) always renders as if neither has run yet.
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingAnswers, setOnboardingAnswers] = useState<OnboardingAnswers | null>(null);
  const [manuallyExpanded, setManuallyExpanded] = useState(false);

  const { effectiveCompletions, completedIds } = useEffectiveCompletions(completions);
  // A true first-time visit: nothing completed yet, and no lesson even
  // started — the exact case "confronted with ~20 disabled cards
  // immediately" described. A returning learner (any real progress at
  // all) always sees the full syllabus; only a genuinely fresh one gets
  // the collapsed preview and the onboarding quiz below.
  const hasAnyProgress = (completedIds?.size ?? 0) > 0 || startedIds.size > 0;

  useEffect(() => {
    // `hasAnyProgress` starts false on every very first render (neither
    // completedIds nor startedIds have been read from localStorage yet,
    // even for a guest who actually has real completions) — so this
    // must actively correct itself once the real value resolves, not
    // just turn onboarding on and leave it latched.
    if (hasAnyProgress) {
      setShowOnboarding(false);
    } else if (!hasSeenOnboarding()) {
      setShowOnboarding(true);
    }
    setOnboardingAnswers(readOnboardingAnswers());
  }, [hasAnyProgress]);
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

  if (showOnboarding) {
    return (
      <OnboardingQuiz
        onDone={() => {
          setOnboardingAnswers(readOnboardingAnswers());
          setShowOnboarding(false);
        }}
      />
    );
  }

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

      {!hasAnyProgress && onboardingAnswers && (
        <p className="mw-onboarding-greeting">{greetingForGoal(onboardingAnswers.goal)}</p>
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

      {!hasAnyProgress && onboardingAnswers && prefersPracticeFirst(onboardingAnswers.experience) && (
        <Link href="/practice" className="mw-onboarding-practice-link">
          Already know the basics? Jump straight to practice puzzles →
        </Link>
      )}

      {hasAnyProgress || manuallyExpanded ? (
        units.map((unit) => {
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
      })
      ) : (
        <CompactCurriculumPreview
          currentUnit={units[0]}
          nextChapterUnit={units[1]}
          remainingUnits={units.slice(2)}
          nextChapterLockReason={units[1]?.lessons[0] ? unlockReasonFor(units[1].lessons[0]) : null}
          onExpand={() => setManuallyExpanded(true)}
        />
      )}
    </div>
  );
}

function CompactCurriculumPreview({
  currentUnit,
  nextChapterUnit,
  remainingUnits,
  nextChapterLockReason,
  onExpand,
}: {
  currentUnit: UnitWithLessons;
  nextChapterUnit: UnitWithLessons | undefined;
  remainingUnits: UnitWithLessons[];
  nextChapterLockReason: string | null;
  onExpand: () => void;
}) {
  return (
    <div className="mw-curriculum-preview">
      <div className="mw-curriculum-preview-row">
        <span className="mw-curriculum-preview-label">Current chapter</span>
        <span className="mw-curriculum-preview-title">{currentUnit.title}</span>
        <span className="mw-curriculum-preview-detail">
          {currentUnit.lessons.length} lesson{currentUnit.lessons.length === 1 ? "" : "s"} — next milestone: complete
          them all
        </span>
      </div>
      {nextChapterUnit && (
        <div className="mw-curriculum-preview-row mw-curriculum-preview-row--locked">
          <span className="mw-curriculum-preview-label">Next chapter</span>
          <span className="mw-curriculum-preview-title">{nextChapterUnit.title}</span>
          <span className="mw-curriculum-preview-detail">
            🔒 {nextChapterLockReason ?? `Unlocks after "${currentUnit.title}"`}
          </span>
        </div>
      )}
      {remainingUnits.length > 0 && (
        <p className="mw-curriculum-preview-more">
          And {remainingUnits.length} more chapter{remainingUnits.length === 1 ? "" : "s"} ahead:{" "}
          {remainingUnits.map((u) => u.title).join(", ")}.
        </p>
      )}
      <button type="button" className="mw-curriculum-preview-expand" onClick={onExpand}>
        View full curriculum
      </button>
    </div>
  );
}
