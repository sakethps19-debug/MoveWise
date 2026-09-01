import { test, expect } from "./fixtures";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * P1 "make confirmation evidence meaningful": a concept unlocked purely
 * from an inferred placement signal (lib/placementEvidence.ts's
 * `inferred_high_confidence`) can be converted into real, directly
 * confirmed evidence via a short quiz (components/ConfirmationActivity.tsx,
 * app/practice/confirm/[principleId]/page.tsx) — a real ExerciseAttempt
 * per puzzle, a distinct `evidenceLevel` (never conflated with `status`,
 * apps/web/lib/masteryModel.ts's own separate ongoing-skill axis — see
 * app/actions.ts's confirmConceptAction), and a failed attempt that
 * changes evidence honestly without ever punishing the learner.
 */

const DB_HELPER = path.join(__dirname, "db-helper.mjs");

function dbHelper(command: string, args: Record<string, unknown> = {}): string {
  return execFileSync("node", [DB_HELPER, command, JSON.stringify(args)], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf-8",
  });
}

const CONFIRM_URL = "/practice/confirm/meet-the-pieces.board-basics";
const CONCEPT_ID = "board-orientation";

async function signUpFresh(page: import("@playwright/test").Page, email: string) {
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");
}

async function solveBothPuzzlesCorrectly(page: import("@playwright/test").Page) {
  await page.locator('[aria-label*="a1,"]').click();
  await page.locator('[aria-label*="b2,"]').click();
  await expect(page.getByText(/^Correct!/)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Puzzle 2/2")).toBeVisible();
  await page.locator('[aria-label*="e1,"]').click();
  await page.locator('[aria-label*="f2,"]').click();
  await expect(page.getByText(/^Correct!/)).toBeVisible();
  await page.getByRole("button", { name: "Finish practice" }).click();
}

test("solving a concept's confirmation activity first-try promotes it to real, confirmed evidence — never durable mastery", async ({
  page,
}) => {
  const email = `confirm${Date.now()}@example.com`;
  await signUpFresh(page, email);

  await page.goto(CONFIRM_URL);
  await expect(page.getByRole("heading", { name: /Confirm:/ })).toBeVisible();
  await expect(page.getByText(/Your placement result unlocked/)).toBeVisible();
  await expect(page.getByText("Puzzle 1/2")).toBeVisible();

  await solveBothPuzzlesCorrectly(page);

  await expect(page.getByRole("heading", { name: "Thanks — confirmed" })).toBeVisible();
  await expect(page.getByText("2 of 2 solved on the first try.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Back to Board basics/i })).toBeVisible();

  const userId = dbHelper("get-user-id", { email });
  const mastery = JSON.parse(dbHelper("get-user-concept-mastery", { userId, conceptId: CONCEPT_ID }));
  expect(mastery.evidenceLevel).toBe("confirmation_passed");
  expect(mastery.evidenceSource).toBe("confirmation");
  // One passed mini-test is a real, direct check — never automatically
  // "mastered" (that tier needs Play & Learn's gameApplicationScore too,
  // which confirmation never touches — see masteryModel.ts).
  expect(mastery.status).not.toBe("mastered");

  // Never falsely marks any lesson completed — this is evidence about a
  // concept, not a lesson-completion shortcut.
  const progress = JSON.parse(dbHelper("count-progress", { userId }));
  expect(progress.completions).toBe(0);

  // "Record the attempt and questions used" — real ExerciseAttempt rows exist.
  const attemptCount = Number(dbHelper("count-exercise-attempts-for-concept", { userId, conceptId: CONCEPT_ID }));
  expect(attemptCount).toBe(2);
});

test("a wrong answer during confirmation contradicts the evidence honestly without punishing the learner, though it does revoke an inference-only unlock", async ({
  page,
}) => {
  const email = `confirmfail${Date.now()}@example.com`;
  await signUpFresh(page, email);

  // In real usage this activity is only ever reached for a concept
  // already unlocked from a placement inference (PracticeHub's own
  // NEEDS_CONFIRMATION_LEVELS check) — seed that same precondition here
  // so "stays unlocked after a failed confirmation" is a real assertion,
  // not a false pass against a pool that was never reachable at all.
  const userId = dbHelper("get-user-id", { email });
  dbHelper("set-concept-evidence", {
    userId,
    conceptId: CONCEPT_ID,
    evidenceLevel: "inferred_high_confidence",
    evidenceSource: "test-placement-seed",
  });

  await page.goto(CONFIRM_URL);
  await expect(page.getByText("Puzzle 1/2")).toBeVisible();

  // A wrong move first (not a legal single-square king move) — the
  // activity accepts a retry, same as ordinary puzzle practice, but the
  // wrong sub-attempt still counts against "first-try perfect".
  await page.locator('[aria-label*="a1,"]').click();
  await page.locator('[aria-label*="a8,"]').click();
  await expect(page.getByText(/^Not quite\./)).toBeVisible();
  await page.locator('[aria-label*="a1,"]').click();
  await page.locator('[aria-label*="b2,"]').click();
  await expect(page.getByText(/^Correct!/)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.locator('[aria-label*="e1,"]').click();
  await page.locator('[aria-label*="f2,"]').click();
  await expect(page.getByText(/^Correct!/)).toBeVisible();
  await page.getByRole("button", { name: "Finish practice" }).click();

  // Explained as refinement, never as failure — and the recommended next
  // action (review the lesson) is offered right there.
  await expect(page.getByRole("heading", { name: "Thanks — this needs a closer look" })).toBeVisible();
  await expect(page.getByText(/refining what we know about your placement/)).toBeVisible();
  await expect(page.getByText(/not marking anything as failed/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Review the lesson for board orientation/i })).toBeVisible();

  // Real, confirmed bug this reproduces exactly as reported live: this
  // exact journey (puzzle 1 wrong then correct, puzzle 2 correct) used to
  // ALSO show "2 of 2 solved on the first try" on this same screen —
  // PuzzleRunner's `solved` counter tracked "eventually completed," which
  // trivially always equals the puzzle count once a set is finished (there
  // is no way to skip an unsolved puzzle), never actual first-try
  // accuracy. A learner would see "needs a closer look" and "2 of 2 solved
  // on the first try" on the same screen — a direct contradiction. Only 1
  // of the 2 puzzles here was genuinely solved on the first try.
  await expect(page.getByText("1 of 2 solved on the first try.")).toBeVisible();
  await expect(page.getByText("2 of 2 solved on the first try.")).toHaveCount(0);
  await page.waitForTimeout(300);

  const mastery = JSON.parse(dbHelper("get-user-concept-mastery", { userId, conceptId: CONCEPT_ID }));
  expect(mastery.evidenceLevel).toBe("later_contradicted");
  expect(mastery.evidenceSource).toBe("confirmation-failed");
  expect(mastery.evidenceConfidence).toBeLessThan(0.6); // reduced, not zeroed

  // The one wrong sub-attempt is still recorded for real (feeds the
  // practice scheduler's recentIncorrectCount, lib/practiceScheduler.ts).
  const attemptCount = Number(dbHelper("count-exercise-attempts-for-concept", { userId, conceptId: CONCEPT_ID }));
  expect(attemptCount).toBe(3); // 1 wrong + 2 correct

  // The inferred-placement bypass that unlocked this pool is no longer
  // trustworthy once directly contradicted — curriculum correctness
  // reasserting the sub-lesson requirement, not punishment (the redirect
  // itself names the exact lesson to finish, and PracticeHub's own
  // "Review needed" section — asserted below — offers the same path).
  // See app/practice/[principleId]/page.tsx's demonstratedByEvidence
  // check: BYPASS_EVIDENCE_LEVELS deliberately excludes later_contradicted.
  await page.goto("/practice/meet-the-pieces.board-basics");
  await expect(page).toHaveURL(/locked=/);
  await expect(page).toHaveURL(/needs=Board%20basics/);
});

test("a failed confirmation surfaces the concept in Practice's Review needed section, not as a lock", async ({ page }) => {
  const email = `confirmreview${Date.now()}@example.com`;
  await signUpFresh(page, email);
  const userId = dbHelper("get-user-id", { email });
  dbHelper("set-concept-evidence", {
    userId,
    conceptId: CONCEPT_ID,
    evidenceLevel: "inferred_high_confidence",
    evidenceSource: "test-placement-seed",
  });

  await page.goto(CONFIRM_URL);
  await page.locator('[aria-label*="a1,"]').click();
  await page.locator('[aria-label*="a8,"]').click(); // wrong on purpose
  await expect(page.getByText(/^Not quite\./)).toBeVisible();
  await page.locator('[aria-label*="a1,"]').click();
  await page.locator('[aria-label*="b2,"]').click();
  await expect(page.getByText(/^Correct!/)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="e1,"]').click();
  await page.locator('[aria-label*="f2,"]').click();
  await page.getByRole("button", { name: "Finish practice" }).click();
  await expect(page.getByRole("heading", { name: "Thanks — this needs a closer look" })).toBeVisible();

  await page.goto("/practice");
  await expect(page.getByRole("heading", { name: "Review needed" })).toBeVisible();
  await expect(page.locator(".mw-review-needed-item-title", { hasText: "Board basics" })).toBeVisible();
});

test("a real placement run's inferred concept actually surfaces the confirm prompt on Practice — not just reachable by guessing the URL", async ({
  page,
}) => {
  // Real, confirmed bug this guards against: app/practice/page.tsx's
  // unconfirmedConceptIds used to exclude a concept the instant ANY
  // UserConceptMastery row existed for it — but submitPlacementAction
  // (app/actions.ts) itself writes a "proficient" row immediately for
  // every inferred_high_confidence concept (it's in BYPASS_EVIDENCE_LEVELS,
  // same set the pool-unlock bypass trusts), so that row already existed
  // by the time this page loaded. The "confirm your placement result?"
  // prompt was therefore unreachable for any signed-in learner through its
  // only real discovery path, ever — every other test in this file reaches
  // ConfirmationActivity by navigating straight to its URL, which has no
  // such gate and would never have caught this.
  const email = `placementconfirm${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  await page.goto("/placement");
  // Exactly 2 of the 4 foundational items (movement-rook, movement-bishop)
  // correct, the other 2 (movement-queen, movement-knight) wrong via each
  // item's own king one-square move — the documented FOUNDATIONAL_PASS_COUNT
  // threshold (lib/placement.ts) that grants inferred_high_confidence to
  // every foundational-cluster concept no single item directly tests,
  // "board-orientation" (meet-the-pieces.board-basics) among them.
  await page.locator('[aria-label*="d1,"]').click();
  await page.locator('[aria-label*="d3,"]').click();
  await expect(page.getByText(/^Correct!/)).toBeVisible();
  await page.getByRole("button", { name: /Continue|Next question/ }).click();

  await page.locator('[aria-label*="c1,"]').click();
  await page.locator('[aria-label*="h6,"]').click();
  await expect(page.getByText(/^Correct!/)).toBeVisible();
  await page.getByRole("button", { name: /Continue|Next question/ }).click();

  await page.locator('[aria-label*="e1,"]').click();
  await page.locator('[aria-label*="e2,"]').click(); // movement-queen's own king, not the queen's move
  await expect(page.getByText(/^Not quite\./)).toBeVisible();
  await page.getByRole("button", { name: /Next question|See my result/ }).click();

  await page.locator('[aria-label*="e1,"]').click();
  await page.locator('[aria-label*="e2,"]').click(); // movement-knight's own king
  await expect(page.getByText(/^Not quite\./)).toBeVisible();
  await page.getByRole("button", { name: /Next question|See my result/ }).click();

  // Remaining core/advanced items, answered correctly so nothing else
  // about this run is in question — only the foundational cluster's 2/4
  // result matters for this test.
  const remainingCorrectMoves = [
    { from: "e5", to: "e8" }, // recognize-check
    { from: "e1", to: "e8" }, // recognize-checkmate
    { from: "b1", to: "c3" }, // hanging-piece
    { from: "c4", to: "e5" }, // knight-fork
    { from: "e1", to: "g1" }, // king-safety-castling
    { from: "f1", to: "f3" }, // decision-capture-checker
    { from: "d1", to: "g4" }, // trade-evaluation
    { from: "g1", to: "f3" }, // opening-development
    { from: "h2", to: "h3" }, // back-rank-safety
    { from: "e5", to: "f6" }, // endgame-king-escort
  ];
  for (const { from, to } of remainingCorrectMoves) {
    await page.locator(`[aria-label*="${from},"]`).click();
    await page.locator(`[aria-label*="${to},"]`).click();
    await expect(page.getByText(/^Correct!/)).toBeVisible();
    await page.getByRole("button", { name: /Continue|See my result/ }).click();
  }

  await expect(page.getByRole("heading", { name: /Placement result:/ })).toBeVisible();

  const userId = dbHelper("get-user-id", { email });
  const mastery = JSON.parse(dbHelper("get-user-concept-mastery", { userId, conceptId: CONCEPT_ID }));
  expect(mastery.status).toBe("proficient"); // confirms the precondition this test exists to catch
  expect(mastery.evidenceLevel).toBeFalsy(); // not yet confirmed — the prompt should still be offered

  await page.goto("/practice");
  // Several foundational-cluster concepts (king movement, pawn movement,
  // board-orientation) are all untested by any single item, so all three
  // get the same confirm prompt — assert on the one this test cares about
  // by its href, not by (necessarily ambiguous) link text.
  const confirmLink = page.locator(`a[href="/practice/confirm/meet-the-pieces.board-basics"]`);
  await expect(confirmLink).toBeVisible();
  await expect(confirmLink).toHaveText(/This was unlocked from your placement result, not directly tested — confirm it\?/);
  await confirmLink.click();
  await expect(page).toHaveURL(CONFIRM_URL);
});
