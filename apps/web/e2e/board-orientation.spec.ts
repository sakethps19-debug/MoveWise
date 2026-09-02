import { test, expect } from "./fixtures";

/**
 * P1 "Black-side orientation" — real, reproduced defect: selecting Black
 * in Play & Learn left the board White-oriented (a8 stayed top-left,
 * Black's own pieces stayed at the top) instead of showing the position
 * from the side actually being played, and post-game review inherited
 * the same mismatch. Board.tsx's `flipped` prop is a pure display
 * transform — every square keeps its real identity (fen/aria-label/
 * onSquareClick all stay in absolute square-space) — so these tests
 * check visual position via DOM order (the CSS grid has no `order`
 * override; document order is render order — design-system.css's
 * .mw-chessboard), not pixel geometry.
 */

/** The [data-square] rendered first in the grid — a8 for White's own view, h1 for Black's. */
async function firstSquare(page: import("@playwright/test").Page) {
  return page.locator("[data-square]").first().getAttribute("data-square");
}

test("White defaults to White orientation — a8 top-left", async ({ page }) => {
  await page.goto("/play");
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 15_000 });
  expect(await firstSquare(page)).toBe("a8");
});

test("Black defaults to Black orientation — h1 top-left", async ({ page }) => {
  await page.goto("/play");
  await page.getByRole("group", { name: "Choose your side" }).getByRole("button", { name: "Black" }).click();
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 20_000 });
  expect(await firstSquare(page)).toBe("h1");
});

test("playing as Black, e7-e5 and g8-f6 are real, legal moves against the flipped board @smoke", async ({ page }) => {
  await page.goto("/play");
  await page.getByRole("group", { name: "Choose your side" }).getByRole("button", { name: "Black" }).click();
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 20_000 });
  expect(await firstSquare(page)).toBe("h1");

  // aria-label is keyed on the absolute square id regardless of visual
  // position, so the same click pattern every other spec in this suite
  // uses still finds the right square on a flipped board.
  await page.locator('[aria-label*="e7,"]').click();
  await page.locator('[aria-label*="e5,"]').click();
  await expect(page.locator('[aria-label="e5, black pawn"]')).toBeVisible();
  await expect(page.locator('[aria-label="e7, empty"]')).toBeVisible();

  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 20_000 });
  await page.locator('[aria-label*="g8,"]').click();
  await page.locator('[aria-label*="f6,"]').click();
  await expect(page.locator('[aria-label="f6, black knight"]')).toBeVisible();
  await expect(page.locator('[aria-label="g8, empty"]')).toBeVisible();

  // Orientation itself didn't silently reset back to White's view partway
  // through the game.
  expect(await firstSquare(page)).toBe("h1");
});

test("post-game review stays Black-oriented to match the game just played", async ({ page }) => {
  await page.goto("/play");
  await page.getByRole("group", { name: "Choose your side" }).getByRole("button", { name: "Black" }).click();
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 20_000 });
  expect(await firstSquare(page)).toBe("h1");

  await page.getByRole("button", { name: "Resign" }).click();
  await expect(page.getByText(/You resigned/)).toBeVisible();
  await page.getByRole("button", { name: "Analyze this game" }).click();
  await expect(page.getByRole("heading", { name: "2. Review the game" })).toBeVisible({ timeout: 60_000 });

  // The review workspace renders its own, separate <Board> — this proves
  // it inherited Black's orientation from learnerColor, not just that the
  // in-progress play board (already proven above) happened to stay flipped.
  expect(await firstSquare(page)).toBe("h1");
});

test("flipping the board twice returns to the same orientation and the same position", async ({ page }) => {
  await page.goto("/play");
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 15_000 });
  expect(await firstSquare(page)).toBe("a8");

  // A real move first, so "the same position" is checking something more
  // than the untouched starting array — the king's home square is
  // occupied both before and after the double-flip either way, so assert
  // on the moved pawn specifically.
  await page.locator('[aria-label*="e2,"]').click();
  await page.locator('[aria-label*="e4,"]').click();
  await expect(page.locator('[aria-label="e4, white pawn"]')).toBeVisible();

  const flip = page.getByRole("button", { name: /Flip board/i });
  await flip.click();
  expect(await firstSquare(page)).toBe("h1");
  await flip.click();
  expect(await firstSquare(page)).toBe("a8");

  // Same position — the pawn is still exactly where it was, not reset or
  // otherwise disturbed by the flip round-trip.
  await expect(page.locator('[aria-label="e4, white pawn"]')).toBeVisible();
  await expect(page.locator('[aria-label="e2, empty"]')).toBeVisible();
});

test("accessible square names stay logically correct (absolute, not visual) after flipping", async ({ page }) => {
  await page.goto("/play");
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 15_000 });

  // White's king starts on e1 regardless of viewing side — a flip must
  // never relabel it as if e1 and h1 (its flipped visual neighbor) had
  // swapped identities.
  await expect(page.locator('[aria-label="e1, white king"]')).toHaveCount(1);
  await expect(page.locator('[aria-label="h1, white rook"]')).toHaveCount(1);

  await page.getByRole("button", { name: /Flip board/i }).click();
  expect(await firstSquare(page)).toBe("h1");

  await expect(page.locator('[aria-label="e1, white king"]')).toHaveCount(1);
  await expect(page.locator('[aria-label="h1, white rook"]')).toHaveCount(1);
  // The grid announces itself as Black's own view once flipped — a real,
  // distinct accessible name, not silently identical to the unflipped grid.
  await expect(page.getByRole("grid", { name: "Chessboard, viewed from Black's side" })).toBeVisible();
});
