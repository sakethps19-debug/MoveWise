import { test, expect } from "@playwright/test";

test("home page loads and shows both units", async ({ page }) => {
  await page.goto("/");
  // "MoveWise" is the nav brand mark, not a page heading — the page's own
  // <h1> is "Learn & Play" (see components/Nav.tsx / app/page.tsx).
  await expect(page.getByText("MoveWise", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Learn & Play" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Meet the Pieces" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Check and Checkmate Basics" })).toBeVisible();
});
