import { test, expect } from "./fixtures";
import { gotoGuestLesson } from "./testHelpers";

function uniqueEmail(prefix: string) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
}

/**
 * Enforces docs/design/system.md's responsive acceptance criterion:
 * "No horizontal scroll at 320/375/390/430/768/1024/1280/1536px" — the
 * project's full documented breakpoint matrix. A page whose content is
 * wider than its viewport (an unconstrained board, a table without its
 * own overflow container, etc.) fails this by comparing
 * document.documentElement.scrollWidth against the viewport width.
 */
const BREAKPOINTS = [320, 375, 390, 430, 768, 1024, 1280, 1536];

async function expectNoHorizontalScroll(page: import("@playwright/test").Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `document is ${scrollWidth}px wide but the viewport is only ${clientWidth}px`).toBeLessThanOrEqual(
    clientWidth,
  );
}

for (const width of BREAKPOINTS) {
  test(`home page has no horizontal scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expectNoHorizontalScroll(page);
  });

  test(`a lesson page has no horizontal scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await gotoGuestLesson(page, "meet-the-pieces.03-meet-the-rook");
    await expectNoHorizontalScroll(page);
    await page.getByRole("button", { name: "Continue" }).click();
    await expectNoHorizontalScroll(page); // board + prompt rendered
  });

  test(`play mode has no horizontal scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/play");
    await expectNoHorizontalScroll(page);
  });

  test(`the progress dashboard has no horizontal scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/progress");
    await expectNoHorizontalScroll(page);
  });
}

// The guest progress card above is deliberately light; the real
// per-unit grid (mw-progress-grid/mw-progress-unit, app/design-system.css)
// only renders signed-in, including the mobile-width layout swap at the
// 600px breakpoint that its own stylesheet declares — checked on both
// sides of that breakpoint since it's the one part of this page a bare
// scrollWidth check above wouldn't meaningfully exercise for a guest.
for (const width of [375, 1024]) {
  test(`the signed-in progress dashboard's unit grid has no horizontal scroll at ${width}px`, async ({ page }) => {
    const email = uniqueEmail("progressresponsive");
    await page.goto("/signup");
    await page.fill("input[name=email]", email);
    await page.fill("input[name=password]", "password123");
    await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
    await page.click("button[type=submit]");
    await page.waitForURL("/");

    await page.setViewportSize({ width, height: 900 });
    await page.goto("/progress");
    await expect(page.getByRole("heading", { name: "Unit progress" })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
}

test("mobile viewport (390px) shows the bottom nav, not the desktop rail", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".mw-nav-bottom")).toBeVisible();
  await expect(page.locator(".mw-nav-rail")).not.toBeVisible();
});

test("desktop viewport (1280px) shows the nav rail, not the bottom nav", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(page.locator(".mw-nav-rail")).toBeVisible();
  await expect(page.locator(".mw-nav-bottom")).not.toBeVisible();
});

/**
 * Real, confirmed defect: on a 12.9" iPad in landscape (measured at
 * 1363x936 — 936px is the real usable height once Safari's own chrome is
 * subtracted from the 1024px device profile), the board was sized from
 * available WIDTH only (PlayRunner.tsx's Board maxWidth={720}), so its
 * bottom edge landed around y=1148, well past the 936px-tall viewport —
 * the full board could not be seen without scrolling. PlayRunner.tsx now
 * measures the real rendered layout and caps the board's size so it fits
 * the actual available height too, alongside the existing width cap.
 */
const GAMEPLAY_VIEWPORTS = [
  { name: "12.9in iPad landscape", width: 1366, height: 1024 },
  { name: "12.9in iPad portrait", width: 1024, height: 1366 },
  { name: "10.9in iPad landscape", width: 1180, height: 820 },
  { name: "11in iPad portrait", width: 834, height: 1194 },
  { name: "mobile portrait", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];

for (const vp of GAMEPLAY_VIEWPORTS) {
  test(`play mode: the full board fits within the viewport at ${vp.name} (${vp.width}x${vp.height}), no scroll needed to see it`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/play");
    await page.waitForSelector(".mw-chessboard");
    const boardRect = await page.locator(".mw-chessboard").boundingBox();
    expect(boardRect).not.toBeNull();
    const bottom = boardRect!.y + boardRect!.height;
    expect(bottom, `board bottom is at ${bottom}px but the viewport is only ${vp.height}px tall`).toBeLessThanOrEqual(
      vp.height,
    );
    expect(boardRect!.y).toBeGreaterThanOrEqual(0);
    // Still a real square board, not squashed to fit.
    expect(Math.abs(boardRect!.width - boardRect!.height)).toBeLessThanOrEqual(1);
  });
}

