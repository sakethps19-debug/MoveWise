import { test, expect, allowExpectedConsoleError } from "./fixtures";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Regression coverage for a real bug found during manual review: on the
 * final step of a lesson, `LessonRunner.advance()` called `onComplete`
 * (`completeLessonAction`, a real network request for a signed-in
 * learner) without awaiting it or handling a failure, then
 * unconditionally rendered the "Lesson complete!" success screen —
 * real star count, real "+N XP" — regardless of whether that request
 * actually succeeded. A dropped connection or a failed write meant the
 * learner saw a false success with nothing persisted, no error, and no
 * way to know their progress was actually lost until they later found
 * the lesson still locked or incomplete with no explanation. Fixed by
 * awaiting the request and only showing success once it's confirmed,
 * with a real, retryable error screen otherwise (see LessonRunner.tsx's
 * `saving`/`saveError` states).
 *
 * Reproduced here with a real aborted network request
 * (`page.route(...).abort()`), not a mock — the same mechanism a
 * genuinely dropped connection would trigger.
 */

const DB_HELPER = path.join(__dirname, "db-helper.mjs");

function dbHelper(command: string, args: Record<string, unknown> = {}): string {
  return execFileSync("node", [DB_HELPER, command, JSON.stringify(args)], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf-8",
  });
}

test("a dropped connection while completing a lesson shows a real, retryable error — never a false success screen", async ({
  page,
}) => {
  const email = `netfail${Date.now()}@example.com`;
  const password = "password123";
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  const userId = dbHelper("get-user-id", { email });

  await page.goto("/learn/meet-the-pieces.01-welcome");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="e1,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="e8,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "False" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // The browser itself logs an aborted request as a console.error
  // (`net::ERR_FAILED`) — expected here, since aborting it is the whole
  // point of this test, not a genuine defect the console-error guard
  // (fixtures.ts) should fail on.
  allowExpectedConsoleError(page, /ERR_FAILED/);

  // Abort exactly the one POST that completing the lesson fires (the
  // Server Action invocation), then let everything after it through —
  // a real, one-time dropped connection, not a permanently broken app.
  let aborted = false;
  await page.route("**/*", (route) => {
    if (!aborted && route.request().method() === "POST") {
      aborted = true;
      route.abort("failed");
    } else {
      route.continue();
    }
  });

  await page.getByRole("button", { name: "Complete unit" }).click();

  // The real bug: this used to render "Lesson complete!" (with a real
  // star count and XP) unconditionally. It must not, here.
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Couldn't save your progress" })).toBeVisible();
  await expect(page.locator('p[role="alert"]')).toContainText("connection may have dropped");

  // Not just a UI claim — nothing was actually written.
  expect(
    Number(dbHelper("count-completions", { userId, lessonId: "meet-the-pieces.01-welcome" })),
    "no LessonCompletion row should exist after a failed save",
  ).toBe(0);

  // Retry — the network is no longer intercepted, so this one succeeds.
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();
  await expect(page.getByText("+30 XP", { exact: true })).toBeVisible();

  expect(
    Number(dbHelper("count-completions", { userId, lessonId: "meet-the-pieces.01-welcome" })),
    "exactly one LessonCompletion row should exist after the successful retry",
  ).toBe(1);
});

/**
 * The same fire-and-forget-Server-Action pattern existed in
 * PuzzleRunner.tsx's `onAttempt` call (recordPuzzleAttemptAction) — same
 * root cause, different consequence. Here the puzzle's Correct/Not-quite
 * feedback is decided entirely client-side (chess-legality check, no
 * network round-trip) and correctly doesn't wait on `onAttempt`, so
 * there's no false-success screen to reproduce. What was silent instead:
 * a dropped connection meant the ExerciseAttempt row (and the
 * UserConceptMastery signal it feeds) was lost with no indication at
 * all. Fixed by surfacing a real, visible notice on failure — still not
 * blocking the puzzle flow, since that correctness feedback is real and
 * shouldn't wait on a background write.
 */
test("a dropped connection while solving a puzzle doesn't silently lose progress — a real notice appears", async ({
  page,
}) => {
  const email = `netfailpuzzle${Date.now()}@example.com`;
  const password = "password123";
  dbHelper("create-user", { email, password });
  const userId = dbHelper("get-user-id", { email });
  dbHelper("seed-completions", { userId, lessonIds: ["check-and-checkmate.01-what-is-check"] });

  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  const attemptsBefore = (
    JSON.parse(dbHelper("count-progress", { userId })) as { attempts: number }
  ).attempts;

  await page.goto("/practice/check-and-checkmate.recognizing-check");
  await expect(page.getByText("Puzzle 1/2")).toBeVisible();

  allowExpectedConsoleError(page, /ERR_FAILED/);
  let aborted = false;
  await page.route("**/*", (route) => {
    if (!aborted && route.request().method() === "POST") {
      aborted = true;
      route.abort("failed");
    } else {
      route.continue();
    }
  });

  // rook h1 -> h8 delivers check — the puzzle's real correct answer.
  await page.locator('[aria-label*="h1,"]').click();
  await page.locator('[aria-label*="h8,"]').click();

  // The correctness feedback is real and immediate — not blocked by the
  // failed background save.
  await expect(page.getByText(/^Correct!/)).toBeVisible();
  // But the learner is told the save may not have gone through, unlike
  // before this fix (nothing at all used to indicate it).
  await expect(page.locator('p[role="alert"]')).toContainText("progress on this puzzle set may not be saving");

  const attemptsAfter = (
    JSON.parse(dbHelper("count-progress", { userId })) as { attempts: number }
  ).attempts;
  expect(attemptsAfter, "the aborted attempt must not have been recorded").toBe(attemptsBefore);
});

/**
 * A third instance of the same root cause, in PlayRunner.tsx: the
 * completed-game save (`saveCompletedGameAction`) was fired with
 * `.then()` but no `.catch()`. On failure, `gameId` simply never got
 * set — "Analyze this game" stayed silently, permanently disabled, with
 * no error and no way to retry. Fixed the same way as the other two:
 * a real, visible, retryable error instead of silence.
 */
test("a dropped connection while saving a completed game shows a real, retryable error, not a permanently disabled Analyze button", async ({
  page,
}) => {
  const email = `netfailplay${Date.now()}@example.com`;
  const password = "password123";
  dbHelper("create-user", { email, password });

  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  await page.goto("/play");
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 15_000 });

  allowExpectedConsoleError(page, /ERR_FAILED/);
  let aborted = false;
  await page.route("**/*", (route) => {
    if (!aborted && route.request().method() === "POST") {
      aborted = true;
      route.abort("failed");
    } else {
      route.continue();
    }
  });

  await page.locator('[aria-label*="e2,"]').click();
  await page.locator('[aria-label*="e4,"]').click();
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 20_000 });
  await page.getByRole("button", { name: "Resign" }).click();
  await expect(page.getByText(/You resigned/)).toBeVisible();

  await expect(page.getByText(/couldn't be saved/)).toBeVisible();
  const analyzeButton = page.getByRole("button", { name: "Analyze this game" });
  await expect(analyzeButton).toBeDisabled();

  // Network is no longer intercepted — retry succeeds.
  await page.getByRole("button", { name: "Try saving again" }).click();
  await expect(page.getByText(/couldn't be saved/)).toHaveCount(0);
  await expect(analyzeButton).toBeEnabled();
});
