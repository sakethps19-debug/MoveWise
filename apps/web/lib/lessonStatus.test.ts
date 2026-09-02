import { describe, expect, it } from "vitest";
import type { Lesson, Principle } from "@movewise/exercise-schema";
import { statusOf, unlockReason, unitFullyDemonstrated } from "./lessonStatus";

function makeLesson(overrides: Partial<Lesson> & Pick<Lesson, "id">): Lesson {
  return {
    version: 1,
    unitId: "meet-the-pieces",
    title: overrides.id,
    objectives: ["objective"],
    prerequisites: [],
    steps: [{ type: "explain", body: "x" }] as unknown as Lesson["steps"],
    xpReward: 10,
    masteryTags: ["rook-movement"],
    difficulty: 1,
    estimatedDurationSec: 60,
    ...overrides,
  };
}

function makePrinciple(overrides: Partial<Principle> & Pick<Principle, "id" | "conceptId" | "subLessonIds">): Principle {
  return {
    unitId: "meet-the-pieces",
    title: overrides.id,
    order: 0,
    puzzleIds: [],
    ...overrides,
  };
}

/**
 * Regression coverage for the P0 "brutal user journey" bug: a rated
 * learner's real placement result must be able to unlock a lesson's
 * prerequisites (and the principle-proficiency gate ahead of the *next*
 * principle) purely from demonstrated concept ids — without a single
 * lesson ever being marked "completed", and without needing a signed-in
 * conceptMastery Map at all (the exact guest case PracticeHub/LearningPath
 * hit first).
 */
describe("statusOf demonstratedConceptIds bypass", () => {
  const welcome = makeLesson({ id: "meet-the-pieces.01-welcome", principleId: "meet-the-pieces.board-basics" });
  const rookIntro = makeLesson({
    id: "meet-the-pieces.03-meet-the-rook",
    principleId: "meet-the-pieces.rook",
    prerequisites: ["meet-the-pieces.01-welcome", "meet-the-pieces.02-ranks-files-squares"],
  });
  const boardBasics = makePrinciple({
    id: "meet-the-pieces.board-basics",
    conceptId: "board-orientation",
    subLessonIds: ["meet-the-pieces.01-welcome", "meet-the-pieces.02-ranks-files-squares"],
  });
  const rookPrinciple = makePrinciple({
    id: "meet-the-pieces.rook",
    conceptId: "rook-movement",
    subLessonIds: ["meet-the-pieces.03-meet-the-rook", "meet-the-pieces.04-rook-captures"],
  });
  const principlesById = new Map([
    [boardBasics.id, boardBasics],
    [rookPrinciple.id, rookPrinciple],
  ]);
  const principlesInOrder = [boardBasics, rookPrinciple];

  it("without a placement result, a rated player with zero completions is locked out of the rook lesson by its prerequisites (the bug)", () => {
    const status = statusOf(rookIntro, new Set(), principlesById, principlesInOrder, null);
    expect(status).toBe("locked");
  });

  it("a placement result demonstrating board-orientation unlocks the rook lesson's prerequisites without marking welcome/ranks-files-squares completed", () => {
    const demonstratedConceptIds = new Set(["board-orientation"]);
    const status = statusOf(rookIntro, new Set(), principlesById, principlesInOrder, null, demonstratedConceptIds);
    expect(status).toBe("available");

    // The bypassed lessons themselves are "available", never "completed" —
    // this is evidence-based unlocking, not a false completion.
    expect(statusOf(welcome, new Set(), principlesById, principlesInOrder, null, demonstratedConceptIds)).toBe(
      "available",
    );
  });

  it("does not unlock a lesson whose prerequisite concept was not demonstrated", () => {
    const demonstratedConceptIds = new Set(["knight-movement"]); // unrelated concept
    const status = statusOf(rookIntro, new Set(), principlesById, principlesInOrder, null, demonstratedConceptIds);
    expect(status).toBe("locked");
  });

  it("bypasses the principle-proficiency gate (first sub-lesson of the next principle) for a signed-in learner with no real UserConceptMastery rows yet", () => {
    const conceptMastery = new Map(); // signed in, but no rows — would otherwise lock the gate
    const demonstratedConceptIds = new Set(["board-orientation"]);
    const rookFirstSubLesson = makeLesson({
      id: "meet-the-pieces.03-meet-the-rook",
      principleId: "meet-the-pieces.rook",
      prerequisites: [],
    });
    expect(statusOf(rookFirstSubLesson, new Set(), principlesById, principlesInOrder, conceptMastery)).toBe("locked");
    expect(
      statusOf(rookFirstSubLesson, new Set(), principlesById, principlesInOrder, conceptMastery, demonstratedConceptIds),
    ).toBe("available");
  });

  it("unlockReason omits the locked-prerequisite text once its concept is demonstrated", () => {
    const lessonsById = new Map([[welcome.id, welcome], [rookIntro.id, rookIntro]]);
    const withoutPlacement = unlockReason(rookIntro, new Set(), lessonsById, principlesById, principlesInOrder, false);
    expect(withoutPlacement).toMatch(/Unlocks after/);

    const withPlacement = unlockReason(
      rookIntro,
      new Set(),
      lessonsById,
      principlesById,
      principlesInOrder,
      false,
      new Set(["board-orientation"]),
    );
    expect(withPlacement).toBeNull();
  });
});

