import type { ChessExperience, DailyMinutes, LearningGoal } from "./onboarding";

/**
 * P1 "build the Today experience": the homepage's previous job was purely
 * a curriculum map (components/LearningPath.tsx) — a learner had to
 * already know what to do next. This is the missing "what should I do
 * today" answer: a short, ordered plan built from the same real signals
 * already computed elsewhere (lib/lessonStatus.ts's frontier walk,
 * lib/practiceScheduler.ts's ranked concepts, lib/placementEvidence.ts's
 * confirmation gate, Game/GameAnalysis rows) rather than a new, separate
 * personalization system — Today is a *view* over evidence that already
 * exists, never a second source of truth for it.
 *
 * Deliberately pure and fs/DB-free (same testability convention as
 * lib/progressSummary.ts, lib/practiceScheduler.ts) — app/page.tsx does
 * every real query and hands the results here.
 */

export type TodayStepId = "warm-up" | "review" | "learn" | "practice" | "play" | "reflect";

export interface TodayStep {
  id: TodayStepId;
  title: string;
  /** Always present — every recommendation must say why (product requirement), never a bare "Learn" button with no context. */
  reason: string;
  estimatedMinutes: number;
  href: string;
  /** Real evidence only — never a client-only "I clicked it" flag faked to look like progress. See each field's own doc comment on TodayPlanInput for exactly what counts. */
  done: boolean;
  /** A second, real candidate for the same slot — present only when one genuinely exists, so "replace this" never fabricates an alternative. */
  alternate?: { title: string; href: string; reason: string };
}

export interface TodayPlan {
  steps: TodayStep[];
  totalEstimatedMinutes: number;
  doneCount: number;
  /** Every step actually offered today (not just every conceivable step) is done — the end-of-day celebration trigger. False for a learner with zero offered steps (a fully caught-up learner with nothing due) so an empty plan never falsely celebrates. */
  allDone: boolean;
  /** "Clear next-day expectation" — a short preview of what tomorrow's plan will likely lead with, shown once today's plan is cleared. Null when there's genuinely nothing to preview yet (a brand-new learner's very first day). */
  nextUpPreview: string | null;
}

const ESTIMATED_MINUTES: Record<TodayStepId, number> = {
  "warm-up": 3,
  review: 5,
  learn: 7,
  practice: 5,
  play: 15,
  reflect: 5,
};

export interface TodayPlanInput {
  now?: Date;
  minutesBudget: DailyMinutes;
  goal: LearningGoal | null;
  experience: ChessExperience | null;

  /** Any puzzle-sourced ExerciseAttempt today. Warm-up and pool practice share one puzzle-attempt model with no `source` tag distinguishing them (see lib/practiceScheduler.ts's own doc comment on the same limitation) — both the warm-up and practice steps below use this same signal, an honest, documented imprecision rather than a fabricated distinct one. */
  didAnyPuzzlePracticeToday: boolean;
  /** LessonCompletion.completedAt is today, or a confirmation-sourced ExerciseAttempt exists today for the pending-confirmation concept. */
  didLearnToday: boolean;
  /** Game.playedAt is today. */
  didPlayGameToday: boolean;

  /** Concepts with nextRevisionDueAt <= now, from the same lib/practiceScheduler.ts ranking every other practice surface already uses — 0 legitimately means "nothing due", not "not computed yet". */
  reviewDueCount: number;
  topReviewConcept: { principleId: string; title: string; reason: string } | null;

  /** A LessonCheckpoint with stepIndex >= 0 exists — resuming this takes priority over starting something new (resume support). */
  inProgressLesson: { lessonId: string; title: string } | null;
  /** A concept whose evidence still needs confirming (lib/placementEvidence.ts's NEEDS_CONFIRMATION_LEVELS) and hasn't been attempted yet. */
  pendingConfirmation: { principleId: string; conceptTitle: string } | null;
  /** The next lesson lib/lessonStatus.ts's real frontier walk (completions + mastery + demonstrated-concept bypass) says is available — never a naive "first lesson in unit one", so a rated learner's placement evidence already keeps this past basic piece movement. Null once every authored lesson is complete. */
  nextLesson: { lessonId: string; title: string } | null;
  /** A second real frontier candidate (e.g. the next lesson after `nextLesson`, offered as "something else" when a learner would rather not resume the immediate next one) — null when there isn't one. */
  alternateNextLesson: { lessonId: string; title: string } | null;

  /** The highest-ranked concept with an actual puzzle pool (lib/practiceScheduler.ts's rankConceptsForPractice), for the "apply in practice" step — kept distinct from topReviewConcept where possible so the plan doesn't repeat one link under two different steps. */
  topPracticeConcept: { principleId: string; title: string; reason: string } | null;

  /** The most recent analysed game with at least one real mistake (a non-"Best"/"Excellent" classified move) — "reflect on one mistake". No "already reflected" tracking exists (see docs/known-risks.md-style honest scope note in the report), so this is always offered while such a game exists, not marked done. */
  mistakeToReview: { gameId: string; title: string } | null;

  /** No completions, no mastery rows, no placement attempt at all — the very first session, where a short warm-up + single lesson is the whole plan rather than a longer list that would overwhelm a learner who hasn't done anything yet. */
  isBrandNewLearner: boolean;
}

function greetingForGoal(goal: LearningGoal | null): string | null {
  switch (goal) {
    case "from-scratch":
      return "one step at a time";
    case "stop-blundering":
      return "spotting threats before they cost you";
    case "improve-tactics":
      return "sharpening your tactics";
    case "improve-games":
      return "connecting lessons to your own games";
    default:
      return null;
  }
}

