import { test, expect } from "./fixtures";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Real lesson resume (P1-C): a learner who leaves a lesson mid-way and
 * reopens it must be offered a real choice — "Resume lesson" (reopens at
 * the saved step) or "Start over" (an explicit, separate reset) — never
 * silently restarted at step 1 with full hearts the way it was before
 * LessonCheckpoint (packages/db) and LessonResumeGate existed.
 */

const DB_HELPER = path.join(__dirname, "db-helper.mjs");

function dbHelper(command: string, args: Record<string, unknown> = {}): string {
  return execFileSync("node", [DB_HELPER, command, JSON.stringify(args)], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf-8",
  });
}

const LESSON_URL = "/learn/meet-the-pieces.01-welcome";

// Advances from step-1 through step-4 (leaving off partway, on the
// independent "find Black's king" step) without finishing the lesson.
async function advanceToStepFour(page: import("@playwright/test").Page) {
  await page.goto(LESSON_URL);
  await page.getByRole("button", { name: "Continue" }).click(); // step-1 -> step-2
  await page.getByRole("button", { name: "Continue" }).click(); // step-2 -> step-3
  await page.locator('[aria-label*="e1,"]').click(); // step-3: find White's king
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click(); // step-3 -> step-4
  await expect(page.getByText("Now find Black's king on your own")).toBeVisible();
}

test("a signed-in learner who leaves mid-lesson is offered Resume or Start over, and Resume reopens the exact saved step", async ({
  page,
}) => {
  const email = `resume${Date.now()}@example.com`;
  const password = "password123";
  dbHelper("create-user", { email, password });
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  await advanceToStepFour(page);

  // Leaves without finishing — the real-world "closed the tab" case.
  await page.goto("/");

  const userId = dbHelper("get-user-id", { email });
  const checkpointJson = dbHelper("get-lesson-checkpoint", { userId, lessonId: "meet-the-pieces.01-welcome" });
  expect(checkpointJson).not.toBe("");
  expect(JSON.parse(checkpointJson).stepIndex).toBe(3); // 0-indexed step-4

  // Reopening never silently restarts at step 1 — it asks first.
  await page.goto(LESSON_URL);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByText("step 4 of 6")).toBeVisible();

  await page.getByRole("button", { name: "Resume lesson" }).click();
  // Lands exactly where they left off — step-4, not step-1's board-intro text.
  await expect(page.getByText("Now find Black's king on your own")).toBeVisible();
  await expect(page.getByText("This is a chessboard")).toHaveCount(0);

  // Finishing the lesson clears the checkpoint — completion supersedes it.
  await page.locator('[aria-label*="e8,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "False" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Complete unit" }).click();
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();

  const clearedCheckpoint = dbHelper("get-lesson-checkpoint", { userId, lessonId: "meet-the-pieces.01-welcome" });
  expect(clearedCheckpoint).toBe("");
});

test("Start over is a separate, explicit action that discards the saved step and begins again from step 1", async ({
  page,
}) => {
  const email = `restart${Date.now()}@example.com`;
  const password = "password123";
  dbHelper("create-user", { email, password });
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  await advanceToStepFour(page);
  await page.goto("/");

  await page.goto(LESSON_URL);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.getByRole("button", { name: "Start over" }).click();

  // Genuinely restarted — back at step-1's board introduction, not step-4.
  await expect(page.getByText("This is a chessboard")).toBeVisible();
  await expect(page.getByText("Now find Black's king on your own")).toHaveCount(0);

  const userId = dbHelper("get-user-id", { email });
  const checkpointAfterRestart = dbHelper("get-lesson-checkpoint", { userId, lessonId: "meet-the-pieces.01-welcome" });
  expect(checkpointAfterRestart).toBe("");
});

test("a guest's in-progress lesson also resumes at the saved step, without any account", async ({ page }) => {
  await advanceToStepFour(page);
  await page.goto("/");

  await page.goto(LESSON_URL);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByText("step 4 of 6")).toBeVisible();

  await page.getByRole("button", { name: "Resume lesson" }).click();
  await expect(page.getByText("Now find Black's king on your own")).toBeVisible();
  await expect(page.getByText("This is a chessboard")).toHaveCount(0);
});
