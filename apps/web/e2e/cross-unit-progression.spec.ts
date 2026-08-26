import { test, expect } from "./fixtures";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Cross-unit progression coverage. `LearningPath.tsx`/`app/learn/[lessonId]/
 * page.tsx`'s gating code is unit-agnostic (same code path for every unit),
 * but that's an implementation detail, not a substitute for verifying the
 * actual cross-unit behavior it produces — meet-the-pieces -> check-and-
 * checkmate -> basic-tactics is the only real 3-unit boundary this app has,
 * and it's never been driven end-to-end by a test before this file.
 *
 * Meet-the-pieces lessons 2-11 and 13 are seeded directly (via db-helper.mjs, see
 * that file's own doc comment for why it's a separate process rather than
 * a direct `@movewise/db` import here) rather than clicked through — their
 * own content/interactions are already covered by other specs
 * (lessons.spec.ts, retry-and-hearts.spec.ts, accessibility.spec.ts,
 * chessboard-geometry.spec.ts all drive lessons in this unit for real);
 * what this file adds is the boundary behavior, which only needs those
 * lessons to be *completed*, not re-proven. The two lessons that matter
 * most for this file's own claims — meet-the-pieces.01 (regression) and
 * meet-the-pieces.12, the unit's actual mastery-challenge lesson (the
 * concrete "completing the final lesson unlocks the next unit" claim) —
 * are driven for real, as are check-and-checkmate.01/.02.
 * check-and-checkmate.03 is seeded too: its mini-game step requires
 * actually winning a live Stockfish endgame, which exercise-types.spec.ts
 * already exercises directly (it verifies the engine replies to a played
 * move); re-solving the endgame here would test the engine integration a
 * second time, not the gating logic this file is for.
 */

function uniqueEmail(prefix: string) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
}

const DB_HELPER = path.join(__dirname, "db-helper.mjs");

function dbHelper(command: string, args: Record<string, unknown> = {}): string {
  return execFileSync("node", [DB_HELPER, command, JSON.stringify(args)], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf-8",
  });
}

const MEET_THE_PIECES_MIDDLE_LESSONS = [
  "meet-the-pieces.02-ranks-files-squares",
  "meet-the-pieces.03-meet-the-rook",
  "meet-the-pieces.04-rook-captures",
  "meet-the-pieces.05-meet-the-bishop",
  "meet-the-pieces.06-bishop-colours",
  "meet-the-pieces.07-meet-the-queen",
  "meet-the-pieces.08-meet-the-king",
  "meet-the-pieces.09-meet-the-knight",
  "meet-the-pieces.10-meet-the-pawn",
  "meet-the-pieces.11-capturing-piece-values",
  "meet-the-pieces.13-king-safety-and-castling",
];

async function completeMeetThePiecesWelcome(page: import("@playwright/test").Page) {
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
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();
  await page.getByRole("link", { name: "Back to learning path" }).click();
  await page.waitForURL("/");
}

