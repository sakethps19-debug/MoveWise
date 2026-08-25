import { test, expect, devices, watchForConsoleErrors } from "./fixtures";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Real touch-event coverage (`.tap()`, real device viewport + `hasTouch`),
 * not just a resized mouse-driven viewport, for the two chessboard
 * surfaces move-piece-alt-valid.spec.ts doesn't reach: Play mode (a
 * freeform game against Stockfish) and the puzzle pool (Practice hub).
 * responsive.spec.ts/chessboard-geometry.spec.ts already prove these
 * pages don't overflow or misrender their layout at tablet/mobile
 * widths; this file proves a learner can actually *play* on those
 * devices — tap a piece, tap a destination, get real feedback — the
 * primary use case this project is built for per the product brief (the
 * user works from an iPad).
 */

const DB_HELPER = path.join(__dirname, "db-helper.mjs");

function dbHelper(command: string, args: Record<string, unknown> = {}): string {
  return execFileSync("node", [DB_HELPER, command, JSON.stringify(args)], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf-8",
  });
}

test("iPad landscape touch: Play mode — tap a pawn move and the engine replies", async ({ browser }) => {
  const context = await browser.newContext({ ...devices["iPad (gen 7) landscape"] });
  const page = await context.newPage();
  const checkConsole = watchForConsoleErrors(page);

  await page.goto("/play");
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 15_000 });

  await page.locator('[aria-label*="e2,"]').tap();
  await page.locator('[aria-label*="e4,"]').tap();
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 20_000 });

  const blackPawnAdvanced = await page
    .locator('[aria-label*="4, black pawn"], [aria-label*="5, black pawn"], [aria-label*="6, black pawn"]')
    .count();
  expect(blackPawnAdvanced, "the engine's reply should have advanced a black pawn onto rank 4-6").toBeGreaterThan(0);

  checkConsole();
  await context.close();
});

test("mobile touch (iPhone 14): Play mode as Black — board is usable and the engine opens", async ({ browser }) => {
  const context = await browser.newContext({ ...devices["iPhone 14"] });
  const page = await context.newPage();
  const checkConsole = watchForConsoleErrors(page);

  await page.goto("/play");
  await page.getByRole("group", { name: "Choose your side" }).getByRole("button", { name: "Black" }).tap();
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 20_000 });

  const whitePawnAdvanced = await page
    .locator('[aria-label*="3, white pawn"], [aria-label*="4, white pawn"]')
    .count();
  expect(whitePawnAdvanced, "White's automatic opening move should have advanced a pawn onto rank 3-4").toBeGreaterThan(0);

  checkConsole();
  await context.close();
});

test("iPad portrait touch: solving a puzzle by tap records real progress", async ({ browser }) => {
  const email = `ipadpuzzle${Date.now()}@example.com`;
  const password = "password123";
  dbHelper("create-user", { email, password });
  const userId = dbHelper("get-user-id", { email });
  // check-and-checkmate.recognizing-check unlocks with just its one
  // sub-lesson done — the shortest path to a reachable puzzle pool
  // (see puzzle-practice.spec.ts for why this lesson id specifically).
  dbHelper("seed-completions", { userId, lessonIds: ["check-and-checkmate.01-what-is-check"] });

  const context = await browser.newContext({ ...devices["iPad (gen 7)"] });
  const page = await context.newPage();
  const checkConsole = watchForConsoleErrors(page);

  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.getByRole("button", { name: "Sign in" }).tap();
  await page.waitForURL("/");

  await page.goto("/practice/check-and-checkmate.recognizing-check");
  await expect(page.getByText("Puzzle 1/2")).toBeVisible();

  // Wrong move first (a legal rook move that doesn't deliver check) — the
  // touch board must reject it the same way the mouse-driven board does.
  await page.locator('[aria-label*="h1,"]').tap();
  await page.locator('[aria-label*="h5,"]').tap();
  await expect(page.getByText(/^Not quite\./)).toBeVisible();
  await expect(page.getByText("Puzzle 1/2")).toBeVisible();

  // rook h1 -> h8 delivers check — the puzzle's real correct answer.
  await page.locator('[aria-label*="h1,"]').tap();
  await page.locator('[aria-label*="h8,"]').tap();
  await expect(page.getByText(/^Correct!/)).toBeVisible();

  checkConsole();
  await context.close();
});
