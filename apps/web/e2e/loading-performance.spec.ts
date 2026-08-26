import { test, expect, allowExpectedConsoleError } from "./fixtures";

/**
 * P1-F: real reproduction was "lesson navigation left the old page
 * visible for ~2s, then 'Loading Stockfish…' for ~6s with no further
 * feedback." Covers the three concrete fixes:
 *  - Route-level loading.tsx skeletons (Next.js's own convention) so a
 *    navigation shows immediate feedback instead of a stale previous page.
 *  - A shared, warm Stockfish Worker (useStockfishEngine.ts) reused
 *    across Stockfish-using views instead of rebuilt from scratch every
 *    time — the ~6s cost only paid once per session, not once per view.
 *  - A real, retryable error instead of spinning forever when the
 *    worker script genuinely fails to load.
 */

test("Stockfish stays warm across a quick return to Play mode — no repeated cold load", async ({ page }) => {
  await page.goto("/play");
  // Cold: generous budget, this is the one real ~6s-class load.
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 15_000 });

  await page.goto("/");
  await page.goto("/play");
  // Warm: the shared engine instance is reused, so this should be ready
  // almost immediately — a much tighter budget than the cold case above
  // proves the cache is doing real work, not just "eventually works."
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 2_000 });
});

test("a Stockfish load failure shows a retryable error, and retrying actually recovers", async ({ page }) => {
  let blockWorker = true;
  await page.route("**/engine/stockfish-18-lite-single.js", (route) => {
    if (blockWorker) route.abort("failed");
    else route.continue();
  });
  allowExpectedConsoleError(page, /ERR_FAILED/);

  await page.goto("/play");
  await expect(page.getByText("Couldn't load the Stockfish engine.")).toBeVisible({ timeout: 10_000 });
  const retryButton = page.getByRole("button", { name: "Try again" });
  await expect(retryButton).toBeVisible();

  blockWorker = false;
  await retryButton.click();
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 15_000 });
});

test("navigating to a lesson shows an immediate loading skeleton, not the previous page lingering", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Skip for now" }).click(); // dismiss the fresh-guest onboarding quiz first

  // Slow down the lesson route's own data just enough to reliably
  // observe the skeleton before the real page replaces it — a network
  // throttle, not a mock, so this is the same loading.tsx Next.js would
  // actually show on a slower real connection.
  const client = await page.context().newCDPSession(page);
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    downloadThroughput: (50 * 1024) / 8,
    uploadThroughput: (50 * 1024) / 8,
    latency: 200,
  });

  await page.getByRole("link", { name: /Welcome to the chessboard/ }).click();
  await expect(page.getByRole("status", { name: "Loading lesson" })).toBeVisible();

  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    downloadThroughput: -1,
    uploadThroughput: -1,
    latency: 0,
  });
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible({ timeout: 15_000 });
});
