import { describe, expect, it } from "vitest";
import type { Lesson, Principle } from "@movewise/exercise-schema";
import { statusOf, unlockReason } from "./lessonStatus";

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
