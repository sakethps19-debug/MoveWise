import { test, expect } from "./fixtures";
import { gotoGuestLesson } from "./testHelpers";
import { execFileSync } from "node:child_process";
import path from "node:path";

const DB_HELPER = path.join(__dirname, "db-helper.mjs");

function dbHelper(command: string, args: Record<string, unknown> = {}): string {
  return execFileSync("node", [DB_HELPER, command, JSON.stringify(args)], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf-8",
  });
}

function uniqueEmail(prefix: string) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
}

/**
 * Coverage for the new Tactical Vision unit (packages/content/units/tactical-vision).
 * Two things this file establishes that nothing else does:
 *  - tactical-vision.01 is reachable once basic-tactics' terminal lesson
 *    (basic-tactics.05-the-opposition, the cross-unit prerequisite
 *    scripts/validate-content.ts enforces) is done, and its full exercise
 *    mix (explain/true-false/mcq/move-piece/capture/review) plays through
 *    for real.
 *  - the find-checkmate step type — used here for the first time outside
 *    the schema/validator itself — actually renders and grades correctly
 *    in the real LessonRunner UI, via tactical-vision.09's two back-rank
 *    mate exercises.
 */

test("tactical vision: checks, captures, and threats plays through end-to-end", async ({ page }) => {
  await gotoGuestLesson(page, "tactical-vision.01-checks-captures-and-threats");

  // step-1: explain
  await page.getByRole("button", { name: "Continue" }).click();

  // step-2: true-false, correct=false
  await page.getByRole("button", { name: "False" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-3: mcq, correctIndex=1
  await page.getByRole("button", { name: /All three/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-4: move-piece, expectedMoves=['a1a8'] — a check hiding in a quiet position
  await page.locator('[aria-label*="a1,"]').click();
  await page.locator('[aria-label*="a8,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-5: capture, expectedMoves=['b2h8']
  await page.locator('[aria-label*="b2,"]').click();
  await page.locator('[aria-label*="h8,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-6: move-piece, expectedMoves=['h4a4'] — a quiet threat, no check or capture
  await page.locator('[aria-label*="h4,"]').click();
  await page.locator('[aria-label*="a4,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-7: mcq, correctIndex=1
  await page.getByRole("button", { name: /Compare what each move actually accomplishes/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-8: review (last step)
  await page.getByRole("button", { name: "Finish lesson" }).click();
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();
});

test("tactical vision: back-rank tactics delivers checkmate with find-checkmate steps", async ({ page }) => {
  await gotoGuestLesson(page, "tactical-vision.09-back-rank-tactics");

  // step-1: explain
  await page.getByRole("button", { name: "Continue" }).click();

  // step-2: true-false, correct=false
  await page.getByRole("button", { name: "False" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-3: mcq, correctIndex=1
  await page.getByRole("button", { name: /Push a pawn to give your king an escape square/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-4: find-checkmate, correctSquares=['e8'] — rook delivers back-rank mate
  await page.locator('[aria-label*="e8,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-5: move-piece luft, expectedMoves=['h2h3']
  await page.locator('[aria-label*="h2,"]').click();
  await page.locator('[aria-label*="h3,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-6: capture, expectedMoves=['a5d8']
  await page.locator('[aria-label*="a5,"]').click();
  await page.locator('[aria-label*="d8,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-7: find-checkmate, correctSquares=['c8','g8'] — queen delivers mate from either side
  await page.locator('[aria-label*="c8,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-8: mcq, correctIndex=1
  await page.getByRole("button", { name: /Whether the king would actually have zero escape squares/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-9: review (last step)
  await page.getByRole("button", { name: "Finish lesson" }).click();
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();
});

test("tactical vision: a signed-in account can reach and complete lesson 1 after finishing basic-tactics, with real XP persisted", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const email = uniqueEmail("tacticalvision");
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  const userId = dbHelper("get-user-id", { email });

  // Seed every prior unit as completed — those units' own mechanics are
  // covered elsewhere (cross-unit-progression.spec.ts, lessons.spec.ts);
  // what this test needs from them is only that they're done, so
  // tactical-vision.01's real cross-unit prerequisite
  // (basic-tactics.05-the-opposition) is genuinely satisfied.
  dbHelper("seed-completions", {
    userId,
    lessonIds: [
      "meet-the-pieces.01-welcome",
      "meet-the-pieces.02-ranks-files-squares",
      "meet-the-pieces.03-meet-the-rook",
      "meet-the-pieces.04-rook-captures",
      "meet-the-pieces.05-meet-the-bishop",
      "meet-the-pieces.06-bishop-colours",
      "meet-the-pieces.07-meet-the-queen",
      "meet-the-pieces.08-meet-the-king",
      "meet-the-pieces.09-meet-the-knight",
      "meet-the-pieces.10-meet-the-pawn",
      "meet-the-pieces.11-capturing-piece-values",
      "meet-the-pieces.13-king-safety-and-castling",
      "meet-the-pieces.12-unit-mastery-challenge",
      "check-and-checkmate.01-what-is-check",
      "check-and-checkmate.02-what-is-checkmate",
      "check-and-checkmate.03-thinking-under-check",
      "check-and-checkmate.04-back-rank-safety",
      "basic-tactics.01-the-knight-fork",
      "basic-tactics.02-hanging-pieces",
      "basic-tactics.03-opening-development",
      "basic-tactics.04-is-this-trade-worth-it",
      "basic-tactics.05-the-opposition",
    ],
  });

  // Locked before basic-tactics is done would 302 to /?locked=... — not the
  // case being tested here, since we just seeded it, but confirm the real
  // route loads (not a client-only guest check) for a signed-in account.
  await page.goto("/learn/tactical-vision.01-checks-captures-and-threats");
  await expect(page).toHaveURL("/learn/tactical-vision.01-checks-captures-and-threats");
  await expect(page.getByText("Checks, captures, and threats", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Continue" }).click(); // step-1 explain
  await page.getByRole("button", { name: "False" }).click(); // step-2 true-false
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /All three/ }).click(); // step-3 mcq
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="a1,"]').click(); // step-4 move-piece
  await page.locator('[aria-label*="a8,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="b2,"]').click(); // step-5 capture
  await page.locator('[aria-label*="h8,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="h4,"]').click(); // step-6 move-piece
  await page.locator('[aria-label*="a4,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Compare what each move actually accomplishes/ }).click(); // step-7 mcq
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Finish lesson" }).click(); // step-8 review
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();

  // Real persistence: a fresh DB row exists, and the nav XP total (server-
  // rendered on reload, not a client cache) reflects it.
  const completionCount = dbHelper("count-completions", {
    userId,
    lessonId: "tactical-vision.01-checks-captures-and-threats",
  });
  expect(completionCount).toBe("1");

  await page.getByRole("link", { name: "Back to learning path" }).click();
  await page.waitForURL("/");
  await page.reload();
  await expect(page.locator(".mw-nav-xp-value")).not.toHaveText("0 XP");
});

test("tactical vision unit appears on the learning path after basic-tactics", async ({ page }) => {
  await page.goto("/");
  const { ensureFullCurriculumVisible } = await import("./testHelpers");
  await ensureFullCurriculumVisible(page);
  await expect(page.getByText("Tactical Vision", { exact: true })).toBeVisible();
});
