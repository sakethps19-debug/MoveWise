import { test, expect } from "@playwright/test";

test("play as White: engine replies to a played move", async ({ page }) => {
  await page.goto("/play");
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 15_000 });

  await page.locator('[aria-label*="e2,"]').click();
  await page.locator('[aria-label*="e4,"]').click();
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 20_000 });

  // A black pawn should have advanced onto rank 4-6 as the engine's reply.
  const blackPawnAdvanced = await page
    .locator('[aria-label*="4, black pawn"], [aria-label*="5, black pawn"], [aria-label*="6, black pawn"]')
    .count();
  expect(blackPawnAdvanced).toBeGreaterThan(0);
});

test("play as Black: engine plays White's opening move automatically", async ({ page }) => {
  await page.goto("/play");
  await page.getByRole("group", { name: "Choose your side" }).getByRole("button", { name: "Black" }).click();
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 20_000 });

  const whitePawnAdvanced = await page
    .locator('[aria-label*="3, white pawn"], [aria-label*="4, white pawn"]')
    .count();
  expect(whitePawnAdvanced).toBeGreaterThan(0);
});

test("game review and lesson recommendations unlock only after the game ends, and are clearly labeled as demo data (Phase 6)", async ({
  page,
}) => {
  await page.goto("/play");
  // Before the game ends, review/recommendations are explicitly locked —
  // never implied as already-available real analysis.
  await expect(page.getByText(/Locked/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Review this game (demo)" })).toHaveCount(0);

  await page.getByRole("button", { name: "Resign" }).click();
  await expect(page.getByText(/You resigned/)).toBeVisible();

  await page.getByRole("button", { name: "Review this game (demo)" }).click();
  // The "DEMO" label and its explanation are load-bearing, not decorative
  // (see components/GameReviewDemo.tsx) — this must never read as a real
  // analysis of the game just played.
  await expect(page.getByText("DEMO")).toBeVisible();
  await expect(page.getByText(/Sample analysis with illustrative data/)).toBeVisible();

  await expect(page.getByRole("heading", { name: "2. Review the game (sample)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "3. Recommended lessons" })).toBeVisible();
  const recommendation = page.locator(".mw-game-review-rec-link").first();
  await expect(recommendation).toBeVisible();
  await recommendation.click();
  await expect(page).toHaveURL(/\/learn\//);
});
