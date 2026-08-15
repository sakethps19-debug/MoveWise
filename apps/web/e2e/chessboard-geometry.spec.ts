import { test, expect, type Page } from "@playwright/test";

/**
 * Enforces the chessboard's mathematical geometry, not just its CSS
 * source — a grid can look right in DevTools and still render non-square
 * cells if grid-template-rows is missing (implicit rows then size to
 * their own content, so a row with piece <img>s ends up taller than an
 * empty row — exactly the bug this suite would have caught before
 * Board.tsx set grid-template-rows explicitly). Every assertion here
 * reads real getBoundingClientRect()/getComputedStyle() output from a
 * rendered page, never CSS strings.
 */
const BREAKPOINTS = [
  { name: "320px phone", width: 320, height: 700 },
  { name: "375px phone", width: 375, height: 700 },
  { name: "390px phone", width: 390, height: 800 },
  { name: "430px phone", width: 430, height: 900 },
  { name: "tablet portrait", width: 768, height: 1024 },
  { name: "tablet landscape", width: 1024, height: 768 },
  { name: "desktop", width: 1280, height: 900 },
  { name: "large desktop", width: 1536, height: 960 },
];

const TOLERANCE_PX = 0.6; // sub-pixel rounding from the browser's own layout engine, not a real defect

interface BoardGeometry {
  boardRect: { width: number; height: number; top: number; left: number; right: number; bottom: number };
  shellRect: { width: number; height: number; left: number; right: number };
  cellCount: number;
  rowCount: number;
  colCount: number;
  cellWidths: number[];
  cellHeights: number[];
  cellBorderRadii: string[];
  gapBetweenAdjacentCellsInRow: number[];
  gapBetweenAdjacentCellsInColumn: number[];
}

async function readBoardGeometry(page: Page): Promise<BoardGeometry> {
  return page.evaluate(() => {
    const shell = document.querySelector(".mw-chessboard-shell") as HTMLElement;
    const board = document.querySelector('[role="grid"].mw-chessboard') as HTMLElement;
    const rows = Array.from(board.querySelectorAll('[role="row"]'));
    const cells = Array.from(board.querySelectorAll('[role="gridcell"]')) as HTMLElement[];

    const boardRect = board.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();

    const cellRects = cells.map((c) => c.getBoundingClientRect());
    const cellWidths = cellRects.map((r) => r.width);
    const cellHeights = cellRects.map((r) => r.height);
    const cellBorderRadii = cells.map((c) => getComputedStyle(c).borderRadius);

    // First row's 8 cells: gap between each cell and the next, horizontally.
    const firstRowRects = cellRects.slice(0, 8);
    const gapBetweenAdjacentCellsInRow = firstRowRects.slice(0, 7).map((r, i) => firstRowRects[i + 1].left - r.right);

    // First column: cell 0, 8, 16, ... 56 — gap between each and the next, vertically.
    const firstColRects = Array.from({ length: 8 }, (_, i) => cellRects[i * 8]);
    const gapBetweenAdjacentCellsInColumn = firstColRects.slice(0, 7).map((r, i) => firstColRects[i + 1].top - r.bottom);

    return {
      boardRect: {
        width: boardRect.width,
        height: boardRect.height,
        top: boardRect.top,
        left: boardRect.left,
        right: boardRect.right,
        bottom: boardRect.bottom,
      },
      shellRect: { width: shellRect.width, height: shellRect.height, left: shellRect.left, right: shellRect.right },
      cellCount: cells.length,
      rowCount: rows.length,
      colCount: cells.length / (rows.length || 1),
      cellWidths,
      cellHeights,
      cellBorderRadii,
      gapBetweenAdjacentCellsInRow,
      gapBetweenAdjacentCellsInColumn,
    };
  });
}

