import { test, expect } from "./fixtures";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * P1 "honest short-game review" — real, reproduced production defect:
 * 1.e4 e5 2.Nc3 Nf6 3.Bc4, resigned after only a couple of learner
 * moves, was summarized as "Clean game — no blunders or mistakes, N
 * best-or-better moves" — a confident overall-quality claim from far too
 * small a sample. Below MIN_LEARNER_MOVES_FOR_OVERALL_ASSESSMENT
 * (lib/gameAnalysis.ts), the review must drop every overall
 * accuracy/performance/weakness claim, say so explicitly, explain a
 * resignation separately, and name the opening when it's a real,
 * confident match — never invent one. Per-move analysis (the board,
 * move list, each move's own classification) stays fully available
 * regardless of sample size.
 *
 * Each test plays a fixed, always-legal sequence of White moves (flank
 * pawn pushes and simple development from the starting position — never
 * blockable by anything Stockfish's reply could realistically do in a
 * handful of plies) so the exact learner-move count is deterministic
 * regardless of the engine's own responses.
 */

const DB_HELPER = path.join(__dirname, "db-helper.mjs");

function dbHelper(command: string, args: Record<string, unknown> = {}): string {
  return execFileSync("node", [DB_HELPER, command, JSON.stringify(args)], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf-8",
  });
}

/** Always-legal, collision-safe White moves in order — each pushes a different, previously-untouched pawn/piece so the engine's own replies can never invalidate one. */
const SAFE_MOVES: { from: string; to: string }[] = [
  { from: "e2", to: "e4" },
  { from: "g1", to: "f3" },
  { from: "b1", to: "c3" },
  { from: "a2", to: "a4" },
  { from: "h2", to: "h4" },
  { from: "b2", to: "b4" },
  { from: "g2", to: "g4" },
  { from: "d2", to: "d3" },
];

async function playMovesThenResign(page: import("@playwright/test").Page, moveCount: number) {
  await page.goto("/play");
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 15_000 });

  for (let i = 0; i < moveCount; i++) {
    const { from, to } = SAFE_MOVES[i]!;
    await page.locator(`[aria-label*="${from},"]`).click();
    await page.locator(`[aria-label*="${to},"]`).click();
    await expect(page.getByRole("status")).toContainText("Your move", { timeout: 20_000 });
  }

  await page.getByRole("button", { name: "Resign" }).click();
  await expect(page.getByText(/You resigned/)).toBeVisible();
  await page.getByRole("button", { name: "Analyze this game" }).click();
  await expect(page.getByRole("heading", { name: "2. Review the game" })).toBeVisible({ timeout: 60_000 });
}

test("a 1-move game gets no overall claim — too few moves, resignation explained @smoke", async ({ page }) => {
  const email = `shortgame1${Date.now()}@example.com`;
  const password = "password123";
  dbHelper("create-user", { email, password });
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  await playMovesThenResign(page, 1);

  await expect(page.getByText(/Too few moves \(1\)/)).toBeVisible();
  await expect(page.getByText(/Clean game/)).toHaveCount(0);
  await expect(page.getByText(/ended by resignation/)).toBeVisible();
  // Per-move analysis is still real and present — the honesty banner
  // replaces the aggregate claim, not the whole review. Both the board
  // workspace and the move table render together (an OR selector here
  // now matches both, ambiguously) — .first() just confirms at least one
  // of the real per-move analysis views is actually visible.
  await expect(page.locator(".mw-game-review-table, .mw-review-workspace").first()).toBeVisible();
});

test("the exact reported defect: 2 learner moves then resignation never claims a clean game", async ({ page }) => {
  const email = `shortgame2${Date.now()}@example.com`;
  const password = "password123";
  dbHelper("create-user", { email, password });
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  await playMovesThenResign(page, 2);

  await expect(page.getByText(/Too few moves \(2\)/)).toBeVisible();
  await expect(page.getByText(/Clean game/)).toHaveCount(0);
  await expect(page.getByText(/best-or-better/)).toHaveCount(0);
});

test("a 5-move game (the threshold) gets a real overall summary, not the too-few-moves notice", async ({ page }) => {
  const email = `shortgame5${Date.now()}@example.com`;
  const password = "password123";
  dbHelper("create-user", { email, password });
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  await playMovesThenResign(page, 5);

  await expect(page.getByText(/Too few moves/)).toHaveCount(0);
  // The ordinary summary line always says something real about the game
  // — either "Clean game" or a real problem count, never both, never neither.
  const summary = page.locator(".mw-game-review-summary");
  await expect(summary).toBeVisible();
  await expect(summary).not.toHaveClass(/mw-game-review-summary--short/);
});

test("a sufficient (8-move) game gets the ordinary real summary", async ({ page }) => {
  const email = `shortgame8${Date.now()}@example.com`;
  const password = "password123";
  dbHelper("create-user", { email, password });
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  await playMovesThenResign(page, 8);

  await expect(page.getByText(/Too few moves/)).toHaveCount(0);
  const summary = page.locator(".mw-game-review-summary");
  await expect(summary).not.toHaveClass(/mw-game-review-summary--short/);
});
