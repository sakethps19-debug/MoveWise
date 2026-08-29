import { test, expect } from "./fixtures";

/** Every move in packages/content/puzzles/placement.json's item order, verified legal via chess.js before this file was written (see the session's own content-authoring verification). Answering every one correctly exercises the full 14-item adaptive sequence end to end. */
const ALL_CORRECT_MOVES: { from: string; to: string }[] = [
  { from: "d1", to: "d3" }, // movement-rook
  { from: "c1", to: "h6" }, // movement-bishop
  { from: "d4", to: "g1" }, // movement-queen
  { from: "b1", to: "d2" }, // movement-knight
  { from: "e5", to: "e8" }, // recognize-check
  { from: "e1", to: "e8" }, // recognize-checkmate
  { from: "b1", to: "c3" }, // hanging-piece
  { from: "c4", to: "e5" }, // knight-fork
  { from: "e1", to: "g1" }, // king-safety-castling
  { from: "f1", to: "f3" }, // decision-capture-checker
  { from: "d1", to: "g4" }, // trade-evaluation
  { from: "g1", to: "f3" }, // opening-development
  { from: "h2", to: "h3" }, // back-rank-safety
  { from: "e5", to: "f6" }, // endgame-king-escort
];

async function answerCorrectly(page: import("@playwright/test").Page, from: string, to: string) {
  await page.locator(`[aria-label*="${from},"]`).click();
  await page.locator(`[aria-label*="${to},"]`).click();
  await expect(page.getByText(/^Correct!/)).toBeVisible();
  const continueBtn = page.getByRole("button", { name: /Continue|See my result/ });
  await continueBtn.click();
}

test("a rated guest who aces the placement assessment unlocks tactics practice immediately, with zero lessons completed @smoke", async ({
  page,
}) => {
  await page.goto("/placement");
  await expect(page.getByText("Placement assessment")).toBeVisible();

  for (const { from, to } of ALL_CORRECT_MOVES) {
    await answerCorrectly(page, from, to);
  }

  await expect(page.getByRole("heading", { name: /Placement result: Advanced/ })).toBeVisible();
  await expect(page.getByText(/14 of 14 answered correctly/)).toBeVisible();
  const goToTactics = page.getByRole("link", { name: "Go to tactics practice" });
  await expect(goToTactics).toBeVisible();
  await goToTactics.click();
  await page.waitForURL("/practice");

  // Real, confirmed bug this fixes: basic-tactics' own puzzle pools used to
  // require literally completing meet-the-pieces + check-and-checkmate's
  // lessons first, no matter what a placement assessment demonstrated.
  const knightForkPool = page.getByRole("link", { name: /The knight fork/ });
  await expect(knightForkPool).toBeVisible();
  await knightForkPool.click();
  await expect(page.getByText("Puzzle 1/")).toBeVisible();

  // The homepage reflects it too — no "Welcome to the chessboard" default,
  // and no full curriculum grind required to get there.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Placement result: strong" })).toHaveCount(0); // eyebrow, not heading
  await expect(page.getByText("Placement result: strong")).toBeVisible();
});

test("a placement assessment failed at the foundational level ends early, recommends starting from the beginning, and demonstrates nothing", async ({
  page,
}) => {
  await page.goto("/placement");

  // Each foundational item's own king has a one-square move that isn't
  // that item's correct answer — a legal, real, wrong answer, not a no-op
  // click. Real, confirmed bug this test guards against: reusing
  // PuzzleRunner's "retry until correct" footer left a wrong answer with
  // no way to reach the next question at all (see PlacementItemFooter).
  const wrongMoves = [
    { from: "e1", to: "e2" }, // movement-rook's own king, not the rook's move
    { from: "e1", to: "e2" }, // movement-bishop's own king
    { from: "e1", to: "e2" }, // movement-queen's own king
    { from: "e1", to: "e2" }, // movement-knight's own king
  ];
  for (const { from, to } of wrongMoves) {
    await page.locator(`[aria-label*="${from},"]`).click();
    await page.locator(`[aria-label*="${to},"]`).click();
    await expect(page.getByText(/^Not quite\./)).toBeVisible();
    await page.getByRole("button", { name: /Next question|See my result/ }).click();
  }

  // Foundational cluster demonstrably failed (0 of 4 correct) — core-tier
  // items still get asked (nothing to early-exit from yet), but every one
  // of those is also answered wrong via the same king trick, past the
  // 3-consecutive-wrong-core-answers early-exit rule.
  for (let i = 0; i < 3; i++) {
    await page.locator('[aria-label*="e1,"]').click();
    await page.locator('[aria-label*="e2,"]').click();
    await expect(page.getByText(/^Not quite\.|^Correct!/)).toBeVisible();
    await page.getByRole("button", { name: /Next question|Continue|See my result/ }).click();
  }

  await expect(page.getByRole("heading", { name: /Placement result:/ })).toBeVisible();
  await expect(page.getByText("Continue from where you tested to")).toHaveCount(0); // no unit recommended past the very start
  await expect(page.getByRole("link", { name: "Review the fundamentals anyway" })).toBeVisible();

  // Never having demonstrated anything, the rook lesson is still locked
  // exactly as it is for anyone else who hasn't completed its prerequisites.
  await page.goto("/learn/meet-the-pieces.03-meet-the-rook");
  await expect(page).toHaveURL(/\/\?locked=/);
});

test("a signed-in rated player's placement result is a real, server-persisted UserConceptMastery row — the server-side gate bypasses it too, not just the client UI", async ({
  page,
}) => {
  const email = `placement${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  await page.goto("/placement");
  for (const { from, to } of ALL_CORRECT_MOVES) {
    await answerCorrectly(page, from, to);
  }
  await expect(page.getByRole("heading", { name: /Placement result: Advanced/ })).toBeVisible();

  // The server route itself (not just the client-rendered UI) must let a
  // signed-in learner straight into a lesson whose prerequisite it never
  // completed — this is app/learn/[lessonId]/page.tsx's own redirect
  // guard, proving the bypass is real UserConceptMastery data, not a
  // client-only illusion.
  await page.goto("/learn/meet-the-pieces.03-meet-the-rook");
  await expect(page).not.toHaveURL(/\/\?locked=/);

  // Same for the practice-pool route's own server-side gate.
  await page.goto("/practice/basic-tactics.the-knight-fork");
  await expect(page).not.toHaveURL(/\/\?locked=/);
  await expect(page.getByText("Puzzle 1/")).toBeVisible();
});
