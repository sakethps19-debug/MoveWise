import { test, expect } from "./fixtures";
import { gotoGuestLesson } from "./testHelpers";

test("order-steps and guided-sequence: Thinking under check", async ({ page }) => {
  await gotoGuestLesson(page, "check-and-checkmate.03-thinking-under-check");
  await page.getByRole("button", { name: "Continue" }).click();

  // order-steps: correct sequence is Capture, Block, Move (correctOrder [2,1,0])
  await page.getByRole("button", { name: "Capture the checking piece" }).click();
  await page.getByRole("button", { name: "Block the check" }).click();
  await page.getByRole("button", { name: "Move your king" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click(); // explain step-3

  // guided-sequence: block with the knight (c2-e3), opponent forced-recaptures,
  // king steps to safety (e1-d2)
  await page.locator('[aria-label*="c2,"]').click();
  await page.locator('[aria-label*="e3,"]').click();
  await expect(page.locator('[aria-label*="e3,"]')).toHaveAttribute("aria-label", /black rook/);
  await page.locator('[aria-label*="e1,"]').click();
  await page.locator('[aria-label*="d2,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click(); // explain step-5: K+R vs K technique

  // mini-game: verify the embedded engine actually replies to a played move
  await expect(page.getByRole("status").filter({ hasText: "Your move" })).toBeVisible({ timeout: 15_000 });
  await page.locator('[aria-label*="a1,"]').click();
  await page.locator('[aria-label*="a7,"]').click();
  await expect(page.getByRole("status")).toContainText(/Your move|Stockfish is thinking|Game over/, {
    timeout: 20_000,
  });
});

test("mini-game and remaining step-type demo lesson (not linked from the home page)", async ({ page }) => {
  await page.goto("/learn/step-type-preview.01-new-mechanics");
  await page.getByRole("button", { name: "Continue" }).click();

  // find-check: multiple valid answers, click one
  await page.locator('[aria-label*="d8,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // find-checkmate: unique answer
  await page.locator('[aria-label*="e8,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
});
