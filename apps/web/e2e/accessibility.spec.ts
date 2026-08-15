import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Closes "no accessibility test automation" in docs/known-risks.md.
// Board.tsx and friends were built with real ARIA semantics (accessible
// grid roles, aria-pressed, alt text) from the start, but nothing
// automated ever checked it — this was verified by inspection only.
// Scoped to WCAG 2.0/2.1 A and AA rules, the standard baseline axe-core
// ships as tag groups, rather than every best-practice rule it knows
// about (those flag real opinions, not defects, and would make this
// suite noisy instead of trustworthy).

function uniqueEmail(prefix: string) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
}

async function expectNoViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

test("home page (guest)", async ({ page }) => {
  await page.goto("/");
  await expectNoViolations(page);
});

test("login and signup pages", async ({ page }) => {
  await page.goto("/login");
  await expectNoViolations(page);

  await page.goto("/signup");
  await expectNoViolations(page);
});

test("a lesson page: explain/select-square steps, and the completion screen", async ({ page }) => {
  await page.goto("/learn/meet-the-pieces.01-welcome");
  await expectNoViolations(page);

  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expectNoViolations(page); // select-square step, with the board rendered

  await page.locator('[aria-label*="e1,"]').click();
  await page.getByRole("button", { name: "Finish lesson" }).click();
  await expectNoViolations(page); // the completion screen
});

test("a move-piece lesson step, with a hint arrow rendered", async ({ page }) => {
  await page.goto("/learn/meet-the-pieces.03-meet-the-rook");
  await page.getByRole("button", { name: "Continue" }).click();
  await expectNoViolations(page);
});

test("play mode", async ({ page }) => {
  await page.goto("/play");
  await expectNoViolations(page);
});

test("account page and the signed-in home page", async ({ page }) => {
  const email = uniqueEmail("a11y");
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");
  await expectNoViolations(page);

  await page.goto("/account");
  await expectNoViolations(page);
});
