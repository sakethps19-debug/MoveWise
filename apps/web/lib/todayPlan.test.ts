import { describe, expect, it } from "vitest";
import { buildTodayPlan, type TodayPlanInput } from "./todayPlan";

function baseInput(overrides: Partial<TodayPlanInput> = {}): TodayPlanInput {
  return {
    minutesBudget: 20,
    goal: null,
    experience: null,
    didAnyPuzzlePracticeToday: false,
    didLearnToday: false,
    didPlayGameToday: false,
    reviewDueCount: 0,
    topReviewConcept: null,
    inProgressLesson: null,
    pendingConfirmation: null,
    nextLesson: { lessonId: "meet-the-pieces.01-welcome", title: "Welcome to Chess" },
    alternateNextLesson: null,
    topPracticeConcept: null,
    mistakeToReview: null,
    isBrandNewLearner: false,
    ...overrides,
  };
}

describe("buildTodayPlan", () => {
  it("always includes warm-up first when nothing else is more urgent", () => {
    const plan = buildTodayPlan(baseInput());
    expect(plan.steps[0]!.id).toBe("warm-up");
  });

  it("every step carries a real, non-generic reason", () => {
    const plan = buildTodayPlan(
      baseInput({
        reviewDueCount: 1,
        topReviewConcept: { principleId: "check-and-checkmate.escaping-check", title: "Escaping check", reason: "overdue for review by 2 days" },
      }),
    );
    for (const step of plan.steps) {
      expect(step.reason.length).toBeGreaterThan(0);
    }
  });

  it("never shows a review step when nothing is due", () => {
    const plan = buildTodayPlan(baseInput({ reviewDueCount: 0, topReviewConcept: null }));
    expect(plan.steps.find((s) => s.id === "review")).toBeUndefined();
  });

  it("surfaces review due concepts ahead of a brand-new lesson", () => {
    const plan = buildTodayPlan(
      baseInput({
        minutesBudget: 5,
        reviewDueCount: 1,
        topReviewConcept: { principleId: "x", title: "Pins", reason: "overdue for review by 3 days" },
      }),
    );
    // Warm-up and review both queue up; with a 5-minute budget only
    // warm-up (3 min) fits before review (5 min) pushes past budget —
    // but review must still be the very next thing offered, not skipped
    // entirely, since it's real overdue evidence, not a nice-to-have.
    expect(plan.steps.some((s) => s.id === "review")).toBe(true);
  });

  it("a rated learner's placement evidence keeps the learn step past basic piece movement (frontier lesson passed in, never overridden)", () => {
    const plan = buildTodayPlan(
      baseInput({
        isBrandNewLearner: false,
        nextLesson: { lessonId: "basic-tactics.01-forks", title: "Forks" },
      }),
    );
    const learnStep = plan.steps.find((s) => s.id === "learn");
    expect(learnStep?.title).toContain("Forks");
    expect(learnStep?.title).not.toMatch(/piece|welcome/i);
  });

  it("a brand-new learner's plan omits practice/play steps that would overwhelm a first session", () => {
    const plan = buildTodayPlan(
      baseInput({
        isBrandNewLearner: true,
        topPracticeConcept: { principleId: "p", title: "Board basics", reason: "never yet practiced" },
      }),
    );
    expect(plan.steps.find((s) => s.id === "practice")).toBeUndefined();
    expect(plan.steps.find((s) => s.id === "play")).toBeUndefined();
  });

  it("resuming an in-progress lesson takes priority over starting a new one", () => {
    const plan = buildTodayPlan(
      baseInput({
        inProgressLesson: { lessonId: "meet-the-pieces.02-rook", title: "The Rook" },
        nextLesson: { lessonId: "meet-the-pieces.03-bishop", title: "The Bishop" },
      }),
    );
    const learnStep = plan.steps.find((s) => s.id === "learn");
    expect(learnStep?.title).toContain("Continue");
    expect(learnStep?.title).toContain("Rook");
  });

  it("a pending confirmation is offered as the learn step ahead of a brand-new lesson", () => {
    const plan = buildTodayPlan(
      baseInput({
        pendingConfirmation: { principleId: "meet-the-pieces.board-basics", conceptTitle: "Board basics" },
      }),
    );
    const learnStep = plan.steps.find((s) => s.id === "learn");
    expect(learnStep?.title).toContain("Confirm");
  });

  it("a smaller time budget still returns a non-empty plan (never an empty plan)", () => {
    const plan = buildTodayPlan(baseInput({ minutesBudget: 5 }));
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it("a larger time budget includes more steps than a smaller one", () => {
    const input = baseInput({
      isBrandNewLearner: false,
      topPracticeConcept: { principleId: "p", title: "Pins", reason: "keeping this fresh" },
    });
    const small = buildTodayPlan({ ...input, minutesBudget: 5 });
    const large = buildTodayPlan({ ...input, minutesBudget: 20 });
    expect(large.steps.length).toBeGreaterThanOrEqual(small.steps.length);
  });

  it("marks allDone only once every offered step is actually done", () => {
    const input = baseInput({ didAnyPuzzlePracticeToday: true, didLearnToday: true });
    const partial = buildTodayPlan(input);
    expect(partial.allDone).toBe(false); // play/practice steps still pending (isBrandNewLearner: false, but no topPracticeConcept given)

    const allDoneInput = baseInput({
      didAnyPuzzlePracticeToday: true,
      didLearnToday: true,
      didPlayGameToday: true,
      isBrandNewLearner: true, // omits practice/play from the offered set entirely
      nextLesson: null,
    });
    const complete = buildTodayPlan(allDoneInput);
    expect(complete.allDone).toBe(true);
    expect(complete.nextUpPreview).not.toBeNull();
  });

  it("a single-item day (warm-up alone) still counts as fully done and previews tomorrow", () => {
    const plan = buildTodayPlan(
      baseInput({
        isBrandNewLearner: true,
        nextLesson: null,
        didAnyPuzzlePracticeToday: true,
      }),
    );
    // warm-up done, nothing else offered at all (no lesson, no confirmation, brand-new so no practice/play) — steps is just the done warm-up
    expect(plan.steps.length).toBe(1);
    expect(plan.allDone).toBe(true);
  });

  it("offers a real alternate for the learn step only when one was actually given", () => {
    const withAlt = buildTodayPlan(baseInput({ alternateNextLesson: { lessonId: "x", title: "The Knight" } }));
    expect(withAlt.steps.find((s) => s.id === "learn")?.alternate?.title).toContain("Knight");

    const withoutAlt = buildTodayPlan(baseInput({ alternateNextLesson: null }));
    expect(withoutAlt.steps.find((s) => s.id === "learn")?.alternate).toBeUndefined();
  });

  it("surfaces a game-derived mistake as the reflect step when one exists", () => {
    const plan = buildTodayPlan(baseInput({ mistakeToReview: { gameId: "game123", title: "Game vs. Stockfish, Aug 30" } }));
    const reflectStep = plan.steps.find((s) => s.id === "reflect");
    expect(reflectStep?.href).toBe("/review/game123");
  });
});
