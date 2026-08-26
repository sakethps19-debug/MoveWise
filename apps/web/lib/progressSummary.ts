/**
 * Pure computation behind `/progress` (the real dashboard replacing the
 * Nav's old "Progress — Soon" placeholder). Kept fs/DB-free and pure —
 * same "testable without a database" convention as lib/masteryModel.ts —
 * so app/progress/page.tsx only has to fetch rows and hand them here.
 */
import type { MasteryStatus } from "./masteryModel";

export interface UnitProgress {
  unitId: string;
  title: string;
  completed: number;
  total: number;
}

export interface ReviewItem {
  conceptId: string;
  title: string;
  status: MasteryStatus;
  /** The principle /review/[principleId] needs to render a reteach — null when this concept has no authored principle yet (e.g. a detected-but-uncurated concept). */
  principleId: string | null;
}

export interface MistakeCategoryCount {
  conceptId: string;
  title: string;
  count: number;
}

export interface ProgressSummary {
  lessonsCompleted: number;
  totalLessons: number;
  units: UnitProgress[];
  xp: number;
  streakDays: number;
  masteryByStatus: Record<MasteryStatus, number>;
  reviewDue: ReviewItem[];
  recentlyImproved: ReviewItem[];
  practiceAccuracy: { correct: number; total: number } | null;
  gamesPlayed: number;
  mistakesByCategory: MistakeCategoryCount[];
}

const REVIEW_DUE_STATUSES: ReadonlySet<MasteryStatus> = new Set(["struggling", "revision-due"]);
const IMPROVED_STATUSES: ReadonlySet<MasteryStatus> = new Set(["proficient", "mastered", "recovered"]);

/**
 * Consecutive-day streak ending today or yesterday — a day with no
 * activity anywhere in the streak breaks it, same rule as every
 * habit-tracking app uses. `activityDates` need not be sorted or deduped;
 * only the calendar date (not the time) matters.
 */
export function computeStreak(activityDates: Date[], now: Date = new Date()): number {
  const days = new Set(activityDates.map((d) => d.toISOString().slice(0, 10)));
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);

  // The streak can still be "alive" if today has no activity yet but
  // yesterday does — it just hasn't been extended today.
  const cursor = new Date(today);
  if (!days.has(cursor.toISOString().slice(0, 10))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  let streak = 0;
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export function buildProgressSummary(input: {
  totalLessons: number;
  unitLessonCounts: { unitId: string; title: string; total: number }[];
  completions: { lessonId: string; unitId: string; xpEarned: number; completedAt: Date }[];
  mastery: { conceptId: string; status: MasteryStatus; lastPracticedAt: Date | null }[];
  conceptTitleById: Record<string, string>;
  conceptToPrincipleId?: Record<string, string>;
  practiceAttempts: { correct: boolean }[];
  gamesPlayed: number;
  mistakes: { conceptIds: string[] }[];
  now?: Date;
}): ProgressSummary {
  const completedByUnit = new Map<string, number>();
  for (const c of input.completions) {
    completedByUnit.set(c.unitId, (completedByUnit.get(c.unitId) ?? 0) + 1);
  }
  const units: UnitProgress[] = input.unitLessonCounts.map((u) => ({
    unitId: u.unitId,
    title: u.title,
    completed: completedByUnit.get(u.unitId) ?? 0,
    total: u.total,
  }));

  const masteryByStatus: Record<MasteryStatus, number> = {
    "not-started": 0,
    learning: 0,
    practising: 0,
    "ready-for-assessment": 0,
    proficient: 0,
    mastered: 0,
    "revision-due": 0,
    struggling: 0,
    recovered: 0,
  };
  for (const m of input.mastery) masteryByStatus[m.status]++;

  const toReviewItem = (m: { conceptId: string; status: MasteryStatus }): ReviewItem => ({
    conceptId: m.conceptId,
    title: input.conceptTitleById[m.conceptId] ?? m.conceptId,
    status: m.status,
    principleId: input.conceptToPrincipleId?.[m.conceptId] ?? null,
  });

  const reviewDue: ReviewItem[] = input.mastery.filter((m) => REVIEW_DUE_STATUSES.has(m.status)).map(toReviewItem);

  const recentlyImproved: ReviewItem[] = input.mastery
    .filter((m) => IMPROVED_STATUSES.has(m.status) && m.lastPracticedAt !== null)
    .sort((a, b) => (b.lastPracticedAt as Date).getTime() - (a.lastPracticedAt as Date).getTime())
    .slice(0, 5)
    .map(toReviewItem);

  const mistakeCounts = new Map<string, number>();
  for (const move of input.mistakes) {
    for (const conceptId of move.conceptIds) {
      mistakeCounts.set(conceptId, (mistakeCounts.get(conceptId) ?? 0) + 1);
    }
  }
  const mistakesByCategory: MistakeCategoryCount[] = [...mistakeCounts.entries()]
    .map(([conceptId, count]) => ({ conceptId, title: input.conceptTitleById[conceptId] ?? conceptId, count }))
    .sort((a, b) => b.count - a.count);

  return {
    lessonsCompleted: input.completions.length,
    totalLessons: input.totalLessons,
    units,
    xp: input.completions.reduce((sum, c) => sum + c.xpEarned, 0),
    streakDays: computeStreak(
      input.completions.map((c) => c.completedAt),
      input.now,
    ),
    masteryByStatus,
    reviewDue,
    recentlyImproved,
    practiceAccuracy:
      input.practiceAttempts.length === 0
        ? null
        : { correct: input.practiceAttempts.filter((a) => a.correct).length, total: input.practiceAttempts.length },
    gamesPlayed: input.gamesPlayed,
    mistakesByCategory,
  };
}

/**
 * The single "what should I do next" recommendation the dashboard leads
 * with — first a due review (a struggling concept is more urgent than
 * new content), otherwise the next lesson in a unit that isn't yet
 * complete, otherwise a "nothing urgent" state for a learner who's
 * genuinely caught up.
 */
export function recommendNextAction(
  summary: Pick<ProgressSummary, "reviewDue" | "units">,
  nextLessonTitle: string | null,
): { kind: "review"; label: string; principleId: string } | { kind: "lesson"; label: string } | { kind: "none" } {
  // A review item with no authored principle yet can't be reviewed
  // anywhere real (see ReviewItem.principleId) — skip it as a
  // recommendation rather than link somewhere broken.
  const reviewable = summary.reviewDue.find((item) => item.principleId !== null);
  if (reviewable) {
    return { kind: "review", label: `Review "${reviewable.title}"`, principleId: reviewable.principleId! };
  }
  if (nextLessonTitle) {
    return { kind: "lesson", label: `Continue with "${nextLessonTitle}"` };
  }
  return { kind: "none" };
}
