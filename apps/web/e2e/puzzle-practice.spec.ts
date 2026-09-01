import { test, expect } from "./fixtures";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * ADR-0008's Puzzle pool, end to end: a principle's practice puzzles
 * become reachable once its sub-lessons are done, solving one persists a
 * real ExerciseAttempt and (signed-in) advances UserConceptMastery past
 * "learning" per docs/learner-model.md, and the pool isn't reachable
 * before its sub-lessons are finished — mirroring the lesson-gating
 * coverage in progression-guard.spec.ts / cross-unit-progression.spec.ts.
 */

const DB_HELPER = path.join(__dirname, "db-helper.mjs");

function dbHelper(command: string, args: Record<string, unknown> = {}): string {
  return execFileSync("node", [DB_HELPER, command, JSON.stringify(args)], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf-8",
  });
}

async function completeBoardBasicsPrinciple(page: import("@playwright/test").Page) {
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
}

test("puzzle pool is locked until the principle's sub-lessons are complete", async ({ page }) => {
  const email = `puzzlegate${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  // No "Practice puzzles" row yet — board-basics isn't finished.
  await expect(page.getByRole("link", { name: /Practice puzzles/ })).toHaveCount(0);

  // Direct URL navigation is also server-side gated, not just hidden from the UI.
  await page.goto("/practice/meet-the-pieces.board-basics");
  await expect(page).toHaveURL(/^http:\/\/localhost:3000\/\?locked=/);
});

test("completing a principle's sub-lessons unlocks its puzzle pool, and solving a puzzle persists real progress @smoke", async ({
  page,
}) => {
  const email = `puzzlesolve${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  await completeBoardBasicsPrinciple(page);

  const practiceLink = page.getByRole("link", { name: /Practice puzzles/ });
  await expect(practiceLink).toBeVisible();
  await practiceLink.click();
  await page.waitForURL("/practice/meet-the-pieces.board-basics");

  await expect(page.getByText("Puzzle 1/4")).toBeVisible();

  // A wrong tap first: d1 (the queen's square) is not where White's king
  // starts. Folded into this test (rather than its own signup) to keep
  // this file's total signups low — signupAction is rate-limited to
  // 20/hour per IP (lib/rate-limit.ts), a real, deliberate security
  // feature shared with the rest of this suite's own signup-based tests,
  // not something to work around by spending a fresh account per
  // scenario when one account can demonstrate both.
  //
  // Per the P0 curriculum-integrity fix, every Board Basics puzzle is now
  // "select-square" (a single tap, no move) — it assesses only
  // orientation/squares, which is all this pool's own two lessons
  // actually taught; the pool previously (a real, reproduced defect)
  // required king moves nobody had been taught yet.
  await page.locator('[aria-label*="d1,"]').click();
  await expect(page.getByText(/^Not quite\./)).toBeVisible();
  // The puzzle is still on puzzle 1 — a wrong answer doesn't skip ahead.
  await expect(page.getByText("Puzzle 1/4")).toBeVisible();

  // Now solve it correctly. meet-the-pieces.puzzle-board-basics-1: tap e1.
  await page.locator('[aria-label*="e1,"]').click();

  await expect(page.getByText(/^Correct!/)).toBeVisible();
  await expect(page.getByText(/same square this lesson introduced it on/)).toBeVisible(); // successExplanation text, not just "Correct!"
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Puzzle 2/4")).toBeVisible();

  // meet-the-pieces.puzzle-board-basics-2: tap e8.
  await page.locator('[aria-label*="e8,"]').click();
  await expect(page.getByText(/^Correct!/)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Puzzle 3/4")).toBeVisible();
  // meet-the-pieces.puzzle-board-basics-3: tap e4.
  await page.locator('[aria-label*="e4,"]').click();
  await expect(page.getByText(/^Correct!/)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Puzzle 4/4")).toBeVisible();
  // meet-the-pieces.puzzle-board-basics-4: tap c6.
  await page.locator('[aria-label*="c6,"]').click();
  await expect(page.getByText(/^Correct!/)).toBeVisible();
  await page.getByRole("button", { name: "Finish practice" }).click();

  await expect(page.getByRole("heading", { name: "Practice complete!" })).toBeVisible();
  // Real, confirmed bug this reproduces and fixes: PuzzleRunner's summary
  // used to count "puzzles eventually completed" (always equal to
  // puzzles.length once a set is finished, since there's no way to skip
  // an unsolved one) and mislabel it "solved on the first try" — this
  // exact journey (puzzle 1 wrong-then-correct, puzzles 2-4 correct) used
  // to still claim "4 of 4 solved on the first try," which this test
  // itself previously (wrongly) asserted for the old 2-puzzle pool. Only
  // puzzles 2-4 were genuinely first-try.
  await expect(page.getByText("3 of 4 solved on the first try.")).toBeVisible();
  await page.getByRole("link", { name: "Back to learning path" }).click();
  await page.waitForURL("/");

  // The pool stays reachable afterward — practice is repeatable, not a
  // one-shot gate like a lesson's prerequisite chain.
  await expect(page.getByRole("link", { name: /Practice puzzles/ })).toBeVisible();

  // The pattern generalizes beyond meet-the-pieces, on this same signed-in
  // account (not a fresh signup — signupAction is rate-limited to
  // 20/hour per IP, lib/rate-limit.ts, a real security feature shared
  // with the rest of this suite's own signup-based tests, so this file
  // keeps its total signups to the two above). check-and-checkmate and
  // basic-tactics' own lesson content is already exercised elsewhere
  // (lessons.spec.ts, exercise-types.spec.ts, basic-tactics.spec.ts,
  // cross-unit-progression.spec.ts) — seeding the one completed lesson
  // each principle needs (rather than re-driving them through the UI)
  // is enough to prove their puzzle pools gate and solve correctly too,
  // including for a principle with a single sub-lesson (unlike
  // board-basics' two).
  const userId = dbHelper("get-user-id", { email });
  dbHelper("seed-completions", {
    userId,
    lessonIds: ["check-and-checkmate.01-what-is-check", "basic-tactics.01-the-knight-fork"],
  });

  // check-and-checkmate.recognizing-check: rook h1 -> h8 delivers check.
  await page.goto("/practice/check-and-checkmate.recognizing-check");
  await expect(page.getByText("Puzzle 1/2")).toBeVisible();
  await page.locator('[aria-label*="h1,"]').click();
  await page.locator('[aria-label*="h8,"]').click();
  await expect(page.getByText(/^Correct!/)).toBeVisible();
  await expect(page.getByText(/clear line/)).toBeVisible();
  // Real, confirmed defect this guards against: PuzzleRunner used to
  // render the board from the puzzle's fixed starting FEN, never from the
  // move actually played — "Correct!" appeared but the piece visually
  // stayed on its start square. For a "move" puzzle (unlike Board
  // Basics' new "select-square" ones above), the board must reflect the
  // real post-move position once a correct answer is confirmed.
  await expect(page.locator('[aria-label="h8, white rook"]')).toBeVisible();
  await expect(page.locator('[aria-label="h1, empty"]')).toBeVisible();

  // basic-tactics.the-knight-fork: knight c4 -> e5 forks the king and rook.
  // Pool size is 16 (2 hand-authored + 14 imported CC0 Lichess puzzles —
  // see docs/content-review-report.md); the hand-authored puzzle-1 is
  // still served first, since imports were appended, not prepended.
  await page.goto("/practice/basic-tactics.the-knight-fork");
  await expect(page.getByText("Puzzle 1/16")).toBeVisible();
  await page.locator('[aria-label*="c4,"]').click();
  await page.locator('[aria-label*="e5,"]').click();
  await expect(page.getByText(/^Correct!/)).toBeVisible();
  await expect(page.getByText(/forks the king/)).toBeVisible();
});
