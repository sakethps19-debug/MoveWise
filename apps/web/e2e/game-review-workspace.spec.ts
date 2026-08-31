import { test, expect } from "./fixtures";

/**
 * The interactive review workspace (components/GameReviewWorkspace.tsx)
 * replaced the old static-table-only review. This proves the parts a
 * static table never had: stepping through real plies produces the
 * right board position (reconstructed from stored FEN history, never
 * inferred from SAN), the navigation controls work, a best-move arrow
 * renders when the played move wasn't the engine's own choice, and
 * "Try the better move" opens from the position *before* the move —
 * not the position after it.
 */

test("selecting each ply shows the correct board position, and Start/Previous/Next navigate correctly", async ({
  page,
}) => {
  await page.goto("/play");
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 15_000 });

  await page.locator('[aria-label*="e2,"]').click();
  await page.locator('[aria-label*="e4,"]').click();
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 20_000 });

  await page.getByRole("button", { name: "Resign" }).click();
  await expect(page.getByText(/You resigned/)).toBeVisible();
  await page.getByRole("button", { name: "Analyze this game" }).click();
  await expect(page.getByRole("heading", { name: "2. Review the game" })).toBeVisible({ timeout: 60_000 });

  const reviewBoard = page.locator(".mw-review-board-col .mw-chessboard");

  // Starting position by default (no ply selected).
  await expect(page.getByText("Starting position")).toBeVisible();
  await expect(reviewBoard.locator('[aria-label="e2, white pawn"]')).toBeVisible();
  await expect(reviewBoard.locator('[aria-label="e4, empty"]')).toBeVisible();

  // Selecting White's first ply from the move list shows the position
  // *after* e4 — e2 empty, e4 occupied by the pawn that moved there.
  // This can only be right if the board is driven from the real stored
  // fenAfter for that ply, not a guess derived from the SAN text alone.
  await page.locator(".mw-review-move-row").first().click();
  await expect(page.getByText("Ply 1 of")).toBeVisible();
  await expect(reviewBoard.locator('[aria-label="e4, white pawn"]')).toBeVisible();
  await expect(reviewBoard.locator('[aria-label="e2, empty"]')).toBeVisible();

  // Previous returns to the starting position.
  await page.getByRole("button", { name: "← Previous" }).click();
  await expect(page.getByText("Starting position")).toBeVisible();
  await expect(reviewBoard.locator('[aria-label="e2, white pawn"]')).toBeVisible();

  // Next moves forward one ply again.
  await page.getByRole("button", { name: "Next →" }).click();
  await expect(page.getByText("Ply 1 of")).toBeVisible();
  await expect(reviewBoard.locator('[aria-label="e4, white pawn"]')).toBeVisible();

  // Start jumps straight back to the initial position from anywhere.
  await page.getByRole("button", { name: "Next →" }).click(); // advance further first
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("Starting position")).toBeVisible();
  await expect(reviewBoard.locator('[aria-label="e2, white pawn"]')).toBeVisible();

  // Previous is disabled at the start.
  await expect(page.getByRole("button", { name: "← Previous" })).toBeDisabled();

  // Next is disabled at the true end of the game — switch to "Full game"
  // first, since the default "Your moves" filter hides Stockfish's own
  // final reply, which is otherwise the actual last ply here.
  await page.getByRole("button", { name: "Full game" }).click();
  const lastRow = page.locator(".mw-review-move-row").last();
  await lastRow.click();
  await expect(page.getByRole("button", { name: "Next →" })).toBeDisabled();
});

