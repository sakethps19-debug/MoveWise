import { test, expect } from "./fixtures";
import { ensureFullCurriculumVisible } from "./testHelpers";
import { execFileSync } from "node:child_process";
import path from "node:path";

const DB_HELPER = path.join(__dirname, "db-helper.mjs");

function dbHelper(command: string, args: Record<string, unknown> = {}): string {
  return execFileSync("node", [DB_HELPER, command, JSON.stringify(args)], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf-8",
  });
}

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
 *     cross-unit-progression.spec.ts (repeated across three units), and
 *     — for a guest, a real, previously-unguarded gap — the "a guest
 *     can't bypass locked-lesson sequencing via direct URL either" test
 *     below.
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
  await ensureFullCurriculumVisible(page);

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
  await page.getByRole("button", { name: "Finish lesson" }).click();
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
  // Two lessons in, still short of a full chapter — the homepage is
  // still the compact "Today" plan (P1 curriculum-expansion fix).
  await ensureFullCurriculumVisible(page);
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
  await ensureFullCurriculumVisible(page);
  const rookRowSignedIn = page
    .locator(".mw-lesson-node")
    .filter({ has: page.locator(".mw-lesson-node-title", { hasText: "Meet the rook" }) });
  await expect(rookRowSignedIn).not.toContainText("🔒");
});

test("a guest can't bypass locked-lesson sequencing via direct URL either", async ({ page }) => {
  // Real, confirmed gap: app/learn/[lessonId]/page.tsx's server-side
  // prerequisite check only runs `if (user && ...)` — a guest has no
  // session, so it was skipped entirely, and a fresh guest typing this
  // URL got the full lesson content immediately, with no gate at all.
  // components/LessonGate.tsx now performs the equivalent check
  // client-side (guest progress only exists in this browser's
  // localStorage, unreadable from the server) before ever revealing the
  // lesson runner. A completely fresh browser context has no localStorage
  // progress at all, so "Meet the rook" (requires
  // meet-the-pieces.02-ranks-files-squares) must bounce.
  await page.goto("/learn/meet-the-pieces.03-meet-the-rook");
  await page.waitForURL(/\/\?locked=/);
  const banner = page.getByRole("alert").filter({ hasText: "locked" });
  await expect(banner).toContainText("Meet the rook");
  await expect(banner).toContainText("locked");
});

test("a guest CAN open a lesson directly by URL once its prerequisite is really completed", async ({ page }) => {
  // The positive case for the same gate: LessonGate must not lock out a
  // guest who has genuinely done the work, just because there's no
  // server session to check against — reading real localStorage
  // completions is enough.
  await page.goto("/learn/meet-the-pieces.01-welcome");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="e1,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="e8,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "False" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Finish lesson" }).click();
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

  await page.goto("/learn/meet-the-pieces.03-meet-the-rook");
  await expect(page).toHaveURL("/learn/meet-the-pieces.03-meet-the-rook");
  await expect(page.locator(".mw-lesson-title")).toHaveText("Meet the rook");
});

