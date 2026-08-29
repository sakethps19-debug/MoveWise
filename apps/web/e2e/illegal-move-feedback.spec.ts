import { test, expect } from "./fixtures";

/**
 * Real, confirmed bug: selecting e2 then clicking the illegal e5
 * destination did nothing at all — no message, no live-region
 * announcement, no visible indication anything had been attempted, and
 * the board's move history was silently untouched (correct) but with
 * zero feedback as to why. Board.tsx/PlayRunner.tsx now reject the
 * attempt with a real explanation (packages/chess-rules'
 * explainIllegalMove), a role="alert" live-region message
 * (#mw-play-illegal-move — tests target this id specifically rather
 * than getByRole("alert"), since Next.js's own always-present, empty
 * route announcer (#__next-route-announcer__) is also role="alert" and
 * would otherwise make every alert query ambiguous), and a brief error
 * highlight on both squares involved.
 */

test("an illegal move shows a concise explanation, doesn't record a move, and can be retried immediately", async ({
  page,
}) => {
  await page.goto("/play");
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 15_000 });

  await page.locator('[aria-label*="e2,"]').click();
  await page.locator('[aria-label*="e5,"]').click();

  await expect(page.locator("#mw-play-illegal-move")).toContainText("A pawn cannot move 3 squares.");
  // The e5 destination doesn't stay looking selected/highlighted.
  await expect(page.locator('[aria-label*="e5,"]')).toHaveAttribute("aria-selected", "false");
  // No move was recorded — the move list stays empty.
  await expect(page.locator(".mw-move-row")).toHaveCount(0);

  // Immediate retry with a real legal move works.
  await page.locator('[aria-label*="e2,"]').click();
  await page.locator('[aria-label*="e4,"]').click();
  await expect(page.locator("#mw-play-illegal-move")).toHaveCount(0);
  await expect(page.locator(".mw-move-row")).toHaveCount(1);
});

test("clicking another one of your own pieces switches the selection instead of attempting an illegal move", async ({
  page,
}) => {
  await page.goto("/play");
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 15_000 });

  await page.locator('[aria-label*="e2,"]').click();
  await expect(page.locator('[aria-label*="e2,"]')).toHaveAttribute("aria-selected", "true");

  // d2 is another friendly pawn, not a legal destination for e2's pawn.
  await page.locator('[aria-label*="d2,"]').click();
  await expect(page.locator('[aria-label*="d2,"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[aria-label*="e2,"]')).toHaveAttribute("aria-selected", "false");
  await expect(page.locator("#mw-play-illegal-move")).toHaveCount(0);
  await expect(page.locator(".mw-move-row")).toHaveCount(0);
});

test("attempting to move the opponent's piece is rejected with an explanation, not silently ignored", async ({
  page,
}) => {
  await page.goto("/play");
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 15_000 });

  // e7 is Black's pawn — White to move.
  await page.locator('[aria-label*="e7,"]').click();
  await expect(page.locator("#mw-play-illegal-move")).toContainText("Stockfish's piece");
  await expect(page.locator('[aria-label*="e7,"]')).toHaveAttribute("aria-selected", "false");
});

test("clicking the same square twice deselects without any error message", async ({ page }) => {
  await page.goto("/play");
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 15_000 });

  await page.locator('[aria-label*="e2,"]').click();
  await expect(page.locator('[aria-label*="e2,"]')).toHaveAttribute("aria-selected", "true");
  await page.locator('[aria-label*="e2,"]').click();
  await expect(page.locator('[aria-label*="e2,"]')).toHaveAttribute("aria-selected", "false");
  await expect(page.locator("#mw-play-illegal-move")).toHaveCount(0);
});
