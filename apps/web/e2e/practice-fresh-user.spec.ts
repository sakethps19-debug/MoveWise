import { test, expect } from "./fixtures";

/**
 * P1 "Improve Practice" acceptance coverage: a brand-new learner (guest,
 * zero lessons completed) must have at least one immediately-playable
 * activity, and every locked pool must name the exact lesson that unlocks
 * it rather than a generic "finish its lessons" — see PracticeHub.tsx and
 * app/practice/warm-up/page.tsx.
 */

test("a fresh guest with zero completed lessons has at least one playable practice activity", async ({ page }) => {
  await page.goto("/practice");

  // The Daily warm-up entry point is visible and playable with no
  // prerequisite — this is the one pool that is never gated.
  const warmUp = page.getByRole("link", { name: /Daily warm-up/ });
  await expect(warmUp).toBeVisible();
  await warmUp.click();
  await page.waitForURL("/practice/warm-up");
  await expect(page.getByText("Puzzle 1/2")).toBeVisible();

  // It's real, solvable content, not a placeholder — meet-the-pieces'
  // first board-basics puzzle: king a1 -> b2.
  await page.locator('[aria-label*="a1,"]').click();
  await page.locator('[aria-label*="b2,"]').click();
  await expect(page.getByText(/^Correct!/)).toBeVisible();

  // Real, confirmed defect: PuzzleRunner rendered the board from the
  // puzzle's fixed starting FEN, never from the move actually played —
  // "Correct!" appeared but the king visually stayed on a1, never
  // appearing to move to b2 at all. The board must reflect the real
  // post-move position once a correct answer is confirmed.
  await expect(page.locator('[aria-label="b2, white king"]')).toBeVisible();
  await expect(page.locator('[aria-label="a1, empty"]')).toBeVisible();
});

test("locked pools name the exact prerequisite lesson, with a working, always-enabled CTA to it", async ({ page }) => {
  await page.goto("/practice");

  const rookPool = page.locator(".mw-lesson-node--locked-cta").filter({ hasText: "The rook" });
  await expect(rookPool).toBeVisible();
  await expect(rookPool).toContainText("finish");
  await expect(rookPool).toContainText("Meet the rook");

  // Points at the real lesson that unlocks it — not just any lesson link,
  // and not a lesson this guest hasn't yet reached (visiting it directly
  // would just redirect back to a locked banner, per LessonGate.tsx's own
  // guest-sequencing check, which isn't what this test is about). A real,
  // always-enabled "Go to lesson" button, not a link dimmed along with
  // the rest of a disabled-looking row.
  const prereqLink = rookPool.getByRole("link", { name: "Go to lesson" });
  await expect(prereqLink).toBeVisible();
  await expect(prereqLink).toHaveAttribute("href", "/learn/meet-the-pieces.03-meet-the-rook");
});
