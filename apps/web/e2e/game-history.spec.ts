import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * The game-history round trip (ADR-0008 Phase B): a completed game was
 * previously only viewable right after playing it — leaving /play lost
 * the analysis entry point entirely, even though `Game`/`GameAnalysis`
 * are real, persisted rows. /play/history lists past games;
 * /play/history/[gameId] either shows a stored analysis (reassembled
 * server-side, no re-run of the engine) or offers to run one for a game
 * left unanalyzed.
 *
 * A real account is created directly via db-helper.mjs and logged in via
 * /login rather than /signup, drawing from the login rate-limit budget
 * instead of signupAction's shared one (see play-analysis.spec.ts's own
 * note on the same constraint).
 */

const DB_HELPER = path.join(__dirname, "db-helper.mjs");

function dbHelper(command: string, args: Record<string, unknown> = {}): string {
  return execFileSync("node", [DB_HELPER, command, JSON.stringify(args)], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf-8",
  });
}

test("game history: an unanalyzed game is listed, can be analyzed from the detail page, and stays cached on revisit", async ({
  page,
}) => {
  const email = `gamehistory${Date.now()}@example.com`;
  const password = "password123";
  dbHelper("create-user", { email, password });

  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  // Play one real move, resign — leave the game *unanalyzed* by going
  // straight to history instead of clicking "Analyze this game" here.
  await page.goto("/play");
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 15_000 });
  await page.locator('[aria-label*="e2,"]').click();
  await page.locator('[aria-label*="e4,"]').click();
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 20_000 });
  await page.getByRole("button", { name: "Resign" }).click();
  await expect(page.getByText(/You resigned/)).toBeVisible();

  await page.getByRole("link", { name: "Past games" }).click();
  await page.waitForURL("/play/history");
  await expect(page.getByText("Not yet analyzed")).toBeVisible();
  await expect(page.getByText(/White · Resigned/)).toBeVisible();

  const userId = dbHelper("get-user-id", { email });
  const gameId = dbHelper("get-latest-game-id", { userId });
  expect(gameId).not.toBe("");
  expect(dbHelper("count-game-analysis", { gameId })).toBe("0");

  await page.getByText(/White · Resigned/).click();
  await page.waitForURL(`/play/history/${gameId}`);

  const analyzeButton = page.getByRole("button", { name: "Analyze this game" });
  await expect(analyzeButton).toBeVisible();
  await analyzeButton.click();

  // Real engine calls — depth 10, 2 plies, allow real wall-clock time.
  await expect(page.getByRole("heading", { name: "2. Review the game" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("DEMO")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "3. Recommended lessons" })).toBeVisible();

  expect(dbHelper("count-game-analysis", { gameId })).toBe("1");
  expect(Number(dbHelper("count-move-analysis", { gameId }))).toBe(2);

  // The list now reflects it as analyzed.
  await page.goto("/play/history");
  await expect(page.getByText("Analyzed", { exact: true })).toBeVisible();
  await expect(page.getByText("Not yet analyzed")).toHaveCount(0);

  // Revisiting the detail page shows the stored review directly — no
  // "Analyze this game" entry point, and no second GameAnalysis row
  // (ADR-0008: "re-viewing an already-analysed game must never re-run
  // the engine").
  await page.goto(`/play/history/${gameId}`);
  await expect(page.getByRole("heading", { name: "2. Review the game" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Analyze this game" })).toHaveCount(0);
  expect(dbHelper("count-game-analysis", { gameId })).toBe("1");
});

test("a guest visiting game history is redirected to Play & Learn", async ({ page }) => {
  await page.goto("/play/history");
  await expect(page).toHaveURL("http://localhost:3000/play");
});
