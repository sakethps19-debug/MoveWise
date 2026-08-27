import type { Lesson } from "@movewise/exercise-schema";

/**
 * P1 pedagogical-consistency requirement: hearts (and the zero-heart
 * recovery interstitial they gate) are a real-stakes mechanic, so they
 * should only apply to an actual mastery assessment — a unit's
 * mastery-challenge lesson (Lesson.kind, exercise-schema) — not to a
 * regular sub-lesson, which is guided teaching/first-exposure practice
 * for a brand-new concept. A wrong answer there should just explain why
 * and let the learner retry immediately, with no cost and no risk of
 * being routed into a recovery interstitial.
 */
export function heartsAtRiskFor(lesson: Pick<Lesson, "kind">): boolean {
  return lesson.kind === "mastery-challenge";
}
