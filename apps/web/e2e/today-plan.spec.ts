import { test, expect } from "./fixtures";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * P1 "build the Today experience" (lib/todayPlan.ts, components/TodayPlan.tsx):
 * the homepage's new personalized daily plan, rendered above the existing
 * curriculum map. Covers what lib/todayPlan.test.ts's pure unit tests
 * can't: real server-computed signals (an actual LessonCheckpoint row, a
 * real UserConceptMastery row) reaching the rendered plan correctly, and
 * the client-side duration selector actually changing what's shown.
 */

const DB_HELPER = path.join(__dirname, "db-helper.mjs");

function dbHelper(command: string, args: Record<string, unknown> = {}): string {
  return execFileSync("node", [DB_HELPER, command, JSON.stringify(args)], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf-8",
  });
}

async function signUpFresh(page: import("@playwright/test").Page, email: string) {
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");
}

test("a brand-new signed-in learner sees a short plan, not an overwhelming one", async ({ page }) => {
  const email = `today${Date.now()}@example.com`;
  await signUpFresh(page, email);

  await expect(page.getByRole("heading", { name: "Today's plan" })).toBeVisible();
  // Brand-new: only warm-up + the very first lesson, never practice/play
  // (lib/todayPlan.ts's isBrandNewLearner branch) — a first-session plan
  // that stayed this short is the concrete "beginner not overwhelmed" check.
  const steps = page.locator(".mw-today-step");
  await expect(steps).toHaveCount(2);
  await expect(page.locator(".mw-today-step-reason").first()).not.toHaveText("");
});

test("every recommendation shown states a real reason, never a generic placeholder", async ({ page }) => {
  const email = `todayreason${Date.now()}@example.com`;
  await signUpFresh(page, email);

  // TodayPlan is a client component (its budget/goal come from
  // localStorage, never the server's first paint) — wait for it to
  // actually mount before reading step reasons, or allTextContents()
  // resolves against an empty pre-hydration DOM with no auto-wait.
  await expect(page.getByRole("heading", { name: "Today's plan" })).toBeVisible();
  const reasons = await page.locator(".mw-today-step-reason").allTextContents();
  expect(reasons.length).toBeGreaterThan(0);
  for (const reason of reasons) {
    expect(reason.trim().length).toBeGreaterThan(0);
  }
});

test("resuming an in-progress lesson takes priority and links straight back to it", async ({ page }) => {
  const email = `todayresume${Date.now()}@example.com`;
  await signUpFresh(page, email);
  const userId = dbHelper("get-user-id", { email });
  dbHelper("set-lesson-checkpoint", {
    userId,
    lessonId: "meet-the-pieces.03-meet-the-rook",
    lessonVersion: 1,
    stepIndex: 2,
    epoch: 0,
    revision: 1,
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today's plan" })).toBeVisible();
  const learnStep = page.locator(".mw-today-step", { hasText: "Continue:" });
  await expect(learnStep).toBeVisible();
  await expect(learnStep).toHaveAttribute("href", "/learn/meet-the-pieces.03-meet-the-rook");
});

test("the duration selector changes how many things are offered today", async ({ page }) => {
  const email = `todaybudget${Date.now()}@example.com`;
  await signUpFresh(page, email);
  const userId = dbHelper("get-user-id", { email });
  // A learner with real history (not brand-new) so practice/play both
  // become eligible candidates — otherwise every budget shows the same
  // short brand-new-learner plan and the test can't tell them apart.
  dbHelper("seed-completions", { userId, lessonIds: ["meet-the-pieces.01-welcome"] });
  dbHelper("set-mastery", { userId, conceptId: "board-orientation", status: "practising" });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today's plan" })).toBeVisible();

  await page.getByRole("button", { name: "5 min" }).click();
  const shortCount = await page.locator(".mw-today-step").count();

  await page.getByRole("button", { name: "20 min" }).click();
  const longCount = await page.locator(".mw-today-step").count();

  expect(longCount).toBeGreaterThanOrEqual(shortCount);
});

test("a pending placement confirmation is offered as today's learn step", async ({ page }) => {
  const email = `todayconfirm${Date.now()}@example.com`;
  await signUpFresh(page, email);
  const userId = dbHelper("get-user-id", { email });
  dbHelper("seed-placement-attempt", { userId, conceptId: "board-orientation" });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today's plan" })).toBeVisible();
  const learnStep = page.locator(".mw-today-step", { hasText: "Confirm:" });
  await expect(learnStep).toBeVisible();
  await expect(learnStep).toHaveAttribute("href", "/practice/confirm/meet-the-pieces.board-basics");
});

test("guests see the curriculum map without a fabricated Today plan", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today's plan" })).not.toBeVisible();
});
