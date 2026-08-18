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

test("a lesson page: explain/select-square/true-false steps, and the completion screen", async ({ page }) => {
  await page.goto("/learn/meet-the-pieces.01-welcome");
  await expectNoViolations(page);

  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expectNoViolations(page); // select-square step, with the board rendered

  await page.locator('[aria-label*="e1,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="e8,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "False" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Complete unit" }).click();
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

// The tests above all run in the default (light) theme. Dark is a
// deliberately separate token set (docs/design/system.md), not an
// inverted filter, so a token that's fine in light can still fail
// contrast in dark — nothing above would catch that. Scoped to a
// representative subset (not every page above) since the point is
// confirming the dark token set itself holds up, not re-deriving full
// page coverage twice.
test.describe("dark theme", () => {
  test.use({ colorScheme: "dark" });

  test("home page (guest)", async ({ page }) => {
    await page.goto("/");
    await expectNoViolations(page);
  });

  test("login page", async ({ page }) => {
    await page.goto("/login");
    await expectNoViolations(page);
  });

  test("a lesson page: select-square step and the completion screen", async ({ page }) => {
    await page.goto("/learn/meet-the-pieces.01-welcome");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expectNoViolations(page);

    await page.locator('[aria-label*="e1,"]').click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.locator('[aria-label*="e8,"]').click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "False" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Complete unit" }).click();
    await expectNoViolations(page);
  });

  test("play mode", async ({ page }) => {
    await page.goto("/play");
    await expectNoViolations(page);
  });
});

// globals.css's prefers-reduced-motion block collapses every
// animation/transition duration app-wide — this was never actually
// asserted, only visible by reading the CSS. Checks the rule fires for
// real (a computed style, not the source) on two elements that use
// keyframe animation for genuinely decorative motion: the correct-answer
// feedback banner's slide-in, and the completion screen's star pop-in.
test.describe("prefers-reduced-motion", () => {
  // test.use({ reducedMotion: "reduce" }) does not reliably apply the
  // media feature in this Playwright version when combined with the
  // project's device preset (confirmed via a matchMedia probe: it
  // reported false even with the option set) — page.emulateMedia() is
  // the same underlying CDP call made directly, and does apply it.
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("the correct-answer feedback banner's entrance animation is collapsed", async ({ page }) => {
    await page.goto("/learn/meet-the-pieces.03-meet-the-rook");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.locator('[aria-label*="e4,"]').click();
    await page.locator('[aria-label*="e8,"]').click();
    await expect(page.locator(".mw-feedback--success")).toBeVisible();

    const duration = await page.locator(".mw-feedback--success").evaluate((el) => getComputedStyle(el).animationDuration);
    expect(parseFloat(duration)).toBeLessThan(0.01);
  });

  test("the completion screen's star pop-in animation is collapsed", async ({ page }) => {
    await page.goto("/learn/meet-the-pieces.01-welcome");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.locator('[aria-label*="e1,"]').click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.locator('[aria-label*="e8,"]').click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "False" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Complete unit" }).click();

    const duration = await page
      .locator(".mw-completion-stars .mw-stars")
      .evaluate((el) => getComputedStyle(el).animationDuration);
    expect(parseFloat(duration)).toBeLessThan(0.01);
  });
});
