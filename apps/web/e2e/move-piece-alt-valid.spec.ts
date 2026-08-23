import { test, expect, devices, watchForConsoleErrors, type Page } from "./fixtures";

/**
 * Regression coverage for a real, confirmed bug: MoveStep.tsx's answer
 * validation only ever checked a step's `expectedMoves`, silently ignoring
 * `altValid` — even though `altValid` is part of the exercise schema
 * (packages/exercise-schema), chess-legality-checked by validate-chess.ts,
 * and documented as covered ("Valid alternative moves", docs/testing-
 * strategy.md). Every "move-piece" step whose prompt allows more than one
 * correct destination (any sliding piece's other directions, a king/knight's
 * other landing squares, a pawn's one- vs two-square first move) authors
 * those alternatives into `altValid` — but the runtime never read it, so a
 * learner tapping one of those squares (highlighted green as a legal
 * destination, and genuinely one of the lesson's own authored correct
 * answers) got a wrong-answer penalty instead. The existing "Meet the rook"
 * e2e coverage never caught this because it only ever exercised the single
 * `expectedMoves` path (e4 -> e8) — this file specifically exercises the
 * `altValid` paths, across every affected piece type, that were broken.
 *
 * Not a coordinate/orientation/touch-hitbox bug: Board.tsx already passes
 * one canonical algebraic square identifier (the same one used to compute
 * both the legal-move highlights and the click handler's argument) straight
 * through, with no separate DOM-offset recalculation. See PlayRunner/Board's
 * `onSquareClick`.
 */

interface AltValidCase {
  lesson: string;
  stepPrompt: string;
  from: string;
  /** One of the step's own `altValid` destinations — previously always rejected. */
  altDestination: string;
  /** A destination genuinely illegal for this piece from `from` — must stay rejected. */
  illegalDestination: string;
  /** "Continue" clicks needed to reach the move-piece step (1 unless earlier explain steps precede it). */
  continuesToReach?: number;
}

const CASES: AltValidCase[] = [
  {
    lesson: "meet-the-pieces.03-meet-the-rook",
    stepPrompt: "Move the rook to a legal destination",
    from: "e4",
    altDestination: "a4",
    illegalDestination: "d5",
  },
  {
    lesson: "meet-the-pieces.05-meet-the-bishop",
    stepPrompt: "Move the bishop as far as it can go",
    from: "e4",
    altDestination: "a8",
    illegalDestination: "e5",
  },
  {
    lesson: "meet-the-pieces.07-meet-the-queen",
    stepPrompt: "Move the queen along any straight line or diagonal",
    from: "e4",
    altDestination: "b1",
    illegalDestination: "d6",
  },
  {
    lesson: "meet-the-pieces.08-meet-the-king",
    stepPrompt: "Move the king exactly one square in any direction",
    from: "e4",
    altDestination: "d4",
    illegalDestination: "c3",
  },
  {
    lesson: "meet-the-pieces.09-meet-the-knight",
    stepPrompt: "Move the knight in an L-shape",
    from: "e4",
    altDestination: "c5",
    illegalDestination: "e5",
    // step-1 and step-2 are both "explain" here (a second one demonstrating
    // the knight's L-shape reach) before step-3's move-piece — every other
    // case in this file has exactly one explain step ahead of its move-piece
    // step, so this is the one outlier.
    continuesToReach: 2,
  },
];

async function enterMoveStep(page: Page, lesson: string, continues = 1) {
  await page.goto(`/learn/${lesson}`);
  for (let i = 0; i < continues; i++) {
    await page.getByRole("button", { name: "Continue" }).click();
  }
}

for (const c of CASES) {
  test(`${c.lesson}: an altValid destination (${c.from}-${c.altDestination}) is accepted, not just the single expectedMoves square`, async ({
    page,
  }) => {
    await enterMoveStep(page, c.lesson, c.continuesToReach ?? 1);
    await expect(page.getByText(c.stepPrompt)).toBeVisible();

    // Full hearts before attempting — the accepted alt-valid move below must
    // not cost one, since it's a genuinely correct answer, not a wrong one.
    await expect(page.getByText("♥♥♥♥♥")).toBeVisible();

    await page.locator(`[aria-label*="${c.from},"]`).click();
    await page.locator(`[aria-label*="${c.altDestination},"]`).click();

    await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
    await expect(page.locator('p[role="alert"]')).toHaveCount(0);
    await expect(page.getByText("♥♥♥♥♥")).toBeVisible();
  });

  test(`${c.lesson}: a genuinely illegal destination (${c.from}-${c.illegalDestination}) is still rejected`, async ({
    page,
  }) => {
    await enterMoveStep(page, c.lesson, c.continuesToReach ?? 1);
    await page.locator(`[aria-label*="${c.from},"]`).click();
    await page.locator(`[aria-label*="${c.illegalDestination},"]`).click();

    await expect(page.locator('p[role="alert"]')).toBeVisible();
    await expect(page.getByText("♥♥♥♥♡")).toBeVisible();
  });
}

