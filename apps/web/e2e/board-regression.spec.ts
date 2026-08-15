import { test, expect, type Page } from "@playwright/test";

/**
 * Phase 1 board-stabilization regression suite. Complements
 * chessboard-geometry.spec.ts (which already covers square-ness, flush
 * gaps, and zero-radius across a wide breakpoint matrix) with the specific
 * checklist called out in the Phase 1 brief: exactly 64 squares, exactly
 * 32 starting pieces, every piece image actually decodes (not just present
 * in the DOM with a src attribute), pieces fit within their square, and no
 * horizontal overflow on the page as a whole (not just the board within
 * its own shell). Run at the three explicitly-required device widths.
 */
const DEVICES = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
];

async function gotoStartingPosition(page: Page) {
  await page.goto("/play");
  await page.waitForSelector('[role="grid"].mw-chessboard');
}

for (const device of DEVICES) {
  test.describe(`board regression at ${device.name} (${device.width}x${device.height})`, () => {
    test.use({ viewport: { width: device.width, height: device.height } });

    test("exactly 64 equal, 1:1 square cells", async ({ page }) => {
      await gotoStartingPosition(page);
      const geometry = await page.evaluate(() => {
        const cells = Array.from(document.querySelectorAll('[role="gridcell"]')) as HTMLElement[];
        return cells.map((c) => c.getBoundingClientRect()).map((r) => ({ width: r.width, height: r.height }));
      });
      expect(geometry.length, "exactly 64 squares").toBe(64);
      const { width: w0, height: h0 } = geometry[0];
      for (const { width, height } of geometry) {
        expect(Math.abs(width - w0)).toBeLessThanOrEqual(0.6);
        expect(Math.abs(height - h0)).toBeLessThanOrEqual(0.6);
        expect(Math.abs(width - height), "square must be 1:1").toBeLessThanOrEqual(0.6);
      }
    });

    test("starting position has exactly 32 pieces, all loaded, all sized within their square", async ({ page }) => {
      await gotoStartingPosition(page);
      // Let the browser finish decoding every <img> before asserting —
      // this is the real defect PHASE 1 called out: a piece present in the
      // DOM but not yet painted looks like a missing piece, not a loading
      // one.
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll(".mw-chess-piece")).every((img) => (img as HTMLImageElement).complete),
      );

      const pieces = await page.evaluate(() => {
        const cells = Array.from(document.querySelectorAll('[role="gridcell"]')) as HTMLElement[];
        return cells
          .map((cell) => {
            const img = cell.querySelector(".mw-chess-piece") as HTMLImageElement | null;
            if (!img) return null;
            const cellRect = cell.getBoundingClientRect();
            const pieceRect = img.getBoundingClientRect();
            return {
              src: img.src,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
              complete: img.complete,
              widthRatio: pieceRect.width / cellRect.width,
              heightRatio: pieceRect.height / cellRect.height,
            };
          })
          .filter((p): p is NonNullable<typeof p> => p !== null);
      });

      expect(pieces.length, "starting position must show exactly 32 pieces").toBe(32);
      for (const piece of pieces) {
        expect(piece.complete, `${piece.src} must finish loading`).toBe(true);
        expect(piece.naturalWidth, `${piece.src} must decode to real image data, not a broken image`).toBeGreaterThan(0);
        expect(piece.naturalHeight, `${piece.src} must decode to real image data, not a broken image`).toBeGreaterThan(0);
        expect(piece.widthRatio, `${piece.src} width ratio in [0.82, 0.90]`).toBeGreaterThanOrEqual(0.82);
        expect(piece.widthRatio).toBeLessThanOrEqual(0.9);
        expect(piece.heightRatio, `${piece.src} height ratio in [0.82, 0.90]`).toBeGreaterThanOrEqual(0.82);
        expect(piece.heightRatio).toBeLessThanOrEqual(0.9);
      }
    });

    test("no horizontal page overflow", async ({ page }) => {
      await gotoStartingPosition(page);
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(
        overflow.scrollWidth,
        `document.scrollWidth (${overflow.scrollWidth}) must not exceed the viewport's clientWidth (${overflow.clientWidth})`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });

    test("the full starting position is visible on first paint — no piece-by-piece pop-in", async ({ page }) => {
      // Regression guard for the "board looks incomplete while loading"
      // defect: count rendered pieces immediately on DOMContentLoaded and
      // again once idle. If preloading (app/layout.tsx) is working, both
      // reads already agree — the count never grows after first paint.
      await page.goto("/play", { waitUntil: "domcontentloaded" });
      await page.waitForSelector('[role="grid"].mw-chessboard');
      const countAtFirstPaint = await page.evaluate(
        () => document.querySelectorAll(".mw-chess-piece").length,
      );
      await page.waitForLoadState("networkidle");
      const countOnceIdle = await page.evaluate(() => document.querySelectorAll(".mw-chess-piece").length);
      expect(countAtFirstPaint, "all 32 pieces must be in the DOM together, not staggered in").toBe(32);
      expect(countOnceIdle).toBe(32);
    });
  });
}
