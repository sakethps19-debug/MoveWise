import { test, expect } from "@playwright/test";

/**
 * Coverage map for the 10 progression requirements this file exists to
 * satisfy. Several were already covered by other specs before this file
 * — those are referenced rather than duplicated wholesale; what's new
 * here is items 1 and 10, plus a direct, isolated repro of the real bug
 * this file's item 10 test found (see below).
 *
 *  1. Initial state: only the first lesson is accessible — NEW, this file.
 *  2. Completing lesson 1 unlocks lesson 2 — learning-path.spec.ts
 *     ("guest progress persists locally, unlocks the next lesson...").
 *  3. Completing lesson 2 unlocks "Meet the rook" — learning-path.spec.ts
 *     ("strong performance in a principle unlocks the next one").
 *  4. Completing a subsection unlocks only the intended next subsection —
 *     learning-path.spec.ts ("completing a principle's lessons sloppily
 *     doesn't unlock the next principle" + the "strong performance" test
 *     above for the positive case).
 *  5. A direct URL cannot open a locked lesson — learning-path.spec.ts
 *     ("a signed-in learner can't bypass locked-lesson sequencing"),
 *     cross-unit-progression.spec.ts (repeated across three units).
 *  6. Completion and stars persist after reload — cross-unit-
 *     progression.spec.ts's persistence check.
 *  7. Completed lessons remain replayable — cross-unit-progression.spec.ts
 *     replays meet-the-pieces.01 after completion.
 *  8. Replay does not corrupt progress or duplicate rewards — cross-unit-
 *     progression.spec.ts checks this against the database directly.
 *  9. Cross-unit progression works beyond Meet the Pieces — the entire
 *     point of cross-unit-progression.spec.ts.
 * 10. Anonymous-user progression works — NEW, this file. This is where a
 *     real bug was found and fixed (see below), not a formality.
 */

test("1. initial state: only the first lesson is accessible, everything else is locked", async ({ page }) => {
  const email = `initstate${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  // The very first lesson is open. Filtered by the row's own title
  // element, not hasText on the whole row — a locked row's "Unlocks
  // after ..." subtitle can itself quote another lesson's title as
  // substring text, which would otherwise match more than one row.
  const welcomeRow = page
    .locator(".mw-lesson-node")
    .filter({ has: page.locator(".mw-lesson-node-title", { hasText: "Welcome to the chessboard" }) });
  await expect(welcomeRow).toHaveClass(/mw-lesson-node--available/);

  // Every other lesson in every unit is locked — not just "later ones",
  // literally all of them, since nothing has been completed yet.
  const allTitles = [
    "Ranks, files and squares",
    "Meet the rook",
    "Rook captures and blocked paths",
    "Meet the bishop",
    "Bishop colours",
    "Meet the queen",
    "Meet the king",
    "Meet the knight",
    "Meet the pawn",
    "Capturing and piece values",
    "Unit mastery challenge",
    "What is check?",
    "What is checkmate?",
    "Thinking under check",
    "The knight fork",
  ];
  for (const title of allTitles) {
    const row = page
      .locator(".mw-lesson-node")
      .filter({ has: page.locator(".mw-lesson-node-title", { hasText: title }) });
    await expect(row, `"${title}" must be locked in a fresh account`).toHaveClass(/mw-lesson-node--locked/);
  }
});

test("10. anonymous-user progression: a guest unlocking a principle-gated lesson (regression test for a real bug)", async ({
  page,
}) => {
  // A real, confirmed bug this test guards against: guests never get
  // UserConceptMastery rows (no session to track them against), and the
  // learning-path's principle-proficiency gate used to treat "no mastery
  // data" as "checked and not proficient" instead of "nothing to check,
  // don't gate" — so a guest who aced every lesson in a principle still
  // saw the next principle's first lesson as permanently locked, even
  // though the server-side route guard (app/learn/[lessonId]/page.tsx)
  // already correctly skips that same check for guests (`if (user &&
  // lesson.principleId)`). Fixed in components/LearningPath.tsx's
  // statusOf/unlockReason — see their doc comments for the root cause.
  await page.goto("/learn/meet-the-pieces.01-welcome");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="e1,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="e8,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "False" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Complete unit" }).click();
  await page.getByRole("link", { name: "Back to learning path" }).click();
  await page.waitForURL("/");

  await page.goto("/learn/meet-the-pieces.02-ranks-files-squares");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="e4,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "A row running across the board" }).click();
  await page.getByRole("button", { name: "Finish lesson" }).click();
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();
  await page.getByRole("link", { name: "Back to learning path" }).click();
  await page.waitForURL("/");

  // Reload — real, server-verified state, not a transient client render.
  await page.reload();
  const rookRow = page
    .locator(".mw-lesson-node")
    .filter({ has: page.locator(".mw-lesson-node-title", { hasText: "Meet the rook" }) });
  await expect(rookRow).toHaveClass(/mw-lesson-node--available/);
  await expect(rookRow).not.toContainText("🔒");

  // Direct URL navigation succeeds too, not just the row's display state.
  await page.goto("/learn/meet-the-pieces.03-meet-the-rook");
  await expect(page).toHaveURL("/learn/meet-the-pieces.03-meet-the-rook");

  // A guest's progress also persists across a signup — completions and
  // stars migrate, not just get discarded. (Already covered in depth by
  // learning-path.spec.ts's migration test; asserted lightly here as
  // part of the same guest journey rather than duplicated in full.)
  const email = `guestmigrate${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");
  const rookRowSignedIn = page
    .locator(".mw-lesson-node")
    .filter({ has: page.locator(".mw-lesson-node-title", { hasText: "Meet the rook" }) });
  await expect(rookRowSignedIn).not.toContainText("🔒");
});
