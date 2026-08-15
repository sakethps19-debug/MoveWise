import { test, expect } from "@playwright/test";

test("explain and select-square steps: click through Welcome to the chessboard, reach the completion screen", async ({
  page,
}) => {
  await page.goto("/learn/meet-the-pieces.01-welcome");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-3: select-square, correctSquares=['e1'] (the white king) — this is
  // also the lesson's last step, so "Finish lesson" ends the lesson.
  await page.locator('[aria-label*="e1,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: "Finish lesson" }).click();

  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();
  await expect(page.getByText("+15 XP")).toBeVisible(); // 2×5 XP steps + 5 XP lesson reward
  await page.getByRole("link", { name: "Back to learning path" }).click();
  await expect(page).toHaveURL("/");
});

test("move-piece step with hints: Meet the rook", async ({ page }) => {
  await page.goto("/learn/meet-the-pieces.03-meet-the-rook");
  await page.getByRole("button", { name: "Continue" }).click();

  // step-2: move-piece, rook e4, expectedMoves ['e4e8']
  await page.locator('[aria-label*="e4,"]').click();
  await page.locator('[aria-label*="e8,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
});

test("mcq and true-false steps: What is check? / What is checkmate?", async ({ page }) => {
  await page.goto("/learn/check-and-checkmate.01-what-is-check");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="h8,"]').click(); // find-check, correctSquares=['h8']
  await page.getByRole("button", { name: "Continue" }).click();

  // mcq is step 3 of 4 (a review step follows) — not the lesson's last step.
  await page.getByRole("button", { name: "Get out of check, no matter what" }).click();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Complete unit" }).click();
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();

  await page.goto("/learn/check-and-checkmate.02-what-is-checkmate");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="e8,"]').click(); // find-checkmate, correctSquares=['e8']
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "False" }).click();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Complete unit" }).click();
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();
});
