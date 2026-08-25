import { test, expect } from "./fixtures";
import { gotoGuestLesson } from "./testHelpers";

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
