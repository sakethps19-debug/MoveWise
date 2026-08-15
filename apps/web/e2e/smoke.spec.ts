import { test, expect } from "@playwright/test";

test("home page loads and shows both units", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "MoveWise" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Meet the Pieces" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Check and Checkmate Basics" })).toBeVisible();
});
