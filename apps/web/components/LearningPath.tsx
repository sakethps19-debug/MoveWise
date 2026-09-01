"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Lesson, Principle } from "@movewise/exercise-schema";
import { starsForPerformance } from "../lib/mastery";
import type { MasteryStatus } from "../lib/masteryModel";
import {
  statusOf,
  unlockReason,
  demonstratedLessonIdsFrom,
  unitFullyDemonstrated as lessonStatusUnitFullyDemonstrated,
} from "../lib/lessonStatus";
import { useEffectiveCompletions, type CompletionRecord } from "../lib/useEffectiveCompletions";
import { useDemonstratedConcepts } from "../lib/useDemonstratedConcepts";
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
  // Real evidence (a placement assessment, or ordinary proficiency earned
  // from practice) that bypasses lesson prerequisites and the principle-
  // proficiency gate without ever marking a lesson "completed" — see
  // lib/lessonStatus.ts's statusOf doc comment. Guest-only data is read
  // client-side after mount (lib/useDemonstratedConcepts.ts).
  const demonstratedConceptIds = useDemonstratedConcepts(conceptMastery);
  // A true first-time visit: nothing completed, no lesson even started,
  // and no real server-tracked mastery signal either (a UserConceptMastery
  // row means real attempts already happened — e.g. a struggling concept
  // flagged from puzzle/game attempts with no lesson ever fully
  // completed — so it counts as real engagement too, not "fresh"). This
  // is the exact case "confronted with ~20 disabled cards immediately"
  // described. A returning learner (any real progress at all) always
  // sees the full syllabus; only a genuinely fresh one gets the
  // collapsed preview and the onboarding quiz below. A completed
  // placement assessment counts too — it's real, evidence-based
  // engagement, not a fresh, untouched account.
  const hasAnyProgress =
    (completedIds?.size ?? 0) > 0 ||
    startedIds.size > 0 ||
    (conceptMastery?.size ?? 0) > 0 ||
    demonstratedConceptIds.size > 0;

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
      demonstratedConceptIds,
    );
  const unlockReasonFor = (lesson: Lesson) =>
    unlockReason(
      lesson,
      completedIds,
      allLessonsById,
      allPrinciplesById,
      units.find((u) => u.id === lesson.unitId)?.principles ?? [],
      hasConceptMasteryTracking,
      demonstratedConceptIds,
    );
  const demonstratedLessonIds = demonstratedLessonIdsFrom(allPrinciplesById, demonstratedConceptIds);
  // Real, confirmed bug an earlier version of this check produced: a
  // lesson whose sibling (same principle) was just completed with a
  // strong run can land in `demonstratedLessonIds` too, purely because
  // completing the sibling pushed their *shared* principle's concept to
  // a proficient `status` — real evidence, but not evidence this lesson's
  // OWN reachability actually depends on (its ordinary `prerequisites`
  // chain already covers it once the sibling is done). Labeling that
  // "Demonstrated" was misleading — a genuinely evidence-bypassed lesson
  // is one that would be LOCKED without `demonstratedConceptIds` at all,
  // not merely one that also happens to be covered by it.
  const isGenuinelyDemonstratedFor = (lesson: Lesson) =>
    statusFor(lesson) !== "locked" &&
    statusOf(
      lesson,
      completedIds,
      allPrinciplesById,
      units.find((u) => u.id === lesson.unitId)?.principles ?? [],
      conceptMastery,
      undefined,
    ) === "locked";
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
  // The real fix for the "brutal user journey" bug: a rated player whose
  // placement demonstrated meet-the-pieces/check-and-checkmate must not
  // land on "Welcome to the chessboard" just because it's first in array
  // order and technically "available" once bypassed. `isPassed` treats a
  // demonstrated-bypass exactly like a completion for the purpose of
  // finding the learner's real frontier — the lesson itself still
  // *displays* as "available", never "completed" (see displayStatusFor),
  // this only changes which one `nextUp` recommends first. A learner
  // whose placement covered the entire curriculum gets no `nextUp` at all
  // (handled below by the "tested out" card) rather than a stale first
  // lesson.
  // A unit's own mastery-challenge lesson (e.g. meet-the-pieces' lesson 12)
  // belongs to no principle's subLessonIds at all, so demonstratedLessonIds
  // never covers it directly even when every principle in its unit was
  // demonstrated — without this, it was the one lesson left un-bypassed,
  // so a learner who tested out of an entire unit still got recommended
  // its mastery-challenge as `nextUp` instead of moving on. The actual
  // "every principle demonstrated" rule lives in lib/lessonStatus.ts's
  // `unitFullyDemonstrated` — the same function app/learn/[lessonId]/
  // page.tsx's server-side route guard now calls too, so this recommendation
  // and that guard can never again disagree the way they did before (a
  // recommended lesson that the server then rejected as locked).
  const unitFullyDemonstrated = (unitId: string) =>
    lessonStatusUnitFullyDemonstrated(units.find((u) => u.id === unitId)?.principles ?? [], demonstratedConceptIds);
  const isPassed = (l: Lesson) =>
    (completedIds?.has(l.id) ?? false) ||
    demonstratedLessonIds.has(l.id) ||
    (l.kind === "mastery-challenge" && unitFullyDemonstrated(l.unitId));
  const nextUp = allLessons.find((l) => !isPassed(l) && statusFor(l) === "available");
  const testedOutOfEverything = !nextUp && demonstratedConceptIds.size > 0 && allLessons.every(isPassed);

  // Real, reproduced defect this fixes: `hasAnyProgress` above answers
  // "has this learner touched anything at all" — true the instant a
  // single lesson is finished — but was also being used to decide
  // whether to blow past the compact "Today" preview (below) straight
  // into the full ~33-lesson curriculum map. A brand-new learner who
  // commits five minutes a day, finishes lesson 1, and reloads the
  // homepage got dumped into a wall of locked cards instead of the same
  // helpful compact plan they'd seen a minute earlier — exactly the
  // reported defect. The curriculum map earns its place once a learner
  // has cleared a real, promised milestone: the compact preview's own
  // "Current chapter — N lessons — next milestone: complete them all"
  // copy already names it. A placement result that demonstrates real
  // prior knowledge (never the "learn from scratch" persona this bug
  // targets) still expands immediately, same as before.
  const hasCompletedFirstUnit = (units[0]?.lessons.length ?? 0) > 0 && (units[0]?.lessons.every((l) => isPassed(l)) ?? false);
  const readyForFullCurriculum = hasCompletedFirstUnit || demonstratedConceptIds.size > 0;

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

      {testedOutOfEverything && (
        <Link href="/practice" className="mw-continue-card">
          <div className="mw-continue-eyebrow">Placement result: strong</div>
          <div className="mw-continue-title">Your placement cleared the guided lessons — head to Practice</div>
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

      {readyForFullCurriculum || manuallyExpanded ? (
        units.map((unit) => {
        const completedInUnit = unit.lessons.filter((l) => statusFor(l) === "completed").length;
        // Real, confirmed gap this closes: a rated learner whose placement
        // bypassed most of a unit still saw a bare "0 / 13" here, with
        // nothing distinguishing "untouched" from "already demonstrated,
        // just never literally completed" — the exact confusion a large
        // bypassed section with no explanation produces. Deliberately
        // NOT `isPassed` (defined above, driving `nextUp`/
        // `testedOutOfEverything`) — `isPassed` also treats a lesson as
        // "passed" when its own sibling's completion happened to push
        // their *shared* principle to proficient, which is real evidence
        // but not evidence this lesson's own reachability needed (its
        // ordinary prerequisite chain already covers it). Counting that
        // as "demonstrated" here produced a real, reproduced bug: the
        // very next lesson after a strong first lesson got labeled
        // "Demonstrated" for no reason a learner could see. This count
        // only credits a lesson that would be LOCKED without the
        // evidence — see `isGenuinelyDemonstratedFor`'s own doc comment.
        const demonstratedInUnit = unit.lessons.filter(
          (l) => statusFor(l) !== "completed" && isGenuinelyDemonstratedFor(l),
        ).length;

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
                  {demonstratedInUnit > 0 && (
                    <span className="mw-unit-count-demonstrated"> · {demonstratedInUnit} demonstrated</span>
                  )}
                </span>
              )}
            </div>
            <div className="mw-unit-progress">
              <ProgressBar
                value={completedInUnit}
                max={unit.lessons.length}
                secondaryValue={demonstratedInUnit > 0 ? completedInUnit + demonstratedInUnit : undefined}
                label={`${unit.title} progress`}
              />
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

                      // Real, confirmed gap this closes: a lesson reachable
                      // purely from placement/practice evidence (never
                      // literally completed) rendered identically to any
                      // other "available" lesson — same plain ▶, no
                      // indication *why* it was already open. Paired with
                      // the "0/N completed" unit count below (which never
                      // explained a large bypassed section either), a rated
                      // learner's own curriculum looked untouched even
                      // after their placement result unlocked most of it.
                      // Distinct only when genuinely evidence-based — never
                      // for a lesson that's simply first-in-sequence and
                      // unlocked with no work done yet, and never for a
                      // lesson whose own ordinary prerequisite chain
                      // already covers it (see `isGenuinelyDemonstratedFor`'s
                      // own doc comment for the real, reproduced bug a
                      // looser `demonstratedLessonIds.has()` check caused:
                      // completing lesson 1 of a principle can itself push
                      // that principle's concept to proficient, wrongly
                      // labeling lesson 2 — its own ordinary next lesson —
                      // "Demonstrated" too).
                      const isDemonstrated = status === "available" && !record && isGenuinelyDemonstratedFor(lesson);

                      const icon =
                        status === "locked"
                          ? "🔒"
                          : status === "in-progress"
                            ? "◐"
                            : status === "mastered"
                              ? "✓"
                              : status === "completed"
                                ? "✓"
                                : isDemonstrated
                                  ? "◆"
                                  : "▶";

                      const row = (
                        <div
                          className={`mw-lesson-node mw-lesson-node--${status}${isDemonstrated ? " mw-lesson-node--demonstrated" : ""}`}
                        >
                          <span className="mw-lesson-node-icon" aria-hidden="true">
                            {icon}
                          </span>
                          <span className="mw-lesson-node-body">
                            <span className="mw-lesson-node-title">{lesson.title}</span>
                            {reason && <span className="mw-lesson-node-reason">{reason}</span>}
                            {status === "in-progress" && <span className="mw-lesson-node-reason">In progress</span>}
                            {isDemonstrated && (
                              <span className="mw-lesson-node-reason">Open from your placement result — not yet completed</span>
                            )}
                          </span>
                          {status === "mastered" && <span className="mw-badge mw-badge--success">Mastered</span>}
                          {isDemonstrated && <span className="mw-badge mw-badge--info">Demonstrated</span>}
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
                      const allSubLessonsDone = group.lessons.every(
                        (l) => statusFor(l) === "completed" || demonstratedLessonIds.has(l.id),
                      );
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
