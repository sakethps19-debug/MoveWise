import { test, expect } from "./fixtures";

/**
 * P0 "curriculum/practice integrity" — the exact reproduction reported
 * live: a genuinely new learner (onboarding: "Completely new to chess",
 * "Learn chess from scratch", 5 minutes a day) completes Welcome to the
 * chessboard and Ranks, files and squares; Board Basics Practice
 * unlocks; its puzzles required Ka1-b2 and Ke1-f2 — king movement, a
 * rule "Meet the king" (six principles later) hadn't taught yet. Fixed
 * by redesigning Board Basics' puzzles to test only what those two
 * lessons actually taught (orientation, files, ranks, square
 * coordinates, White moving first) — never a piece-movement rule. This
 * test follows the brief's own reproduction steps verbatim, then proves
 * the fix structurally: every Board Basics puzzle is answered by a
 * single tap (no piece is ever selected or moved).
 */
test("the exact reported reproduction: a new-to-chess learner's Board Basics Practice never requires a piece move @smoke", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Completely new to chess" }).click();
  await page.getByRole("button", { name: "Learn chess from scratch" }).click();
  await page.getByRole("button", { name: "5 minutes a day" }).click();

  // Lesson 1: Welcome to the chessboard.
  await expect(page.getByText("Start here")).toBeVisible();
  await page.locator(".mw-continue-card").click();
  await expect(page).toHaveURL("/learn/meet-the-pieces.01-welcome");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="e1,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="e8,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "False" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Finish lesson" }).click();
  await page.getByRole("link", { name: "Back to learning path" }).click();
  await page.waitForURL("/");

  // Lesson 2: Ranks, files and squares.
  await page.goto("/learn/meet-the-pieces.02-ranks-files-squares");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="e4,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "A row running across the board" }).click();
  await page.getByRole("button", { name: "Finish lesson" }).click();
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();
  await page.getByRole("link", { name: "Back to learning path" }).click();
  await page.waitForURL("/");

  // Board Basics Practice is now unlocked.
  const practiceLink = page.getByRole("link", { name: /Practice puzzles/ });
  await expect(practiceLink).toBeVisible();
  await practiceLink.click();
  await page.waitForURL("/practice/meet-the-pieces.board-basics");

  // Every puzzle in this pool is answered by exactly one tap — never a
  // from/to move — so "Meet the king" not having been taught yet is
  // structurally irrelevant here. The board never shows a selected
  // (highlighted) square mid-answer the way a move-based puzzle would.
  for (let i = 0; i < 4; i++) {
    await expect(page.getByText(/^Tap the /)).toBeVisible();
    const board = page.locator(".mw-chessboard").first();
    // Tap the puzzle's own correct square, found via its prompt text
    // referencing a specific square coordinate or "White's king"/
    // "Black's king" — resolved generically by trying the documented
    // correct answers for this pool's 4 puzzles in order.
    const promptText = (await page.getByText(/^Tap the /).textContent()) ?? "";
    let target = "e1";
    if (/Black's king/.test(promptText)) target = "e8";
    else if (/e4/.test(promptText)) target = "e4";
    else if (/c6/.test(promptText)) target = "c6";
    await board.locator(`button[data-square="${target}"]`).click();
    await expect(page.getByText(/^Correct!/)).toBeVisible();
    const isLast = i === 3;
    await page.getByRole("button", { name: isLast ? "Finish practice" : "Continue" }).click();
  }

  await expect(page.getByRole("heading", { name: "Practice complete!" })).toBeVisible();
  // Every puzzle was genuinely first-try correct — proves the pool never
  // demanded a skill (king movement) this learner hadn't been taught, not
  // just that it was eventually solvable by trial and error.
  await expect(page.getByText("4 of 4 solved on the first try.")).toBeVisible();
});
