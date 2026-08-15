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
