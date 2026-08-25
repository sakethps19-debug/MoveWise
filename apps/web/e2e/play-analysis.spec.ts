import { test, expect } from "./fixtures";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * ADR-0008 Phase B's real (non-demo) post-game analysis: a signed-in
 * learner's completed game is persisted, then "Analyze this game" runs a
 * genuine engine-driven review (lib/moveClassification.ts,
 * lib/conceptDetection.ts, lib/studyPlanRanking.ts) instead of the
 * clearly-labeled demo guests still see. The classification/concept-
 * detection/ranking decision logic itself is already exhaustively unit
 * tested with deterministic synthetic data (moveClassification.test.ts,
 * conceptDetection.test.ts, studyPlanRanking.test.ts, gameResult.test.ts)
 * — this file is about the *delivery* (real engine calls happen, a real
 * DB row lands, the real UI renders), the same "test the mechanism, not
 * re-derive the logic" split this session's other E2E specs already use.
 *
 * A real account is created directly via db-helper.mjs and logged in via
 * /login rather than /signup, drawing from the login rate-limit budget
 * instead of signupAction's shared one (see remediation.spec.ts's own
 * note on the same constraint).
 */

const DB_HELPER = path.join(__dirname, "db-helper.mjs");

function dbHelper(command: string, args: Record<string, unknown> = {}): string {
  return execFileSync("node", [DB_HELPER, command, JSON.stringify(args)], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf-8",
  });
}

test("real game analysis: play a short game, analyze it, verify real data lands and renders", async ({ page }) => {
  const email = `playanalysis${Date.now()}@example.com`;
  const password = "password123";
  dbHelper("create-user", { email, password });

  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  await page.goto("/play");
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 15_000 });

  // One real move each side, then resign — keeps the analysis pass
  // (2 real engine calls per ply) short without needing the game to run
  // to a natural conclusion.
  await page.locator('[aria-label*="e2,"]').click();
  await page.locator('[aria-label*="e4,"]').click();
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 20_000 });
  await page.getByRole("button", { name: "Resign" }).click();
  await expect(page.getByText(/You resigned/)).toBeVisible();

  // Signed-in learners get the real analysis entry point, not the demo one.
  await expect(page.getByRole("button", { name: "Review this game (demo)" })).toHaveCount(0);
  const analyzeButton = page.getByRole("button", { name: "Analyze this game" });
  await expect(analyzeButton).toBeVisible();
  await analyzeButton.click();

  // Real engine calls — depth 10, 2 plies, allow real wall-clock time.
  await expect(page.getByRole("heading", { name: "2. Review the game" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("DEMO")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "3. Recommended lessons" })).toBeVisible();

  const userId = dbHelper("get-user-id", { email });
  expect(dbHelper("count-games", { userId })).toBe("1");
  const gameId = dbHelper("get-latest-game-id", { userId });
  expect(gameId).not.toBe("");
  const moveAnalysisCount = Number(dbHelper("count-move-analysis", { gameId }));
  expect(moveAnalysisCount).toBe(2); // White's e4 + the engine's one reply

  // Retry-position UI (docs/testing-strategy.md row 8) is only offered
  // for a mistake/blunder move — not guaranteed to appear against a real,
  // live engine opponent (unlike authored puzzle content, the engine's
  // actual reply can't be scripted the way a fixed FEN can), so this is
  // checked when present rather than forced. The retry mechanics
  // themselves aren't re-proven here — they're the same board-interaction
  // pattern PuzzleRunner already has E2E coverage for; this just confirms
  // the entry point renders and opens when real data actually has one.
  const retryButton = page.getByRole("button", { name: "Retry" }).first();
  if ((await retryButton.count()) > 0) {
    await retryButton.click();
    await expect(page.getByRole("region", { name: "Retry this position" })).toBeVisible();
  }
});

test("a guest still sees the labeled demo, never the real analysis entry point", async ({ page }) => {
  await page.goto("/play");
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 15_000 });
  await page.getByRole("button", { name: "Resign" }).click();
  await expect(page.getByText(/You resigned/)).toBeVisible();

  await expect(page.getByRole("button", { name: "Analyze this game" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review this game (demo)" })).toBeVisible();
});
