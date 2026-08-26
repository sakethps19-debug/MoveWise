import { test, expect } from "./fixtures";
import { gotoGuestLesson } from "./testHelpers";

/**
 * P1 pedagogical-consistency requirement (lib/heartsPolicy.ts): hearts
 * only carry real stakes on a mastery-challenge lesson — a genuine
 * assessment of everything the unit taught. A regular sub-lesson is
 * guided teaching/first exposure, so a wrong answer there explains why
 * and lets the learner retry immediately, with no heart cost and no risk
 * of the recovery interstitial. meet-the-pieces.12-unit-mastery-challenge
 * is this content's only mastery-challenge lesson today (Lesson.kind),
 * so the hearts-at-risk tests below use it; meet-the-pieces.01-welcome
 * and meet-the-pieces.03-meet-the-rook are regular sub-lessons.
 */

test("a wrong answer doesn't permanently block the exercise, and never costs a heart on a regular lesson", async ({
  page,
}) => {
  await page.goto("/learn/meet-the-pieces.01-welcome");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-3: select-square, correctSquares=['e1']. Wrong click first.
  await page.locator('[aria-label*="a1,"]').click();
  await expect(page.locator('p[role="alert"]')).toBeVisible();
  await expect(page.getByText("♥♥♥♥♥")).toBeVisible(); // no heart lost — this is teaching, not an assessment

  // The correct answer must still register immediately after a wrong one —
  // this was a real, previously-undetected bug: every board-click exercise
  // type got permanently stuck after a wrong answer, since nothing ever
  // reset status back to "active". See docs/known-risks.md.
  await page.locator('[aria-label*="e1,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
});

test("a hint shown before a correct answer doesn't linger after the step is marked correct", async ({ page }) => {
  await gotoGuestLesson(page, "meet-the-pieces.03-meet-the-rook");
  await page.getByRole("button", { name: "Continue" }).click();

  // step-2: move-piece, rook e4, expectedMoves ['e4e8']. Reveal a hint first.
  await page.getByRole("button", { name: "Hint 1" }).click();
  await expect(page.getByText("Move the rook as far as it can go in one straight line.")).toBeVisible();

  await page.locator('[aria-label*="e4,"]').click();
  await page.locator('[aria-label*="e8,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();

  // The stale hint text (and its board highlight/arrow) must be gone now —
  // a real bug found in review: contradictory feedback that kept the old
  // hint visible right below the success message.
  await expect(page.getByText("Move the rook as far as it can go in one straight line.")).toHaveCount(0);
});

test("a regular sub-lesson never costs a heart or triggers recovery, however many wrong attempts", async ({
  page,
}) => {
  await gotoGuestLesson(page, "meet-the-pieces.03-meet-the-rook");
  await page.getByRole("button", { name: "Continue" }).click();

  // step-2: move-piece, rook e4, expectedMoves ['e4e8']. 6 illegal attempts
  // (more than START_HEARTS) — still just ordinary wrong-answer feedback,
  // hearts never move off full, and recovery never triggers.
  for (let i = 0; i < 6; i++) {
    await page.locator('[aria-label*="e4,"]').click();
    await page.locator('[aria-label*="a1,"]').click();
    await expect(page.locator('p[role="alert"]')).toBeVisible();
    await expect(page.getByText("♥♥♥♥♥")).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Let's review before continuing" })).toHaveCount(0);

  // Still completable normally afterward.
  await page.locator('[aria-label*="e4,"]').click();
  await page.locator('[aria-label*="e8,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
});

test("reaching zero hearts on a mastery-challenge lesson triggers guided recovery, never a hard lockout", async ({
  page,
}) => {
  await gotoGuestLesson(page, "meet-the-pieces.12-unit-mastery-challenge");
  await page.getByRole("button", { name: "Continue" }).click(); // step-1 explain

  // step-2: select-square, correctSquares=['g6']. 4 wrong clicks still just
  // show ordinary wrong-answer feedback and decrement hearts.
  for (let i = 0; i < 4; i++) {
    await page.locator('[aria-label*="a1,"]').click();
    await expect(page.locator('p[role="alert"]')).toBeVisible();
  }
  await expect(page.getByText("♡♡♡♡")).toBeVisible();

  // The 5th wrong attempt exhausts the last heart — instead of a 6th
  // ordinary retry, this triggers a guided recovery interstitial: a
  // reteach pulled from the lesson's own explanation, not a lockout and
  // not a paywall (real requirement from review: never force payment to
  // continue beginner learning).
  await page.locator('[aria-label*="a1,"]').click();
  await expect(page.getByRole("heading", { name: "Let's review before continuing" })).toBeVisible();
  await expect(page.getByText("Let's put it all together.")).toBeVisible();

  // Completing the review restores some hearts and returns to the same exercise.
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("♥♥♥♡♡")).toBeVisible();
  await page.locator('[aria-label*="g6,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
});

test("a refresh during recovery doesn't crash — restarts the lesson like a refresh at any other step", async ({
  page,
}) => {
  // This app has no mid-lesson persistence at all yet (a separate, tracked
  // gap — see docs/known-risks.md on lesson exit/resume), so a refresh
  // here behaves the same as a refresh at any other point in a lesson:
  // it restarts from step 1 with full hearts, not a crash or a stuck page.
  await gotoGuestLesson(page, "meet-the-pieces.12-unit-mastery-challenge");
  await page.getByRole("button", { name: "Continue" }).click();
  for (let i = 0; i < 5; i++) {
    await page.locator('[aria-label*="a1,"]').click();
  }
  await expect(page.getByRole("heading", { name: "Let's review before continuing" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Let's review before continuing" })).toHaveCount(0);
  await expect(page.getByText("♥♥♥♥♥")).toBeVisible();
});

test("a mastery-challenge lesson can still be completed normally after going through recovery", async ({ page }) => {
  await gotoGuestLesson(page, "meet-the-pieces.12-unit-mastery-challenge");
  await page.getByRole("button", { name: "Continue" }).click(); // step-1 explain

  // Trigger recovery on step-2, then complete it.
  for (let i = 0; i < 5; i++) {
    await page.locator('[aria-label*="a1,"]').click();
  }
  await page.getByRole("button", { name: "Try again" }).click();
  await page.locator('[aria-label*="g6,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // The rest of the lesson, driven for real — same sequence
  // cross-unit-progression.spec.ts uses to complete this exact lesson.
  await page.locator('[aria-label*="b5,"]').click(); // step-3 move-piece: rook b5-b1
  await page.locator('[aria-label*="b1,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="e4,"]').click(); // step-4 capture: bishop e4xd5
  await page.locator('[aria-label*="d5,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "False" }).click(); // step-5 true-false
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="c3,"]').click(); // step-6 find-legal-move: knight c3-d5
  await page.locator('[aria-label*="d5,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="g4,"]').click(); // step-7 capture: pawn g4xf5
  await page.locator('[aria-label*="f5,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="c5,"]').click(); // step-8 move-piece: king c5-b5
  await page.locator('[aria-label*="b5,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "A rook" }).click(); // step-9 mcq
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Complete unit" }).click(); // step-10 review

  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();
});