test("Left/Right arrow keys step through the review exactly like Previous/Next, and stay clamped at both ends", async ({
  page,
}) => {
  // Real, confirmed gap this locks in: GameReviewWorkspace.tsx's ply
  // navigation had no keyboard equivalent at all — Board.tsx's own squares
  // are keyboard-operable (Tab/Enter, see keyboard-interaction.spec.ts),
  // but stepping through a *review* (as opposed to playing a move) only
  // ever worked via mouse clicks on Start/Previous/Next.
  await page.goto("/play");
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 15_000 });

  await page.locator('[aria-label*="e2,"]').click();
  await page.locator('[aria-label*="e4,"]').click();
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 20_000 });

  await page.getByRole("button", { name: "Resign" }).click();
  await expect(page.getByText(/You resigned/)).toBeVisible();
  await page.getByRole("button", { name: "Analyze this game" }).click();
  await expect(page.getByRole("heading", { name: "2. Review the game" })).toBeVisible({ timeout: 60_000 });

  const reviewBoard = page.locator(".mw-review-board-col .mw-chessboard");

  // Starting position by default — ArrowLeft here must be a no-op (clamped
  // at the low end), not throw or move to a negative ply.
  await expect(page.getByText("Starting position")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByText("Starting position")).toBeVisible();

  // ArrowRight steps forward exactly one ply — same fenAfter-driven board
  // update the mouse-click Next button produces.
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Ply 1 of")).toBeVisible();
  await expect(reviewBoard.locator('[aria-label="e4, white pawn"]')).toBeVisible();
  await expect(reviewBoard.locator('[aria-label="e2, empty"]')).toBeVisible();

  // ArrowLeft steps back to the starting position.
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByText("Starting position")).toBeVisible();
  await expect(reviewBoard.locator('[aria-label="e2, white pawn"]')).toBeVisible();

  // Clamped at the true end of the game too, same as the mouse Next
  // button's own disabled state — switch to "Full game" first since the
  // default "Your moves" filter hides Stockfish's own final reply.
  await page.getByRole("button", { name: "Full game" }).click();
  const lastRow = page.locator(".mw-review-move-row").last();
  await lastRow.click();
  await expect(page.getByRole("button", { name: "Next →" })).toBeDisabled();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "Next →" })).toBeDisabled();
});

test("a best-move arrow renders for a move that wasn't the engine's own choice, and 'Try the better move' starts from the position before the move, not after", async ({
  page,
}) => {
  await page.goto("/play");
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 15_000 });

  // A deliberately weak, non-developing first move — reliably not the
  // engine's own top choice at any real search depth, unlike a strong
  // central move that could legitimately tie the engine's own pick.
  await page.locator('[aria-label*="a2,"]').click();
  await page.locator('[aria-label*="a3,"]').click();
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 20_000 });

  await page.getByRole("button", { name: "Resign" }).click();
  await expect(page.getByText(/You resigned/)).toBeVisible();
  await page.getByRole("button", { name: "Analyze this game" }).click();
  await expect(page.getByRole("heading", { name: "2. Review the game" })).toBeVisible({ timeout: 60_000 });

  await page.locator(".mw-review-move-row").first().click();

  const tryButton = page.getByRole("button", { name: "Try the better move" });
  // Checked when present, not forced — matches this suite's established
  // pattern for anything gated on a live engine's own real classification
  // (play-analysis.spec.ts's own Retry-button test has the same caveat).
  if ((await tryButton.count()) === 0) {
    test.skip(true, "the engine classified this specific game's a3 as its own best move — nothing to try instead");
  }

  // A best-move arrow overlay is present on the main review board (the
  // played move wasn't the engine's choice, so there IS a different
  // best-move square pair to draw). Checked by presence, not
  // `.toBeVisible()`: an SVG <line>'s geometric bounding box can be
  // exactly zero-width in Chromium when it's perfectly vertical (as one
  // from e2 to e4 is — same file, same x-coordinate) even though it
  // renders real, visible stroked pixels; that's a real Chromium
  // getBoundingClientRect quirk for the <line> primitive specifically,
  // not a rendering bug in Board.tsx.
  await expect(page.locator(".mw-review-board-col .mw-chessboard-shell svg line")).toHaveCount(1);

  await tryButton.click();
  const retryBoard = page.locator(".mw-game-review-retry .mw-chessboard");
  await expect(retryBoard).toBeVisible();
  // The retry board must show the position BEFORE the move (White's pawn
  // still on a2, not a3) — proving it was seeded from positions[ply-1],
  // never from the post-move position the main review board is showing.
  await expect(retryBoard.locator('[aria-label="a2, white pawn"]')).toBeVisible();
  await expect(retryBoard.locator('[aria-label="a3, empty"]')).toBeVisible();
});

test("the learner-only / full-game filter shows and hides the opponent's moves", async ({ page }) => {
  await page.goto("/play");
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 15_000 });

  await page.locator('[aria-label*="e2,"]').click();
  await page.locator('[aria-label*="e4,"]').click();
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 20_000 });

  await page.getByRole("button", { name: "Resign" }).click();
  await expect(page.getByText(/You resigned/)).toBeVisible();
  await page.getByRole("button", { name: "Analyze this game" }).click();
  await expect(page.getByRole("heading", { name: "2. Review the game" })).toBeVisible({ timeout: 60_000 });

  // Default (guest, playing White): "Your moves" — only the learner's
  // own ply is listed, Stockfish's reply is hidden from the list.
  await expect(page.getByRole("button", { name: "Your moves" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".mw-review-move-row")).toHaveCount(1);

  await page.getByRole("button", { name: "Full game" }).click();
  const rowCount = await page.locator(".mw-review-move-row").count();
  expect(rowCount).toBeGreaterThanOrEqual(2); // the learner's move plus at least Stockfish's reply
  await expect(page.locator(".mw-review-context-label")).toHaveText("Stockfish");
});

