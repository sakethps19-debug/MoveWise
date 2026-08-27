import { describe, expect, it } from "vitest";
import { buildProgressSummary, computeStreak, recommendNextAction } from "./progressSummary";

describe("computeStreak", () => {
  const NOW = new Date("2026-08-26T12:00:00Z");

  it("is 0 with no activity", () => {
    expect(computeStreak([], NOW)).toBe(0);
  });

  it("counts a single day of activity today as a 1-day streak", () => {
    expect(computeStreak([new Date("2026-08-26T08:00:00Z")], NOW)).toBe(1);
  });

  it("counts 3 consecutive days ending today", () => {
    const dates = [
      new Date("2026-08-24T08:00:00Z"),
      new Date("2026-08-25T08:00:00Z"),
      new Date("2026-08-26T08:00:00Z"),
    ];
    expect(computeStreak(dates, NOW)).toBe(3);
  });

  it("still counts the streak as alive if yesterday had activity but today doesn't yet", () => {
    const dates = [new Date("2026-08-24T08:00:00Z"), new Date("2026-08-25T08:00:00Z")];
    expect(computeStreak(dates, NOW)).toBe(2);
  });

  it("breaks the streak on a gap day", () => {
    const dates = [new Date("2026-08-20T08:00:00Z"), new Date("2026-08-26T08:00:00Z")];
    expect(computeStreak(dates, NOW)).toBe(1);
  });

  it("does not double-count multiple completions on the same day", () => {
    const dates = [new Date("2026-08-26T01:00:00Z"), new Date("2026-08-26T23:00:00Z")];
    expect(computeStreak(dates, NOW)).toBe(1);
  });
});

describe("buildProgressSummary", () => {
  it("computes lessons-completed, XP, and per-unit progress", () => {
    const summary = buildProgressSummary({
      totalLessons: 5,
      unitLessonCounts: [
        { unitId: "meet-the-pieces", title: "Meet the Pieces", total: 3 },
        { unitId: "check-and-checkmate", title: "Check and Checkmate Basics", total: 2 },
      ],
      completions: [
        { lessonId: "meet-the-pieces.01", unitId: "meet-the-pieces", xpEarned: 15, completedAt: new Date("2026-08-25") },
        { lessonId: "meet-the-pieces.02", unitId: "meet-the-pieces", xpEarned: 15, completedAt: new Date("2026-08-26") },
      ],
      mastery: [],
      conceptTitleById: {},
      practiceAttempts: [],
      gamesPlayed: 0,
      mistakes: [],
      now: new Date("2026-08-26T12:00:00Z"),
    });

    expect(summary.lessonsCompleted).toBe(2);
    expect(summary.totalLessons).toBe(5);
    expect(summary.xp).toBe(30);
    expect(summary.units).toEqual([
      { unitId: "meet-the-pieces", title: "Meet the Pieces", completed: 2, total: 3 },
      { unitId: "check-and-checkmate", title: "Check and Checkmate Basics", completed: 0, total: 2 },
    ]);
    expect(summary.streakDays).toBe(2);
  });

  it("separates review-due concepts from recently-improved ones, and never both", () => {
    const summary = buildProgressSummary({
      totalLessons: 0,
      unitLessonCounts: [],
      completions: [],
      mastery: [
        { conceptId: "rook-movement", status: "struggling", lastPracticedAt: new Date("2026-08-20") },
        { conceptId: "bishop-movement", status: "proficient", lastPracticedAt: new Date("2026-08-25") },
        { conceptId: "queen-movement", status: "not-started", lastPracticedAt: null },
      ],
      conceptTitleById: { "rook-movement": "The rook", "bishop-movement": "The bishop" },
      practiceAttempts: [],
      gamesPlayed: 0,
      mistakes: [],
    });

    expect(summary.reviewDue).toEqual([
      { conceptId: "rook-movement", title: "The rook", status: "struggling", principleId: null },
    ]);
    expect(summary.recentlyImproved).toEqual([
      { conceptId: "bishop-movement", title: "The bishop", status: "proficient", principleId: null },
    ]);
  });

  it("computes practice accuracy, or null when nothing has been attempted yet", () => {
    const withAttempts = buildProgressSummary({
      totalLessons: 0,
      unitLessonCounts: [],
      completions: [],
      mastery: [],
      conceptTitleById: {},
      practiceAttempts: [{ correct: true }, { correct: true }, { correct: false }],
      gamesPlayed: 0,
      mistakes: [],
    });
    expect(withAttempts.practiceAccuracy).toEqual({ correct: 2, total: 3 });

    const noAttempts = buildProgressSummary({
      totalLessons: 0,
      unitLessonCounts: [],
      completions: [],
      mastery: [],
      conceptTitleById: {},
      practiceAttempts: [],
      gamesPlayed: 0,
      mistakes: [],
    });
    expect(noAttempts.practiceAccuracy).toBeNull();
  });

  it("ranks analysed-game mistakes by category, most frequent first", () => {
    const summary = buildProgressSummary({
      totalLessons: 0,
      unitLessonCounts: [],
      completions: [],
      mastery: [],
      conceptTitleById: { "hanging-pieces": "Hanging pieces" },
      practiceAttempts: [],
      gamesPlayed: 2,
      mistakes: [{ conceptIds: ["hanging-pieces"] }, { conceptIds: ["hanging-pieces"] }, { conceptIds: ["knight-fork"] }],
    });
    expect(summary.mistakesByCategory[0]).toEqual({ conceptId: "hanging-pieces", title: "Hanging pieces", count: 2 });
    expect(summary.gamesPlayed).toBe(2);
  });
});

describe("recommendNextAction", () => {
  it("prioritises a due review over the next lesson", () => {
    const result = recommendNextAction(
      {
        reviewDue: [
          { conceptId: "rook-movement", title: "The rook", status: "struggling", principleId: "meet-the-pieces.the-rook" },
        ],
        units: [],
      },
      "Meet the bishop",
    );
    expect(result).toEqual({ kind: "review", label: 'Review "The rook"', principleId: "meet-the-pieces.the-rook" });
  });

  it("skips a due-review concept that has no authored principle to review yet, falling back to the next lesson", () => {
    const result = recommendNextAction(
      { reviewDue: [{ conceptId: "trade-evaluation", title: "Trade evaluation", status: "struggling", principleId: null }], units: [] },
      "Meet the bishop",
    );
    expect(result).toEqual({ kind: "lesson", label: 'Continue with "Meet the bishop"' });
  });

  it("falls back to the next lesson when nothing is due for review", () => {
    const result = recommendNextAction({ reviewDue: [], units: [] }, "Meet the bishop");
    expect(result).toEqual({ kind: "lesson", label: 'Continue with "Meet the bishop"' });
  });

  it("reports 'none' when there is genuinely nothing to recommend", () => {
    const result = recommendNextAction({ reviewDue: [], units: [] }, null);
    expect(result).toEqual({ kind: "none" });
  });
});
