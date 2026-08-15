import { test, expect } from "@playwright/test";

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
    await page.goto("/learn/meet-the-pieces.03-meet-the-rook");
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
