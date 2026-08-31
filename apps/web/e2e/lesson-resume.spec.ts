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

/**
 * A `keepalive: true` save fired right as the page navigates away is
 * preserved by the browser (that's the whole point — see
 * lib/checkpointClient.ts), but nothing about that guarantee says it has
 * *finished* landing in the database by the time the very next line of
 * test code runs immediately after `page.goto()` resolves. Asserting on
 * `dbHelper`'s result with zero wait after such a navigation was a real,
 * reproduced source of test flakiness (a one-step-behind read, not a
 * data-correctness bug — the write always did land, just not always
 * instantly) — this polls briefly instead of assuming instantaneous
 * consistency the product never actually promised for a fire-and-forget
 * keepalive write.
 */
function waitForCheckpointStepIndex(userId: string, lessonId: string, expected: number, attempts = 20): string {
  for (let i = 0; i < attempts; i++) {
    const json = dbHelper("get-lesson-checkpoint", { userId, lessonId });
    if (json !== "" && JSON.parse(json).stepIndex === expected) return json;
    execFileSync("sleep", ["0.1"]);
  }
  return dbHelper("get-lesson-checkpoint", { userId, lessonId });
}

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
  const checkpointJson = waitForCheckpointStepIndex(userId, "meet-the-pieces.01-welcome", 3);
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
  await page.getByRole("button", { name: "Finish lesson" }).click();
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();

  // Completion closes the checkpoint permanently (a revision-guarded
  // sentinel write, not a delete — lib/lessonCheckpointStore.ts) — the row
  // may still exist, but it must never again read as "in progress".
  const clearedCheckpoint = dbHelper("get-lesson-checkpoint", { userId, lessonId: "meet-the-pieces.01-welcome" });
  if (clearedCheckpoint !== "") expect(JSON.parse(clearedCheckpoint).stepIndex).toBe(-1);
  await page.goto(LESSON_URL);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toHaveCount(0);
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
  if (checkpointAfterRestart !== "") expect(JSON.parse(checkpointAfterRestart).stepIndex).toBe(-1);
});

test("a delayed step-save that arrives after completion must not resurrect a finished lesson's checkpoint", async ({
  page,
}) => {
  // The exact residual race the revision-guarded checkpoint model
  // (lib/lessonCheckpointStore.ts) exists to close: a save's keepalive
  // fetch can legitimately still be in flight when a later action (here,
  // completion) reaches the server first. Delaying one specific save
  // request server-side proves the *server's* ordering guarantee, not
  // just how fast the client happens to be.
  const email = `delayedsave${Date.now()}@example.com`;
  const password = "password123";
  dbHelper("create-user", { email, password });
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  let delayedOne = false;
  await page.route("**/api/lesson-checkpoint", async (route) => {
    const body = route.request().postDataJSON() as { closed?: boolean };
    if (!body.closed && !delayedOne) {
      // Delay only the very first ordinary save once, long enough that
      // completion's own request (fired moments later, after the rest of
      // the lesson is finished) reaches the server and is written first.
      delayedOne = true;
      await new Promise((r) => setTimeout(r, 2000));
    }
    await route.continue();
  });

  await advanceToStepFour(page);

  // Finish the lesson right away — completion's request races the
  // artificially delayed first save above.
  await page.locator('[aria-label*="e8,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "False" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Finish lesson" }).click();
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();

  // Give the delayed save every chance to land after completion before checking.
  await page.waitForTimeout(2500);

  const userId = dbHelper("get-user-id", { email });
  const checkpointJson = dbHelper("get-lesson-checkpoint", { userId, lessonId: "meet-the-pieces.01-welcome" });
  // The delayed save must never win — completion's higher revision must
  // still be what's stored, whichever request the server received last.
  if (checkpointJson !== "") expect(JSON.parse(checkpointJson).stepIndex).toBe(-1);

  await page.goto(LESSON_URL);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toHaveCount(0);
});

test("out-of-order checkpoint saves are resolved by revision, not arrival order", async ({ page }) => {
  // The client's serial queue (lib/serialQueue.ts) already prevents this
  // from happening through the app's own UI — it waits for each save to
  // fully settle before sending the next, so requests can't actually
  // reach the server out of order from a single tab. This test instead
  // proves the *server's own* revision guard directly (matching "reject
  // stale updates server-side" literally): fire two raw requests
  // concurrently with an out-of-order revision/response pairing and
  // confirm the higher revision always wins, regardless of which
  // response the server happens to finish processing first.
  const email = `outoforder${Date.now()}@example.com`;
  const password = "password123";
  dbHelper("create-user", { email, password });
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  const result = await page.evaluate(async () => {
    const body = (revision: number, stepIndex: number) => ({
      lessonId: "meet-the-pieces.01-welcome",
      lessonVersion: 1,
      epoch: 0,
      revision,
      stepIndex,
      mistakes: 0,
      hintsUsed: 0,
      attempts: [],
    });
    const post = (revision: number, stepIndex: number) =>
      fetch("/api/lesson-checkpoint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body(revision, stepIndex)),
      });
    // Revision 5 (the newer, real state) is sent FIRST but asked to
    // resolve slower isn't controllable client-side, so instead: send
    // revision 1 (stale) and revision 5 (current) concurrently, then
    // immediately re-send revision 1 again — proving a stale revision
    // arriving *after* a newer one is already stored still gets rejected.
    await Promise.all([post(1, 0), post(5, 3)]);
    const late = await post(1, 0);
    return late.status;
  });
  expect(result).toBe(200); // the request itself succeeds — it's just a no-op "stale" skip, never an error

  const userId = dbHelper("get-user-id", { email });
  const checkpointJson = dbHelper("get-lesson-checkpoint", { userId, lessonId: "meet-the-pieces.01-welcome" });
  expect(checkpointJson).not.toBe("");
  // Revision 5's state must be what's stored — never regressed by
  // revision 1 arriving concurrently or afterward.
  expect(JSON.parse(checkpointJson).stepIndex).toBe(3);
  expect(JSON.parse(checkpointJson).revision).toBe(5);
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
