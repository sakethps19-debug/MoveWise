import { test, expect } from "./fixtures";
import { gotoGuestLesson } from "./testHelpers";

test("the knight fork: a check-only trap move is rejected, the real fork is accepted", async ({ page }) => {
  await gotoGuestLesson(page, "basic-tactics.01-the-knight-fork");

  // step-1: explain
  await page.getByRole("button", { name: "Continue" }).click();

  // step-2: true-false, correct=false
  await page.getByRole("button", { name: "False" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-3: mcq, correctIndex=1 (the L-shaped-jump option)
  await page.getByRole("button", { name: /L-shaped jump/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-4: move-piece, expectedMoves=['c4e5'] — the fork of king g6 + rook c6
  await page.locator('[aria-label*="c4,"]').click();
  await page.locator('[aria-label*="e5,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-5: move-piece, expectedMoves=['f4d5'] — forks king e7 + queen c7.
  // Nf4-g6 is a real, legal check (verified programmatically when this
  // lesson was authored) but doesn't also attack the queen — a
  // deliberately plausible trap, not just an arbitrary wrong square.
  await page.locator('[aria-label*="f4,"]').click();
  await page.locator('[aria-label*="g6,"]').click();
  await expect(page.locator('p[role="alert"]').first()).toContainText("only checks the king");

  await page.locator('[aria-label*="f4,"]').click();
  await page.locator('[aria-label*="d5,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-6: review (last step)
  await page.getByRole("button", { name: "Finish lesson" }).click();
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();
});
