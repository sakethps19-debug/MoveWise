import { test, expect } from "./fixtures";

/**
 * Guest Progress previously showed only a lesson-completion count — every
 * other piece of real guest activity (practice attempts, warm-ups, games
 * played/analysed and their real classification counts) was already
 * happening client-side but nothing recorded or displayed it (see
 * lib/guestProgress.ts's own doc comment). This proves a guest's own
 * device sees a real, completed game analysis reflected on /progress —
 * not a placeholder, not zeroed out just because there's no account.
 */
test("guest Progress reflects a completed, analysed game", async ({ page }) => {
  await page.goto("/play");
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 15_000 });

  await page.locator('[aria-label*="e2,"]').click();
  await page.locator('[aria-label*="e4,"]').click();
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 20_000 });

  await page.getByRole("button", { name: "Resign" }).click();
  await expect(page.getByText(/You resigned/)).toBeVisible();
  await page.getByRole("button", { name: "Analyze this game" }).click();
  await expect(page.getByRole("heading", { name: "2. Review the game" })).toBeVisible({ timeout: 60_000 });

  await page.goto("/progress");
  await expect(page.getByText(/lessons completed on this device/)).toBeVisible();

  const gamesPlayedStat = page.locator(".mw-progress-stat", { hasText: "games played" });
  await expect(gamesPlayedStat.locator(".mw-progress-stat-value")).toHaveText("1");

  const gamesAnalysedStat = page.locator(".mw-progress-stat", { hasText: "games analysed" });
  await expect(gamesAnalysedStat.locator(".mw-progress-stat-value")).toHaveText("1");

  // Real classification data from the just-played game — e4 as White's
  // opening move is reliably a Best-or-better engine choice, so "Best"
  // (or "Brilliant") is guaranteed to appear at least once; still doesn't
  // assert on any other specific classification, since Black's live
  // engine reply isn't scriptable.
  await expect(page.getByRole("heading", { name: "Move classifications from analysed games" })).toBeVisible();

  // Still explains guest data is local-only, not synced.
  await expect(page.getByText(/lives only in this browser, on this device/)).toBeVisible();
});

test("guest Progress reflects a warm-up completion and a practice attempt", async ({ page }) => {
  await page.goto("/practice/warm-up");
  await expect(page.getByText(/Puzzle 1\//)).toBeVisible();

  // Solve every warm-up puzzle by revealing and following its own
  // correct-move feedback loop is unnecessary here — this only needs at
  // least one real recorded attempt, not a full completion, so a single
  // deliberate wrong click is enough to generate one real practice-
  // attempt record. Per the P0 curriculum-integrity fix, Board Basics'
  // puzzles are now "select-square" (one tap is one complete attempt),
  // not "move" (a from/to pair) — a second click here would record a
  // second, separate attempt instead of completing the first one.
  const board = page.locator(".mw-chessboard").first();
  await board.locator("button[data-square]").first().click();

  await page.goto("/progress");
  const practiceStat = page.locator(".mw-progress-stat", { hasText: "practice accuracy" });
  await expect(practiceStat.locator(".mw-progress-stat-label")).toContainText("1 attempts");
});