test("play mode: the exact reported reproduction (1363x936) — board bottom no longer overflows past the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1363, height: 936 });
  await page.goto("/play");
  await page.waitForSelector(".mw-chessboard");
  const boardRect = await page.locator(".mw-chessboard").boundingBox();
  expect(boardRect).not.toBeNull();
  expect(boardRect!.y + boardRect!.height).toBeLessThanOrEqual(936);
});

/**
 * P1/P2: the interactive review workspace (GameReviewWorkspace.tsx)
 * replaced a single, ever-widening `<table>` — this proves a genuinely
 * multi-move ("realistic long") game's review stays usable on iPad
 * landscape and mobile specifically: no page-level horizontal scroll,
 * the move list scrolls within its own bounded box instead of growing
 * the page, and the board + selected-move detail stay visible together
 * (the iPad-landscape requirement) rather than the detail panel
 * scrolling away from the board.
 */
const LONG_GAME_VIEWPORTS = [
  { name: "12.9in iPad landscape", width: 1366, height: 1024 },
  { name: "mobile portrait", width: 390, height: 844 },
];

for (const vp of LONG_GAME_VIEWPORTS) {
  test(`a realistic long game's review workspace stays usable at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/play");
    await expect(page.getByRole("status")).toContainText("Your move", { timeout: 15_000 });

    // Four real White moves (always legal from these squares regardless
    // of Black's actual live-engine replies) — enough plies that the move
    // list genuinely needs to scroll, not just an illustrative one-mover.
    for (const [from, to] of [
      ["e2", "e4"],
      ["g1", "f3"],
      ["f1", "c4"],
      ["b1", "c3"],
    ] as const) {
      await page.locator(`[aria-label*="${from},"]`).click();
      await page.locator(`[aria-label*="${to},"]`).click();
      await expect(page.getByRole("status")).toContainText("Your move", { timeout: 20_000 });
    }

    await page.getByRole("button", { name: "Resign" }).click();
    await expect(page.getByText(/You resigned/)).toBeVisible();
    await page.getByRole("button", { name: "Analyze this game" }).click();
    await expect(page.getByRole("heading", { name: "2. Review the game" })).toBeVisible({ timeout: 60_000 });

    await expectNoHorizontalScroll(page);

    // Full game (not just the learner's own 4 moves) to get a comfortable
    // margin of rows past the list's own scroll cap.
    await page.getByRole("button", { name: "Full game" }).click();

    // The move list scrolls within its own box — it must not be tall
    // enough to show all rows unclipped once there are this many plies.
    const moveList = page.locator(".mw-game-review-table");
    const { scrollHeight, clientHeight } = await moveList.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(scrollHeight).toBeGreaterThan(clientHeight);

    // Board, the selected move's detail, and its explanation are all
    // visible together without scrolling *between* them — the page as a
    // whole can (and does) need scrolling to reach the review section at
    // all (the live final-position board and move history sit above it),
    // but once scrolled to the board, the detail panel must already be
    // in the same viewport, not one further scroll away.
    await page.locator(".mw-review-move-row").first().click();
    const board = page.locator(".mw-review-board-col .mw-chessboard");
    const detail = page.locator(".mw-review-detail-explanation").first();
    // scrollIntoViewIfNeeded only scrolls the minimum distance needed —
    // block:"start" instead, so the board's *top* lands at the viewport's
    // top, giving the nav controls and detail panel below it (same flex
    // column) the most possible room to also land inside the viewport.
    await board.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await expect(board).toBeInViewport();
    await expect(detail).toBeInViewport();
  });
}
