import { test, expect } from "./fixtures";

test("play as White: engine replies to a played move @smoke", async ({ page }) => {
  await page.goto("/play");
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 15_000 });

  await page.locator('[aria-label*="e2,"]').click();
  await page.locator('[aria-label*="e4,"]').click();
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 20_000 });

  // A black pawn should have advanced onto rank 4-6 as the engine's reply.
  const blackPawnAdvanced = await page
    .locator('[aria-label*="4, black pawn"], [aria-label*="5, black pawn"], [aria-label*="6, black pawn"]')
    .count();
  expect(blackPawnAdvanced).toBeGreaterThan(0);
});

test("play as Black: engine plays White's opening move automatically", async ({ page }) => {
  await page.goto("/play");
  await page.getByRole("group", { name: "Choose your side" }).getByRole("button", { name: "Black" }).click();
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 20_000 });

  const whitePawnAdvanced = await page
    .locator('[aria-label*="3, white pawn"], [aria-label*="4, white pawn"]')
    .count();
  expect(whitePawnAdvanced).toBeGreaterThan(0);
});

test("game review and lesson recommendations unlock only after the game ends, and are a real analysis even for a guest", async ({
  page,
}) => {
  // Real bug this test guards against: a guest who resigned a real game
  // previously saw "Review this game (demo)" — clicking it substituted
  // an unrelated fixed Scholar's Mate sample, never the game they
  // actually played. Real analysis (Stockfish-in-Worker, already
  // entirely client-side) needs no account to compute — only
  // saveGameAnalysisAction's persistence step did, and guests now use
  // the stateless buildGuestGameReviewAction counterpart instead.
  await page.goto("/play");
  // Before the game ends, review/recommendations are explicitly locked —
  // never implied as already-available real analysis.
  await expect(page.getByText(/Locked/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Analyze this game" })).toHaveCount(0);

  await page.getByRole("button", { name: "Resign" }).click();
  await expect(page.getByText(/You resigned/)).toBeVisible();

  await page.getByRole("button", { name: "Analyze this game" }).click();
  await expect(page.getByRole("heading", { name: "2. Review the game" })).toBeVisible({ timeout: 60_000 });
  // Never the demo — this is the guest's own real, just-played game.
  await expect(page.getByText("DEMO")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "2. Review the game (sample)" })).toHaveCount(0);

  await expect(page.getByRole("heading", { name: "3. Recommended lessons" })).toBeVisible();
  // A recommendation only appears when the real engine actually flags a
  // mistake with a mapped concept — not guaranteed from one opening move
  // against a live opponent (unlike the old fixed demo data), so this is
  // checked when present rather than forced, matching play-analysis.spec.ts's
  // own retry-button pattern for the same reason.
  const recommendation = page.locator(".mw-game-review-rec-link").first();
  if ((await recommendation.count()) > 0) {
    await recommendation.click();
    await expect(page).toHaveURL(/\/learn\//);
  }
});
