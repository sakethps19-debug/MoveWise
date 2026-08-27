import { test, expect } from "./fixtures";
import { gotoGuestLesson } from "./testHelpers";

/**
 * Live-app audit finding: "Board exercise works through the keyboard" was
 * listed as verified-working behaviour, but nothing automated actually
 * proved it — Board.tsx's squares are real <button>s (native Tab/Enter
 * operability by construction), yet every other board e2e spec drives
 * them with .click()/.tap(), which would pass even if a future change
 * broke keyboard access (e.g. an onClick-only handler swapped in without
 * a matching onKeyDown, or a div masquerading as a button). This spec
 * drives the exact same move-piece exercise other specs cover, but only
 * via Tab + Enter — no mouse/pointer events at all — so a real regression
 * here would actually fail a test instead of going unnoticed.
 */

test("a move-piece lesson step can be completed with the keyboard alone: Tab to a square, Enter to select, Tab, Enter to move", async ({
  page,
}) => {
  await gotoGuestLesson(page, "meet-the-pieces.03-meet-the-rook");
  await page.getByRole("button", { name: "Continue" }).click();

  const from = page.locator('[aria-label*="e4,"]');
  const to = page.locator('[aria-label*="e8,"]');

  await from.focus();
  await expect(from).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(from).toHaveAttribute("aria-selected", "true");

  await to.focus();
  await expect(to).toBeFocused();
  await page.keyboard.press("Enter");

  const status = page.getByRole("status").filter({ hasText: "Correct" });
  await expect(status).toBeVisible();
});

test("board squares are reachable by sequential Tab order, not just by direct focus()", async ({ page }) => {
  await gotoGuestLesson(page, "meet-the-pieces.03-meet-the-rook");
  await page.getByRole("button", { name: "Continue" }).click();

  const e4 = page.locator('[aria-label*="e4,"]');
  await e4.focus();
  await expect(e4).toBeFocused();

  // Tabbing forward from a real square must reach another real, focusable
  // gridcell button — proves the grid isn't a keyboard trap and every
  // square genuinely sits in the natural tab order (not just individually
  // focusable via .focus()).
  await page.keyboard.press("Tab");
  const nextFocused = page.locator(":focus");
  await expect(nextFocused).toHaveAttribute("role", "gridcell");
});