/** P1 "PGN copy/export" — a real gap the previous review workspace had no way to close (there was no PGN available to the client at all until this pass). */
test("Copy PGN copies the actual game played, reconstructed from the review's own moves, to the clipboard", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/play");
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 15_000 });

  await page.locator('[aria-label*="e2,"]').click();
  await page.locator('[aria-label*="e4,"]').click();
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 20_000 });

  await page.getByRole("button", { name: "Resign" }).click();
  await expect(page.getByText(/You resigned/)).toBeVisible();
  await page.getByRole("button", { name: "Analyze this game" }).click();
  await expect(page.getByRole("heading", { name: "2. Review the game" })).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "Copy PGN" }).click();
  await expect(page.getByText("Copied to clipboard.")).toBeVisible();

  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toContain("1. e4"); // the real move actually played, not fabricated content
});

/**
 * P0 "repair analysis trust": end-to-end regression for the exact
 * reported inconsistency — a move analyzed as "Played: d5, Best: d5,
 * Eval loss: -3cp, Rating: Excellent". That specific combination is
 * internally contradictory (an identical played/best move can never
 * have a nonzero loss or a non-Best rating), and lib/moveClassification.ts's
 * `isEngineBestByIdentity` override already has a dedicated unit
 * regression for the literal SAN (moveClassification.test.ts). This test
 * proves the same invariant holds end-to-end, through the real browser,
 * the real Stockfish Worker, and the real rendered UI — for *every* move
 * of an actually-played game, not just one hand-picked position, since
 * which exact move the live engine calls "best" isn't itself something a
 * test should hardcode.
 */
test("no move in a real, engine-analyzed game shows an internally contradictory Played=Best rating with a nonzero eval loss @smoke", async ({
  page,
}) => {
  await page.goto("/play");
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 15_000 });

  // A short, real game — the opening two moves are enough to exercise
  // several real engine-analyzed plies (including White's own d-pawn
  // push to d4, and whatever Black plays in reply) without a slow test.
  await page.locator('[aria-label*="d2,"]').click();
  await page.locator('[aria-label*="d4,"]').click();
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 20_000 });
  await page.locator('[aria-label*="c2,"]').click();
  await page.locator('[aria-label*="c4,"]').click();
  await expect(page.getByRole("status")).toContainText("Your move", { timeout: 20_000 });

  await page.getByRole("button", { name: "Resign" }).click();
  await expect(page.getByText(/You resigned/)).toBeVisible();
  await page.getByRole("button", { name: "Analyze this game" }).click();
  await expect(page.getByRole("heading", { name: "2. Review the game" })).toBeVisible({ timeout: 60_000 });

  // "Full game" so Stockfish's own replies are included too — the
  // original report didn't specify whose move it was.
  const fullGameToggle = page.getByRole("button", { name: "Full game" });
  if (await fullGameToggle.isVisible()) await fullGameToggle.click();

  const rowCount = await page.locator(".mw-review-move-row").count();
  expect(rowCount).toBeGreaterThan(0);

  for (let i = 0; i < rowCount; i++) {
    await page.locator(".mw-review-move-row").nth(i).click();

    const bestLineCount = await page.locator(".mw-review-detail-best").count();
    const evalLossText = (await page.locator(".mw-review-detail-eval-loss .mw-game-review-mono").textContent()) ?? "";
    const ratingText = (await page.locator(".mw-review-detail-head .mw-badge").textContent()) ?? "";

    if (bestLineCount === 0) {
      // No "Best <move>" line shown at all means playedMove === bestMove
      // (see GameReviewWorkspace.tsx's own conditional) — the exact
      // "Played: d5, Best: d5" case. This must never show any nonzero
      // eval loss, and must never be rated anything but Best/Brilliant
      // (or Forced, the one case where a single legal move trivially
      // equals the engine's own "best" search result too).
      expect(evalLossText.trim()).toBe("—");
      expect(["Best", "Brilliant", "Forced"]).toContain(ratingText.trim());
    }
  }
});