test("pawn lesson: the shorter altValid first move (e2-e3) is accepted alongside the two-square expectedMoves", async ({
  page,
}) => {
  await enterMoveStep(page, "meet-the-pieces.10-meet-the-pawn");
  await page.locator('[aria-label*="e2,"]').click();
  await page.locator('[aria-label*="e3,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await expect(page.getByText("♥♥♥♥♥")).toBeVisible();
});

test("every accepted destination (expectedMoves + altValid) was among the squares highlighted as legal — highlighting and validation share one canonical source", async ({
  page,
}) => {
  await enterMoveStep(page, "meet-the-pieces.03-meet-the-rook");
  await page.locator('[aria-label*="e4,"]').click();

  const highlighted = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="gridcell"]'))
      .filter((el) => el.querySelector(".mw-chess-legal-dot, .mw-chess-capture-ring"))
      .map((el) => el.getAttribute("aria-label")!.split(",")[0]),
  );
  // The lesson's own authored correct answers for this step (docs/content):
  // expectedMoves ['e4e8'] + altValid ['e4a4','e4h4','e4e1'].
  for (const dest of ["e8", "a4", "h4", "e1"]) {
    expect(highlighted, `${dest} must be highlighted as a legal destination`).toContain(dest);
  }
});

test("iPad landscape touch: tapping the rook then tapping a highlighted altValid destination is accepted (the exact reported reproduction)", async ({
  browser,
}) => {
  const context = await browser.newContext({ ...devices["iPad (gen 7) landscape"] });
  const page = await context.newPage();
  const checkConsole = watchForConsoleErrors(page);
  await enterMoveStep(page, "meet-the-pieces.03-meet-the-rook");

  await page.locator('[aria-label*="e4,"]').tap();
  await page.locator('[aria-label*="a4,"]').tap();

  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await expect(page.locator('p[role="alert"]')).toHaveCount(0);
  await expect(page.getByText("♥♥♥♥♥")).toBeVisible();
  checkConsole();
  await context.close();
});

test("iPad portrait touch: same altValid tap acceptance", async ({ browser }) => {
  const context = await browser.newContext({ ...devices["iPad (gen 7)"] });
  const page = await context.newPage();
  const checkConsole = watchForConsoleErrors(page);
  await enterMoveStep(page, "meet-the-pieces.03-meet-the-rook");

  await page.locator('[aria-label*="e4,"]').tap();
  await page.locator('[aria-label*="h4,"]').tap();

  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await expect(page.getByText("♥♥♥♥♥")).toBeVisible();
  checkConsole();
  await context.close();
});

test("mobile touch viewport: same altValid tap acceptance", async ({ browser }) => {
  const context = await browser.newContext({ ...devices["iPhone 14"] });
  const page = await context.newPage();
  const checkConsole = watchForConsoleErrors(page);
  await enterMoveStep(page, "meet-the-pieces.03-meet-the-rook");

  await page.locator('[aria-label*="e4,"]').tap();
  await page.locator('[aria-label*="e1,"]').tap();

  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await expect(page.getByText("♥♥♥♥♥")).toBeVisible();
  checkConsole();
  await context.close();
});

test("iPad touch: a diagonal destination is still correctly rejected, not accepted by accident", async ({
  browser,
}) => {
  const context = await browser.newContext({ ...devices["iPad (gen 7) landscape"] });
  const page = await context.newPage();
  const checkConsole = watchForConsoleErrors(page);
  await enterMoveStep(page, "meet-the-pieces.03-meet-the-rook");

  await page.locator('[aria-label*="e4,"]').tap();
  await page.locator('[aria-label*="d5,"]').tap();

  await expect(page.locator('p[role="alert"]')).toBeVisible();
  await expect(page.getByText("The rook can't move diagonally")).toBeVisible();
  checkConsole();
  await context.close();
});

test("rook step-2 accepts every legal same-rank/file destination, not just the farthest reach in each direction (acceptAnyLegalMove)", async ({
  page,
}) => {
  // Every one of these was rejected before acceptAnyLegalMove existed:
  // only e4e8 (expectedMoves) and e4a4/e4h4/e4e1 (altValid) were ever
  // accepted, leaving every intermediate square on the highlighted e-file
  // and 4th rank marked wrong.
  for (const dest of ["e7", "e6", "e5", "e3", "e2", "b4", "c4", "d4", "f4", "g4"]) {
    await enterMoveStep(page, "meet-the-pieces.03-meet-the-rook");
    await page.locator('[aria-label*="e4,"]').click();
    await page.locator(`[aria-label*="${dest},"]`).click();
    await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
    await expect(page.getByText("♥♥♥♥♥")).toBeVisible();
  }
});

test("after a correct move, the board actually shows the piece having moved — not still rendered on its starting square", async ({
  page,
}) => {
  await enterMoveStep(page, "meet-the-pieces.03-meet-the-rook");
  await page.locator('[aria-label*="e4,"]').click();
  await page.locator('[aria-label*="e8,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();

  await expect(page.locator('[data-square="e8"]')).toHaveAttribute("aria-label", /white rook/);
  await expect(page.locator('[data-square="e4"]')).toHaveAttribute("aria-label", /empty/);
  // The piece image itself moved, not just the label.
  await expect(page.locator('[data-square="e8"] img.mw-chess-piece')).toHaveCount(1);
  await expect(page.locator('[data-square="e4"] img.mw-chess-piece')).toHaveCount(0);
});

test("every square has a unique data-square identifier, and there are exactly 64 of them", async ({ page }) => {
  await page.goto("/learn/meet-the-pieces.03-meet-the-rook");
  await page.getByRole("button", { name: "Continue" }).click();
  const squares = await page.locator("[data-square]").evaluateAll((els) => els.map((el) => el.getAttribute("data-square")));
  expect(squares).toHaveLength(64);
  expect(new Set(squares).size).toBe(64);
});