/**
 * Builds today's plan: a fixed priority order (warm-up, review, learn,
 * practice, play, reflect), each step included only when it's genuinely
 * applicable (e.g. `review` never appears with nothing due, `reflect`
 * never appears with no analysed mistake to show), then trimmed to fit
 * `minutesBudget` — greedily by priority, always keeping at least the
 * single highest-priority applicable step so the plan is never empty
 * just because a 5-minute budget is smaller than one step's estimate.
 */
export function buildTodayPlan(input: TodayPlanInput): TodayPlan {
  const candidates: TodayStep[] = [];

  candidates.push({
    id: "warm-up",
    title: "Daily warm-up",
    reason: "A couple of quick puzzles to get your eye in before anything harder.",
    estimatedMinutes: ESTIMATED_MINUTES["warm-up"],
    href: "/practice/warm-up",
    done: input.didAnyPuzzlePracticeToday,
  });

  if (input.reviewDueCount > 0 && input.topReviewConcept) {
    candidates.push({
      id: "review",
      title: `Review: ${input.topReviewConcept.title}`,
      reason:
        input.reviewDueCount === 1
          ? input.topReviewConcept.reason
          : `${input.topReviewConcept.reason} — ${input.reviewDueCount - 1} more concept${input.reviewDueCount - 1 === 1 ? "" : "s"} due after this one.`,
      estimatedMinutes: ESTIMATED_MINUTES.review,
      href: `/practice/${input.topReviewConcept.principleId}`,
      done: false,
    });
  }

  if (input.inProgressLesson) {
    candidates.push({
      id: "learn",
      title: `Continue: ${input.inProgressLesson.title}`,
      reason: "Pick up right where you left off.",
      estimatedMinutes: ESTIMATED_MINUTES.learn,
      href: `/learn/${input.inProgressLesson.lessonId}`,
      done: input.didLearnToday,
    });
  } else if (input.pendingConfirmation) {
    candidates.push({
      id: "learn",
      title: `Confirm: ${input.pendingConfirmation.conceptTitle}`,
      reason: "Your placement result unlocked this from an inference — a quick check makes it certain.",
      estimatedMinutes: ESTIMATED_MINUTES.review,
      href: `/practice/confirm/${input.pendingConfirmation.principleId}`,
      done: input.didLearnToday,
    });
  } else if (input.nextLesson) {
    candidates.push({
      id: "learn",
      title: `Learn: ${input.nextLesson.title}`,
      reason: greetingForGoal(input.goal) ? `Next up, ${greetingForGoal(input.goal)}.` : "The next lesson in your path.",
      estimatedMinutes: ESTIMATED_MINUTES.learn,
      href: `/learn/${input.nextLesson.lessonId}`,
      done: input.didLearnToday,
      alternate: input.alternateNextLesson
        ? {
            title: `Learn: ${input.alternateNextLesson.title}`,
            href: `/learn/${input.alternateNextLesson.lessonId}`,
            reason: "A different lesson, if you'd rather not do this one today.",
          }
        : undefined,
    });
  }

  if (!input.isBrandNewLearner && input.topPracticeConcept) {
    candidates.push({
      id: "practice",
      title: `Apply it: ${input.topPracticeConcept.title}`,
      reason: input.topPracticeConcept.reason,
      estimatedMinutes: ESTIMATED_MINUTES.practice,
      href: `/practice/${input.topPracticeConcept.principleId}`,
      done: input.didAnyPuzzlePracticeToday,
    });
  }

  if (!input.isBrandNewLearner) {
    candidates.push({
      id: "play",
      title: "Play a game",
      reason: "Put what you've learned to the test against the engine.",
      estimatedMinutes: ESTIMATED_MINUTES.play,
      href: "/play",
      done: input.didPlayGameToday,
    });
  }

  if (input.mistakeToReview) {
    candidates.push({
      id: "reflect",
      title: `Reflect: ${input.mistakeToReview.title}`,
      reason: "One real mistake from a recent game, worth a second look.",
      estimatedMinutes: ESTIMATED_MINUTES.reflect,
      href: `/review/${input.mistakeToReview.gameId}`,
      done: false,
    });
  }

  const pending = candidates.filter((s) => !s.done);
  let budgetMinutes = input.minutesBudget;
  const steps: TodayStep[] = [];
  for (const step of pending) {
    // The single highest-priority pending step is always included, even if
    // it alone exceeds the budget (never show an empty plan), and a due
    // review is always included regardless of budget — real overdue
    // evidence isn't a nice-to-have a small time budget should hide.
    const forced = steps.length === 0 || step.id === "review";
    if (forced || step.estimatedMinutes <= budgetMinutes) {
      steps.push(step);
      budgetMinutes -= step.estimatedMinutes;
    }
  }
  // Already-done steps still show (with a checkmark) so the day's full
  // picture stays visible, appended after the still-pending ones.
  const doneSteps = candidates.filter((s) => s.done);
  const allSteps = [...steps, ...doneSteps];

  const totalEstimatedMinutes = allSteps.reduce((sum, s) => sum + s.estimatedMinutes, 0);
  const doneCount = allSteps.filter((s) => s.done).length;
  const allDone = allSteps.length > 0 && doneCount === allSteps.length;

  let nextUpPreview: string | null = null;
  if (allDone) {
    const previewSource = input.topReviewConcept ?? input.topPracticeConcept;
    if (previewSource) {
      nextUpPreview = `Tomorrow: ${previewSource.title}.`;
    } else if (input.nextLesson) {
      nextUpPreview = `Tomorrow: ${input.nextLesson.title}.`;
    } else {
      nextUpPreview = "Tomorrow: a fresh warm-up, whenever you're ready.";
    }
  }

  return { steps: allSteps, totalEstimatedMinutes, doneCount, allDone, nextUpPreview };
}
