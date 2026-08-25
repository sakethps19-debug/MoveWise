import { test, expect } from "./fixtures";
import { gotoGuestLesson } from "./testHelpers";

test("a wrong answer doesn't permanently block the exercise, and hearts decrement", async ({ page }) => {
  await page.goto("/learn/meet-the-pieces.01-welcome");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-3: select-square, correctSquares=['e1']. Wrong click first.
  await page.locator('[aria-label*="a1,"]').click();
  await expect(page.locator('p[role="alert"]')).toBeVisible();
  await expect(page.getByText("♥♥♥♥♡")).toBeVisible();

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

test("reaching zero hearts triggers guided recovery, never a hard lockout", async ({ page }) => {
  await gotoGuestLesson(page, "meet-the-pieces.03-meet-the-rook");
  await page.getByRole("button", { name: "Continue" }).click();

  // step-2: move-piece, rook e4, expectedMoves ['e4e8']. 4 illegal attempts
  // still just show ordinary wrong-answer feedback and decrement hearts.
  for (let i = 0; i < 4; i++) {
    await page.locator('[aria-label*="e4,"]').click();
    await page.locator('[aria-label*="a1,"]').click();
    await expect(page.locator('p[role="alert"]')).toBeVisible();
  }
  await expect(page.getByText("♡♡♡♡")).toBeVisible();

  // The 5th wrong attempt exhausts the last heart — instead of a 6th
  // ordinary retry, this now triggers a guided recovery interstitial: a
  // reteach pulled from the lesson's own explanation, not a lockout and
  // not a paywall (real requirement from review: never force payment to
  // continue beginner learning).
  await page.locator('[aria-label*="e4,"]').click();
  await page.locator('[aria-label*="a1,"]').click();
  await expect(page.getByRole("heading", { name: "Let's review before continuing" })).toBeVisible();
  await expect(
    page.getByText("The rook moves in straight lines — forward, backward, left, or right"),
  ).toBeVisible();

  // Completing the review restores some hearts and returns to the same exercise.
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("♥♥♥♡♡")).toBeVisible();
  await page.locator('[aria-label*="e4,"]').click();
  await page.locator('[aria-label*="e8,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
});

test("a refresh during recovery doesn't crash — restarts the lesson like a refresh at any other step", async ({
  page,
}) => {
  // This app has no mid-lesson persistence at all yet (a separate, tracked
  // gap — see docs/known-risks.md on lesson exit/resume), so a refresh
  // here behaves the same as a refresh at any other point in a lesson:
  // it restarts from step 1 with full hearts, not a crash or a stuck page.
  await gotoGuestLesson(page, "meet-the-pieces.03-meet-the-rook");
  await page.getByRole("button", { name: "Continue" }).click();
  for (let i = 0; i < 5; i++) {
    await page.locator('[aria-label*="e4,"]').click();
    await page.locator('[aria-label*="a1,"]').click();
  }
  await expect(page.getByRole("heading", { name: "Let's review before continuing" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Let's review before continuing" })).toHaveCount(0);
  await expect(page.getByText("♥♥♥♥♥")).toBeVisible();
});

test("a lesson can still be completed normally after going through recovery", async ({ page }) => {
  await gotoGuestLesson(page, "meet-the-pieces.03-meet-the-rook");
  await page.getByRole("button", { name: "Continue" }).click();

  // Trigger recovery on step-2, then complete it.
  for (let i = 0; i < 5; i++) {
    await page.locator('[aria-label*="e4,"]').click();
    await page.locator('[aria-label*="a1,"]').click();
  }
  await page.getByRole("button", { name: "Try again" }).click();
  await page.locator('[aria-label*="e4,"]').click();
  await page.locator('[aria-label*="e8,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-3: move-piece, rook captures the pawn on d4 — this is the lesson's last step.
  await page.locator('[aria-label*="e4,"]').click();
  await page.locator('[aria-label*="d4,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: "Finish lesson" }).click();

  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();
});