test("'What is check?' opens once every Meet the Pieces concept is directly demonstrated, even though its prerequisite is a mastery-challenge lesson", async ({
  page,
}) => {
  // Real, confirmed bug this reproduces exactly as reported live:
  // check-and-checkmate.01-what-is-check's prerequisite is
  // meet-the-pieces.12-unit-mastery-challenge — a lesson that belongs to
  // no principle's subLessonIds at all (a mastery challenge, not an
  // ordinary sub-lesson). The server-side bypass in
  // app/learn/[lessonId]/page.tsx used to look for "the principle
  // containing the missing lesson," which can never exist for a
  // mastery-challenge lesson — so it stayed locked no matter what
  // evidence existed, even directly demonstrating "check" itself. The
  // correct rule (matching LearningPath.tsx's own client-side
  // `unitFullyDemonstrated`) is: bypassed once every principle in the
  // *missing lesson's own unit* is independently proficient.
  const email = `checklock${Date.now()}@example.com`;
  const userId = dbHelper("create-user", { email, password: "password123" });
  for (const conceptId of [
    "board-orientation",
    "rook-movement",
    "bishop-movement",
    "queen-movement",
    "king-movement",
    "knight-movement",
    "pawn-movement",
    "king-safety-castling",
  ]) {
    dbHelper("set-mastery", { userId, conceptId, status: "proficient" });
  }
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  await page.goto("/learn/check-and-checkmate.01-what-is-check");
  await expect(page).not.toHaveURL(/\/\?locked=/);
  await expect(page.getByText("What is check?")).toBeVisible();

  // A PARTIAL result (one concept missing) must still lock it — proves
  // this isn't just an accidentally-disabled gate.
  const email2 = `checklock2${Date.now()}@example.com`;
  const userId2 = dbHelper("create-user", { email: email2, password: "password123" });
  for (const conceptId of [
    "board-orientation",
    "rook-movement",
    "bishop-movement",
    "queen-movement",
    "king-movement",
    "knight-movement",
    "pawn-movement",
    // king-safety-castling deliberately omitted
  ]) {
    dbHelper("set-mastery", { userId: userId2, conceptId, status: "proficient" });
  }
  await page.goto("/login");
  await page.fill("input[name=email]", email2);
  await page.fill("input[name=password]", "password123");
  await page.click("button[type=submit]");
  await page.waitForURL("/");
  await page.goto("/learn/check-and-checkmate.01-what-is-check");
  await expect(page).toHaveURL(/\/\?locked=/);
});

test("the learning path visually distinguishes a demonstrated-but-not-completed lesson from a genuinely completed or untouched one", async ({
  page,
}) => {
  // Real, confirmed gap this closes: a lesson reachable purely from
  // evidence rendered identically to any other "available" lesson (same
  // plain arrow), and a unit's own header showed a bare "0 / N" with no
  // indication that evidence, not neglect, explains the zero — reported
  // live as "the curriculum visually shows 0/13 completed even though
  // large sections are bypassed, without explaining the distinction."
  const email = `demonstrated${Date.now()}@example.com`;
  const userId = dbHelper("create-user", { email, password: "password123" });
  // "Meet the rook"'s own prerequisites are meet-the-pieces.01/02 (the
  // Board basics principle) — seeding its own concept, board-orientation,
  // is what unlocks entry without literally completing them.
  dbHelper("set-mastery", { userId, conceptId: "board-orientation", status: "proficient" });
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.click("button[type=submit]");
  await page.waitForURL("/");
  await ensureFullCurriculumVisible(page);

  const rookRow = page
    .locator(".mw-lesson-node")
    .filter({ has: page.locator(".mw-lesson-node-title", { hasText: "Meet the rook" }) });
  await expect(rookRow).toHaveClass(/mw-lesson-node--demonstrated/);
  await expect(rookRow.getByText("Demonstrated")).toBeVisible();
  await expect(rookRow.getByText(/Open from your placement result/)).toBeVisible();
  // Never confused with a genuine completion — no stars, no "Mastered".
  await expect(rookRow.locator(".mw-stars")).toHaveCount(0);

  // A lesson that's neither completed nor evidence-demonstrated (e.g. the
  // very first, always-open lesson before any real work) must NOT get the
  // demonstrated treatment just because it's "available".
  const welcomeRow = page
    .locator(".mw-lesson-node")
    .filter({ has: page.locator(".mw-lesson-node-title", { hasText: "Welcome to the chessboard" }) });
  await expect(welcomeRow).not.toHaveClass(/mw-lesson-node--demonstrated/);

  // The unit header's own count explains the zero instead of leaving it
  // silent — one demonstrated lesson (the rook) in this fresh account.
  const unitCount = page.locator(".mw-unit-count").first();
  await expect(unitCount).toContainText("demonstrated");
});
