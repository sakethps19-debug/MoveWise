import { test, expect } from "@playwright/test";

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

test("hearts floor at zero and never lock the learner out", async ({ page }) => {
  await page.goto("/learn/meet-the-pieces.03-meet-the-rook");
  await page.getByRole("button", { name: "Continue" }).click();

  // step-2: move-piece, rook e4, expectedMoves ['e4e8']. 6 illegal attempts.
  for (let i = 0; i < 6; i++) {
    await page.locator('[aria-label*="e4,"]').click();
    await page.locator('[aria-label*="a1,"]').click();
    await expect(page.locator('p[role="alert"]')).toBeVisible();
  }
  await expect(page.getByText("♡♡♡♡♡")).toBeVisible();

  // Still fully usable at zero hearts.
  await page.locator('[aria-label*="e4,"]').click();
  await page.locator('[aria-label*="e8,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
});