function assertBoardGeometry(geo: BoardGeometry) {
  // Exactly 64 squares, in an 8x8 grid.
  expect(geo.cellCount, "must render exactly 64 squares").toBe(64);
  expect(geo.rowCount, "must have exactly 8 rows").toBe(8);
  expect(geo.colCount, "must have exactly 8 columns").toBe(8);

  // Every square has the same rendered width, and the same rendered height.
  const [firstWidth, ...restWidths] = geo.cellWidths;
  for (const w of restWidths) {
    expect(Math.abs(w - firstWidth), `all 64 squares must share one width (saw ${firstWidth} and ${w})`).toBeLessThanOrEqual(
      TOLERANCE_PX,
    );
  }
  const [firstHeight, ...restHeights] = geo.cellHeights;
  for (const h of restHeights) {
    expect(
      Math.abs(h - firstHeight),
      `all 64 squares must share one height (saw ${firstHeight} and ${h})`,
    ).toBeLessThanOrEqual(TOLERANCE_PX);
  }

  // Width equals height within tolerance — a perfect square, not a rectangle.
  expect(
    Math.abs(firstWidth - firstHeight),
    `a square's width (${firstWidth}) must equal its height (${firstHeight})`,
  ).toBeLessThanOrEqual(TOLERANCE_PX);

  // No gap between adjacent squares, in either direction.
  for (const gap of geo.gapBetweenAdjacentCellsInRow) {
    expect(Math.abs(gap), `adjacent squares in a row must be flush (gap: ${gap}px)`).toBeLessThanOrEqual(TOLERANCE_PX);
  }
  for (const gap of geo.gapBetweenAdjacentCellsInColumn) {
    expect(Math.abs(gap), `adjacent squares in a column must be flush (gap: ${gap}px)`).toBeLessThanOrEqual(
      TOLERANCE_PX,
    );
  }

  // No individual square has a border radius.
  for (const radius of geo.cellBorderRadii) {
    expect(radius === "0px" || radius === "", `an individual square must have no border-radius (saw "${radius}")`).toBe(
      true,
    );
  }

  // Board width equals board height.
  expect(
    Math.abs(geo.boardRect.width - geo.boardRect.height),
    `the board itself must be square (${geo.boardRect.width} x ${geo.boardRect.height})`,
  ).toBeLessThanOrEqual(TOLERANCE_PX);

  // The board does not overflow its shell/container.
  expect(geo.boardRect.width, "the board must not be wider than its shell container").toBeLessThanOrEqual(
    geo.shellRect.width + TOLERANCE_PX,
  );
}

for (const bp of BREAKPOINTS) {
  test(`Play & Learn board geometry at ${bp.name} (${bp.width}px)`, async ({ page }) => {
    await page.setViewportSize({ width: bp.width, height: bp.height });
    await page.goto("/play");
    await page.waitForSelector('[role="grid"].mw-chessboard');
    const geo = await readBoardGeometry(page);
    assertBoardGeometry(geo);
  });

  test(`lesson board geometry at ${bp.name} (${bp.width}px)`, async ({ page }) => {
    await page.setViewportSize({ width: bp.width, height: bp.height });
    await page.goto("/learn/meet-the-pieces.03-meet-the-rook");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForSelector('[role="grid"].mw-chessboard');
    const geo = await readBoardGeometry(page);
    assertBoardGeometry(geo);
  });
}

test("board geometry holds on a sparsely-populated position (the bug this suite guards against)", async ({ page }) => {
  // A position with pieces on only some ranks is exactly what exposed the
  // original defect: rows containing a piece <img> sized taller than
  // empty rows once grid-template-rows was left to default to `auto`.
  await page.goto("/learn/meet-the-pieces.07-meet-the-queen");
  await page.waitForSelector('[role="grid"].mw-chessboard');
  const geo = await readBoardGeometry(page);
  assertBoardGeometry(geo);
});

test("board geometry holds on an empty board", async ({ page }) => {
  await page.goto("/learn/meet-the-pieces.02-ranks-files-squares");
  await page.waitForSelector('[role="grid"].mw-chessboard');
  const geo = await readBoardGeometry(page);
  assertBoardGeometry(geo);
});

test("pieces occupy 82-90% of their square", async ({ page }) => {
  await page.goto("/play");
  await page.waitForSelector('[role="grid"].mw-chessboard');
  const ratios = await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll('[role="gridcell"]'));
    return cells
      .filter((c) => c.querySelector(".mw-chess-piece"))
      .map((c) => {
        const cellRect = c.getBoundingClientRect();
        const pieceRect = c.querySelector(".mw-chess-piece")!.getBoundingClientRect();
        return { widthRatio: pieceRect.width / cellRect.width, heightRatio: pieceRect.height / cellRect.height };
      });
  });
  expect(ratios.length).toBeGreaterThan(0);
  for (const { widthRatio, heightRatio } of ratios) {
    expect(widthRatio).toBeGreaterThanOrEqual(0.82);
    expect(widthRatio).toBeLessThanOrEqual(0.9);
    expect(heightRatio).toBeGreaterThanOrEqual(0.82);
    expect(heightRatio).toBeLessThanOrEqual(0.9);
  }
});

test("pieces render as real SVG images, not text/emoji characters", async ({ page }) => {
  await page.goto("/play");
  await page.waitForSelector('[role="grid"].mw-chessboard');
  const pieceSrcs = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".mw-chess-piece")).map((el) => (el as HTMLImageElement).src),
  );
  expect(pieceSrcs.length).toBe(32); // the starting position
  for (const src of pieceSrcs) {
    expect(src).toMatch(/\/pieces\/[wb][pnbrqk]\.svg$/);
  }
});
