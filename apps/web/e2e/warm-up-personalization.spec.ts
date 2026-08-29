import { test, expect } from "./fixtures";

/** Same verified-legal move sequence as e2e/placement.spec.ts's ALL_CORRECT_MOVES — answering every placement item correctly. */
const ALL_CORRECT_MOVES: { from: string; to: string }[] = [
  { from: "d1", to: "d3" },
  { from: "c1", to: "h6" },
  { from: "d4", to: "g1" },
  { from: "b1", to: "d2" },
  { from: "e5", to: "e8" },
  { from: "e1", to: "e8" },
  { from: "b1", to: "c3" },
  { from: "c4", to: "e5" },
  { from: "e1", to: "g1" },
  { from: "f1", to: "f3" },
  { from: "d1", to: "g4" },
  { from: "g1", to: "f3" },
  { from: "h2", to: "h3" },
  { from: "e5", to: "f6" },
];

/**
 * P0 "personalize the Daily Warm-up" — the exact "rated learner's Daily
 * Warm-up isn't elementary king movement" requirement from the 16 named
 * E2E journeys. Before this fix, /practice/warm-up always served
 * meet-the-pieces' board-basics king-move puzzles (verified in
 * practice-fresh-user.spec.ts, which still checks that behavior for a
 * genuinely fresh learner) — this checks the other half: once a
 * placement result demonstrates the whole curriculum, warm-up content
 * changes to match.
 */
test("a rated player who aced the placement assessment gets a tactics-level Daily Warm-up, not king-movement puzzles @smoke", async ({
  page,
}) => {
  await page.goto("/placement");
  for (const { from, to } of ALL_CORRECT_MOVES) {
    await page.locator(`[aria-label*="${from},"]`).click();
    await page.locator(`[aria-label*="${to},"]`).click();
    await expect(page.getByText(/^Correct!/)).toBeVisible();
    await page.getByRole("button", { name: /Continue|See my result/ }).click();
  }
  await expect(page.getByRole("heading", { name: /Placement result: Advanced/ })).toBeVisible();

  await page.goto("/practice/warm-up");
  await expect(page.getByText("Puzzle 1/")).toBeVisible();

  // Real, confirmed bug this fixes: this used to always be
  // "Move your king one square toward the center of the board — onto
  // b2." regardless of level. A learner who tested all the way into
  // basic-tactics should see basic-tactics-level content instead.
  await expect(page.getByText(/Move your king one square toward the center/)).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Warm-up difficulty" })).toBeVisible();
});

test("a fresh guest's warm-up defaults to Easy, and the manual difficulty controls always work", async ({ page }) => {
  await page.goto("/practice/warm-up");
  await expect(page.getByText("Puzzle 1/2")).toBeVisible();
  await expect(page.getByRole("button", { name: "Easy", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Too easy" }).click();
  await expect(page.getByRole("button", { name: "Medium", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Hard", exact: true }).click();
  await expect(page.getByRole("button", { name: "Hard", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Too hard" }).click();
  await expect(page.getByRole("button", { name: "Medium", exact: true })).toHaveAttribute("aria-pressed", "true");

  // The preference persists across a reload — a real, per-device
  // setting, not a value that resets every visit.
  await page.reload();
  await expect(page.getByRole("button", { name: "Medium", exact: true })).toHaveAttribute("aria-pressed", "true");
});