test("cross-unit progression: final-lesson unlock, unrelated-unit lock, persistence, replay safety, dev reset", async ({
  page,
}) => {
  test.setTimeout(90_000);

  const email = uniqueEmail("crossunit");
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  const userId = dbHelper("get-user-id", { email });

  // --- Regression: existing meet-the-pieces progression still works ---
  await completeMeetThePiecesWelcome(page);
  await expect(page.locator(".mw-nav-xp-value")).toHaveText("30 XP");

  // --- Arrange: seed the rest of meet-the-pieces as completed — a
  // deliberate shortcut around re-testing already-covered lesson content,
  // not around the gating logic itself (see file doc comment). ---
  dbHelper("seed-completions", { userId, lessonIds: MEET_THE_PIECES_MIDDLE_LESSONS });

  // A lesson gated by a not-yet-completed prerequisite in a *later* unit
  // still safely redirects, not crashes, even with most of the previous
  // unit done.
  await page.goto("/learn/check-and-checkmate.01-what-is-check");
  await page.waitForURL(/\/\?locked=/);

  // --- Complete the unit's actual final/mastery-check lesson for real —
  // the concrete proof that finishing it (not just "enough lessons") is
  // what unlocks the next unit. ---
  await page.goto("/learn/meet-the-pieces.12-unit-mastery-challenge");
  await expect(page).toHaveURL("/learn/meet-the-pieces.12-unit-mastery-challenge"); // not redirected: prerequisite satisfied
  await page.getByRole("button", { name: "Continue" }).click(); // step-1 explain
  await page.locator('[aria-label*="g6,"]').click(); // step-2 select-square
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="b5,"]').click(); // step-3 move-piece: rook b5-b1
  await page.locator('[aria-label*="b1,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="e4,"]').click(); // step-4 capture: bishop e4xd5
  await page.locator('[aria-label*="d5,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "False" }).click(); // step-5 true-false
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="c3,"]').click(); // step-6 find-legal-move: knight c3-d5
  await page.locator('[aria-label*="d5,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="g4,"]').click(); // step-7 capture: pawn g4xf5
  await page.locator('[aria-label*="f5,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="c5,"]').click(); // step-8 move-piece: king c5-b5
  await page.locator('[aria-label*="b5,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "A rook" }).click(); // step-9 mcq
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Complete mastery challenge" }).click(); // step-10 review
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();
  await page.getByRole("link", { name: "Back to learning path" }).click();
  await page.waitForURL("/");

  // --- The next unit's first lesson is now unlocked ---
  await page.goto("/learn/check-and-checkmate.01-what-is-check");
  await expect(page).toHaveURL("/learn/check-and-checkmate.01-what-is-check");

  // --- A unit two steps further out stays locked — completing the
  // immediately-previous unit does not cascade-unlock everything after it. ---
  await page.goto("/learn/basic-tactics.01-the-knight-fork");
  await page.waitForURL(/\/\?locked=/);

  // A locked lesson cannot be opened through the UI either: its learning-path
  // row renders no anchor at all (aria-disabled div, not a Link).
  await page.goto("/");
  const basicTacticsRow = page
    .locator(".mw-lesson-node")
    .filter({ has: page.locator(".mw-lesson-node-title", { hasText: "The knight fork" }) });
  await expect(basicTacticsRow).toContainText("🔒");
  await expect(page.locator("a", { hasText: "The knight fork" })).toHaveCount(0);

  // --- Complete check-and-checkmate.01 and .02 for real ---
  await page.goto("/learn/check-and-checkmate.01-what-is-check");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="h8,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Get out of check, no matter what" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Finish lesson" }).click();
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();
  await page.getByRole("link", { name: "Back to learning path" }).click();
  await page.waitForURL("/");

  await page.goto("/learn/check-and-checkmate.02-what-is-checkmate");
  await expect(page).toHaveURL("/learn/check-and-checkmate.02-what-is-checkmate"); // intra-unit proficiency gate satisfied
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="e8,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "False" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Finish lesson" }).click();
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();
  await page.getByRole("link", { name: "Back to learning path" }).click();
  await page.waitForURL("/");

  // --- Still locked: basic-tactics needs check-and-checkmate.03 too, not
  // just "some progress" in check-and-checkmate. ---
  await page.goto("/learn/basic-tactics.01-the-knight-fork");
  await page.waitForURL(/\/\?locked=/);

  // Seed the unit's final lesson (its own mini-game is real-tested in
  // exercise-types.spec.ts — see file doc comment).
  dbHelper("seed-completions", { userId, lessonIds: ["check-and-checkmate.03-thinking-under-check"] });

  // --- Now unlocked: the third unit opens once the second unit's final
  // lesson is actually done. ---
  await page.goto("/learn/basic-tactics.01-the-knight-fork");
  await expect(page).toHaveURL("/learn/basic-tactics.01-the-knight-fork");
  await expect(page.getByText("The knight fork", { exact: true })).toBeVisible();

  // --- Persistence: a hard reload re-fetches from the server, not a client cache ---
  // Filtered by the row's own title element, not a role/name match on the
  // whole link — visiting the lesson page above (to check the unlock)
  // correctly marked it "in progress" (lib/lessonProgressUI.ts), which
  // adds a subtitle to the row's accessible name.
  await page.goto("/");
  await page.reload();
  const knightForkRow = page
    .locator(".mw-lesson-node")
    .filter({ has: page.locator(".mw-lesson-node-title", { hasText: "The knight fork" }) });
  await expect(knightForkRow).not.toContainText("🔒");
  await expect(page.locator("a").filter({ has: knightForkRow })).toHaveCount(1); // still a real, clickable link
  const totalXpBeforeReplay = await page.locator(".mw-nav-xp-value").textContent();

  // --- Replaying an already-completed lesson does not duplicate progression ---
  const completionCountBefore = dbHelper("count-completions", { userId, lessonId: "meet-the-pieces.01-welcome" });
  await completeMeetThePiecesWelcome(page);
  const completionCountAfter = dbHelper("count-completions", { userId, lessonId: "meet-the-pieces.01-welcome" });
  expect(completionCountAfter, "replaying a lesson must update its one row, not add a second").toBe(
    completionCountBefore,
  );
  const totalXpAfterReplay = await page.locator(".mw-nav-xp-value").textContent();
  expect(totalXpAfterReplay, "an identical-performance replay must not grant extra XP").toBe(totalXpBeforeReplay);

  // Nothing regressed elsewhere from the replay.
  await page.goto("/learn/basic-tactics.01-the-knight-fork");
  await expect(page).toHaveURL("/learn/basic-tactics.01-the-knight-fork");

  // --- Dev reset restores the intended initial state, for real (checked
  // against the database, not just the UI's word for it) ---
  await page.goto("/");
  await page.getByRole("button", { name: "Reset progress" }).click();
  await expect(page.getByText("Progress reset.")).toBeVisible();
  await page.reload();

  await expect(page.locator(".mw-nav-xp-value")).toHaveText("0 XP");
  const progressAfterReset = JSON.parse(dbHelper("count-progress", { userId })) as {
    completions: number;
    mastery: number;
    attempts: number;
  };
  expect(progressAfterReset).toEqual({ completions: 0, mastery: 0, attempts: 0 });

  // Only the very first lesson is available again — every unit boundary
  // this test unlocked is re-locked.
  await page.goto("/learn/check-and-checkmate.01-what-is-check");
  await page.waitForURL(/\/\?locked=/);
  await page.goto("/learn/basic-tactics.01-the-knight-fork");
  await page.waitForURL(/\/\?locked=/);
  await expect(page).toHaveURL(/\/\?locked=/);
  await page.goto("/learn/meet-the-pieces.01-welcome");
  await expect(page).toHaveURL("/learn/meet-the-pieces.01-welcome"); // still open — the first lesson is never locked
});