/**
 * Curriculum-availability invariant: this is the single rule both
 * LearningPath.tsx (client, "which lesson is nextUp") and
 * app/learn/[lessonId]/page.tsx (server, the route guard a mastery-
 * challenge lesson's cross-unit prerequisite hits) must apply — real,
 * confirmed bug this guards against: before this function was extracted
 * and shared, the server side had no equivalent check at all, so a
 * learner whose placement demonstrated every concept in a unit still got
 * redirected as locked from that unit's own mastery-challenge lesson.
 */
describe("unitFullyDemonstrated", () => {
  const principles = [
    makePrinciple({ id: "u.a", conceptId: "concept-a", subLessonIds: ["a1"] }),
    makePrinciple({ id: "u.b", conceptId: "concept-b", subLessonIds: ["b1"] }),
    makePrinciple({ id: "u.c", conceptId: "concept-c", subLessonIds: ["c1"] }),
  ];

  it("is true only when every principle in the unit is demonstrated", () => {
    expect(unitFullyDemonstrated(principles, new Set(["concept-a", "concept-b", "concept-c"]))).toBe(true);
  });

  it("is false for a partial result — never bypasses from incomplete evidence", () => {
    expect(unitFullyDemonstrated(principles, new Set(["concept-a", "concept-b"]))).toBe(false);
  });

  it("is false with no evidence at all, undefined or empty", () => {
    expect(unitFullyDemonstrated(principles, undefined)).toBe(false);
    expect(unitFullyDemonstrated(principles, new Set())).toBe(false);
  });

  it("is false for a unit with no principles at all — nothing to have demonstrated", () => {
    expect(unitFullyDemonstrated([], new Set(["concept-a"]))).toBe(false);
  });

  it("ignores evidence for concepts outside this unit", () => {
    expect(unitFullyDemonstrated(principles, new Set(["concept-a", "concept-b", "unrelated-concept"]))).toBe(false);
  });
});

/**
 * Regression coverage for the P0 "guest and account availability"
 * reproduction #2: "What is check?" (prerequisite: meet-the-pieces' own
 * mastery-challenge lesson) stayed locked for a learner whose placement
 * directly demonstrated every concept in meet-the-pieces, because a
 * mastery-challenge lesson belongs to no principle's own `subLessonIds` —
 * `demonstratedLessonIdsFrom` can never cover it directly. `statusOf` and
 * `unlockReason` must apply the identical `unitFullyDemonstrated` bypass
 * through their new `lessonsById` parameter, exactly mirroring the
 * signed-in server-side route guard in app/learn/[lessonId]/page.tsx, so
 * a recommendation can never link to a destination that then rejects the
 * same learner state.
 */
describe("statusOf / unlockReason mastery-challenge prerequisite bypass", () => {
  const boardBasics = makePrinciple({
    id: "meet-the-pieces.board-basics",
    conceptId: "board-orientation",
    subLessonIds: ["meet-the-pieces.01-welcome"],
  });
  const rookPrinciple = makePrinciple({
    id: "meet-the-pieces.rook",
    conceptId: "rook-movement",
    subLessonIds: ["meet-the-pieces.03-meet-the-rook"],
  });
  const principlesById = new Map([
    [boardBasics.id, boardBasics],
    [rookPrinciple.id, rookPrinciple],
  ]);
  const principlesInOrder = [boardBasics, rookPrinciple];

  const masteryChallenge = makeLesson({
    id: "meet-the-pieces.12-unit-mastery-challenge",
    kind: "mastery-challenge" as Lesson["kind"],
    unitId: "meet-the-pieces",
  });
  const whatIsCheck = makeLesson({
    id: "check-and-checkmate.01-what-is-check",
    unitId: "check-and-checkmate",
    prerequisites: ["meet-the-pieces.12-unit-mastery-challenge"],
  });
  const lessonsById = new Map([
    [masteryChallenge.id, masteryChallenge],
    [whatIsCheck.id, whatIsCheck],
  ]);

  it("stays locked when the mastery-challenge's unit is only partially demonstrated", () => {
    const partial = new Set(["board-orientation"]); // rook-movement missing
    expect(statusOf(whatIsCheck, new Set(), principlesById, principlesInOrder, null, partial, lessonsById)).toBe(
      "locked",
    );
  });

  it("unlocks once every principle in the mastery-challenge's unit is demonstrated", () => {
    const full = new Set(["board-orientation", "rook-movement"]);
    expect(statusOf(whatIsCheck, new Set(), principlesById, principlesInOrder, null, full, lessonsById)).toBe(
      "available",
    );
  });

  it("does not bypass without lessonsById (backward-compatible: omitting the param keeps prior behavior)", () => {
    const full = new Set(["board-orientation", "rook-movement"]);
    expect(statusOf(whatIsCheck, new Set(), principlesById, principlesInOrder, null, full)).toBe("locked");
  });

  it("never marks the mastery-challenge lesson itself completed by the bypass — only 'available'", () => {
    const full = new Set(["board-orientation", "rook-movement"]);
    expect(statusOf(masteryChallenge, new Set(), principlesById, principlesInOrder, null, full, lessonsById)).toBe(
      "available",
    );
  });

  it("unlockReason agrees with statusOf: names the mastery-challenge lesson while locked, null once demonstrated", () => {
    const partial = new Set(["board-orientation"]);
    const lockedReason = unlockReason(whatIsCheck, new Set(), lessonsById, principlesById, principlesInOrder, false, partial);
    expect(lockedReason).toMatch(/Unit mastery challenge|unit-mastery-challenge/);

    const full = new Set(["board-orientation", "rook-movement"]);
    const unlockedReason = unlockReason(whatIsCheck, new Set(), lessonsById, principlesById, principlesInOrder, false, full);
    expect(unlockedReason).toBeNull();
  });
});
