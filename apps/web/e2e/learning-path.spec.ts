import { test, expect } from "@playwright/test";

function uniqueEmail(prefix: string) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
}

test("guests see every lesson unlocked; a fresh account sees later lessons locked", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("🔒")).toHaveCount(0);

  const email = uniqueEmail("path");
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  const lockCount = await page.getByText("🔒").count();
  expect(lockCount).toBeGreaterThan(0);
  // The entire second unit is locked via its lesson's own prerequisite
  // chain into the first unit's mastery-challenge lesson.
  const checkmateBasicsRow = page.getByText("What is check?");
  await expect(checkmateBasicsRow.locator("..")).toContainText("🔒");
});

test("a perfect first run earns 3 stars; a run with mistakes earns fewer", async ({ page }) => {
  const email = uniqueEmail("stars");
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  await page.goto("/learn/meet-the-pieces.01-welcome");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="a1,"]').click(); // wrong
  await page.locator('[aria-label*="a2,"]').click(); // wrong again
  await page.locator('[aria-label*="e1,"]').click(); // correct
  await page.getByRole("button", { name: "Finish lesson" }).click();
  await page.getByRole("link", { name: "Back to learning path" }).click();
  await page.waitForURL("/");

  // 2 mistakes -> 2 filled stars, not 3 (see docs/adr/0004 for the tiering rule)
  const lessonRow = page.getByText("Welcome to the chessboard").locator("..");
  await expect(lessonRow).toContainText("★★");
  await expect(lessonRow.locator("span[aria-label='2 of 3 stars']")).toBeVisible();
});
