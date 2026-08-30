import { test, expect } from "./fixtures";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { gotoGuestLesson } from "./testHelpers";

/**
 * P1 "connect the practice pipeline end to end": lib/practiceScheduler.ts's
 * rankConceptsForPractice/buildPracticeQueue/computeReviewSchedule are
 * already unit-tested in isolation (lib/practiceScheduler.test.ts) — this
 * file instead proves each *evidence source* the product brief named
 * actually reaches those functions through the real, wired-up production
 * path (a real lesson mistake, a real analysed-game weakness, a real
 * failed confirmation, a real guest-to-account migration), not just that
 * the pure scheduling math is correct in isolation. Two real, confirmed
 * gaps found and fixed while building this coverage:
 *
 *   1. app/practice/warm-up/page.tsx built its `placementEvidenceLevel`
 *      signal from PlacementAttempt.conceptEvidence — a snapshot frozen at
 *      placement-submission time — and never looked at the live, per-
 *      concept UserConceptMastery.evidenceLevel that confirmConceptAction
 *      (and, since this pass, ordinary practice — see #2) actually write.
 *      A `later_contradicted`/`confirmation_passed` evidenceLevel could
 *      therefore never once change what the Daily Warm-up served, no
 *      matter how much real evidence accumulated after placement.
 *   2. app/actions.ts's recomputeMasteryForConcepts (the one shared
 *      recompute every evidence source funnels through) never touched
 *      evidenceLevel at all — only confirmConceptAction's own failure
 *      branch ever wrote `later_contradicted`, even though
 *      lib/placementEvidence.ts's own ConceptEvidenceLevel doc comment
 *      promises this for "practice, a lesson, a game, or a failed
 *      confirmation attempt" alike.
 *
 * A real account is created directly via db-helper.mjs and logged in via
 * /login where a test doesn't need signup itself, to draw from the
 * separate login rate-limit budget instead of signupAction's shared one
 * (see remediation.spec.ts/practice-hub.spec.ts's own note on this).
 */

const DB_HELPER = path.join(__dirname, "db-helper.mjs");

function dbHelper(command: string, args: Record<string, unknown> = {}): string {
  return execFileSync("node", [DB_HELPER, command, JSON.stringify(args)], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf-8",
  });
}

async function loginAs(page: import("@playwright/test").Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL("/");
}

test("a real lesson mistake recomputes mastery to struggling, contradicts prior placement-level evidence, sets a new review due date, and outranks everything else in the Daily Warm-up", async ({
  page,
}) => {
  // A full lesson flow (2 explain continues + 2 move-piece steps, several
  // deliberate wrong attempts each) plus a signup/login and a second page
  // navigation is genuinely more real UI interaction than the suite's
  // 45s default budgets for — same reasoning as cross-unit-progression
  // .spec.ts's own test.setTimeout(90_000).
  test.setTimeout(90_000);
  const email = `lessonmistake${Date.now()}@example.com`;
  const password = "password123";
  dbHelper("create-user", { email, password });
  await loginAs(page, email, password);

  const userId = dbHelper("get-user-id", { email });
  // Unlocks lesson-03's own single prerequisite (lesson.prerequisites,
  // packages/content) without replaying it through the UI — this test is
  // about the mistakes *inside* lesson-03, not re-proving sequencing
  // (learning-path.spec.ts already covers that).
  dbHelper("seed-completions", { userId, lessonIds: ["meet-the-pieces.02-ranks-files-squares"] });
  // lesson-03 is "the rook" principle's first sub-lesson, so entering it
  // also requires the *previous* principle's concept (board-orientation,
  // "Board basics") to already be proficient — app/learn/[lessonId]/page.tsx's
  // own principle-unlock gate, separate from the prerequisites check above.
  dbHelper("set-mastery", { userId, conceptId: "board-orientation", status: "proficient" });
  // Simulates having placement-level confidence in rook-movement already
  // (the same field submitPlacementAction/confirmConceptAction write) —
  // real subsequent practice contradicting this is exactly gap #2 above.
  dbHelper("set-concept-evidence", { userId, conceptId: "rook-movement", evidenceLevel: "directly_demonstrated" });

  await page.goto("/learn/meet-the-pieces.03-meet-the-rook");
  await page.getByRole("button", { name: "Continue" }).click(); // step-1 explain

  // step-2: move-piece, rook e4, acceptAnyLegalMove — e4->a1 is off the
  // rook's rank/file, genuinely illegal, so it's always wrong regardless
  // of that flag (same move retry-and-hearts.spec.ts already relies on).
  await page.locator('[aria-label*="e4,"]').click();
  await page.locator('[aria-label*="a1,"]').click();
  await expect(page.locator('p[role="alert"]')).toBeVisible();
  await page.locator('[aria-label*="e4,"]').click();
  await page.locator('[aria-label*="a1,"]').click();
  await expect(page.locator('p[role="alert"]')).toBeVisible();
  await page.locator('[aria-label*="e4,"]').click();
  await page.locator('[aria-label*="e8,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-3: move-piece, rook must capture on d4 — e4->b1 is off the
  // rook's rank/file (illegal), and not the required capture either way.
  await page.locator('[aria-label*="e4,"]').click();
  await page.locator('[aria-label*="b1,"]').click();
  await expect(page.locator('p[role="alert"]')).toBeVisible();
  await page.locator('[aria-label*="e4,"]').click();
  await page.locator('[aria-label*="d4,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: "Finish lesson" }).click();
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible({ timeout: 15_000 });

  // 5 total attempts (3 wrong, 2 correct) -> 0.4 accuracy, >= 3 attempts:
  // computeMasteryStatus's own already-tested "struggling" threshold.
  const attemptCount = Number(dbHelper("count-exercise-attempts-for-concept", { userId, conceptId: "rook-movement" }));
  expect(attemptCount).toBe(5);

  const mastery = JSON.parse(dbHelper("get-user-concept-mastery", { userId, conceptId: "rook-movement" }));
  expect(mastery.status).toBe("struggling");
  // Gap #2: an ordinary run of lesson mistakes, not just a failed
  // confirmation, now also contradicts a placement-level evidenceLevel.
  expect(mastery.evidenceLevel).toBe("later_contradicted");
  expect(mastery.evidenceSource).toBe("contradicted-by-practice");
  // "review completion sets a new due date" — a real nextRevisionDueAt now
  // exists (computeReviewSchedule, lib/practiceScheduler.ts), where before
  // this lesson there was no UserConceptMastery row for rook-movement at all.
  expect(mastery.nextRevisionDueAt).toBeTruthy();

  // The struggling concept this just created dominates every other
  // concept (all untouched, scoring far lower) in the very next Daily
  // Warm-up — rankConceptsForPractice's own STATUS_WEIGHT["struggling"]
  // plus the recent-mistakes bonus, reached through the real page.
  await page.goto("/practice/warm-up");
  await expect(page.getByText(/Puzzle 1\//)).toBeVisible();
  const pickText = await page.getByText(/Today's pick:/).textContent();
  expect(pickText).toMatch(/struggling|missed/);
});

test("an analysed-game weakness (a real gameId-tagged ExerciseAttempt row, same shape recordGameMistakesAndUpdateMastery writes) reaches the Daily Warm-up exactly like a lesson or puzzle mistake", async ({
  page,
}) => {
  const email = `gameweakness${Date.now()}@example.com`;
  const password = "password123";
  dbHelper("create-user", { email, password });
  const userId = dbHelper("get-user-id", { email });

  // Same shape app/actions.ts's recordGameMistakesAndUpdateMastery writes
  // for a real detected mistake from a real analysed game (gameId set,
  // always correct: false) — driving a full live Stockfish game to
  // produce a *specific*, chosen conceptId's mistake isn't deterministic,
  // so this seeds the identical row shape directly rather than replaying
  // Play mode + analysis end to end (which has its own coverage in
  // play-analysis.spec.ts, unrelated to the scheduler question this file
  // is about).
  dbHelper("seed-game-mistake", { userId, conceptId: "knight-fork", count: 3 });
  // Drives the same pure functions (computeMasteryStatus,
  // computeReviewSchedule) recomputeMasteryForConcepts calls, over those
  // same real ExerciseAttempt rows — see db-helper.mjs's own doc comment.
  const recomputed = JSON.parse(dbHelper("recompute-mastery", { userId, conceptId: "knight-fork" }));
  expect(recomputed.status).toBe("struggling");

  await loginAs(page, email, password);
  await page.goto("/practice/warm-up");
  await expect(page.getByText(/Puzzle 1\//)).toBeVisible();
  // Every other concept in the whole candidate set is completely
  // untouched for this fresh account — knight-fork's struggling status
  // (plus its 3 recent-incorrect game-derived attempts) is the only real
  // signal, so it's unambiguously today's top pick.
  const pickText = await page.getByText(/Today's pick:/).textContent();
  expect(pickText).toMatch(/struggling|missed/);
});

test("a live, per-concept evidenceLevel contradiction reaches the Daily Warm-up even for an account with no PlacementAttempt row at all", async ({
  page,
}) => {
  // Isolates gap #1 above precisely: before the fix, app/practice/warm-up
  // /page.tsx's placementEvidenceLevel signal came only from
  // PlacementAttempt.conceptEvidence — an account that never took
  // placement has no such row, so this concept's evidenceLevel (however
  // it got set — a failed confirmation, or the ordinary-practice
  // contradiction gap #2 fixes) could never reach the ranking at all.
  const email = `evidencewiring${Date.now()}@example.com`;
  const password = "password123";
  dbHelper("create-user", { email, password });
  const userId = dbHelper("get-user-id", { email });
  dbHelper("set-concept-evidence", { userId, conceptId: "rook-movement", evidenceLevel: "later_contradicted", evidenceSource: "test-seed" });

  await loginAs(page, email, password);
  await page.goto("/practice/warm-up");
  await expect(page.getByText(/Puzzle 1\//)).toBeVisible();
  const pickText = await page.getByText(/Today's pick:/).textContent();
  expect(pickText).toMatch(/contradicted your placement result on this/);
});

test("a failed placement-confirmation attempt changes what the very next Daily Warm-up serves", async ({ page }) => {
  const email = `confirmqueue${Date.now()}@example.com`;
  const password = "password123";
  dbHelper("create-user", { email, password });
  const userId = dbHelper("get-user-id", { email });
  // Same precondition placement-confirmation.spec.ts's own failing-attempt
  // test seeds — a concept unlocked purely by inference, reachable via the
  // real confirmation route.
  dbHelper("set-concept-evidence", { userId, conceptId: "board-orientation", evidenceLevel: "inferred_high_confidence" });
  await loginAs(page, email, password);

  await page.goto("/practice/confirm/meet-the-pieces.board-basics");
  await expect(page.getByText("Puzzle 1/2")).toBeVisible();
  // Wrong first (not a legal single-square king move), then correct — same
  // exact fail-then-pass move sequence as placement-confirmation.spec.ts.
  await page.locator('[aria-label*="a1,"]').click();
  await page.locator('[aria-label*="a8,"]').click();
  await expect(page.getByText(/^Not quite\./)).toBeVisible();
  await page.locator('[aria-label*="a1,"]').click();
  await page.locator('[aria-label*="b2,"]').click();
  await expect(page.getByText(/^Correct!/)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="e1,"]').click();
  await page.locator('[aria-label*="f2,"]').click();
  await page.getByRole("button", { name: "Finish practice" }).click();
  await expect(page.getByRole("heading", { name: "Thanks — this needs a closer look" })).toBeVisible();

  const mastery = JSON.parse(dbHelper("get-user-concept-mastery", { userId, conceptId: "board-orientation" }));
  expect(mastery.evidenceLevel).toBe("later_contradicted");

  // The concept the failed confirmation just touched is the only one with
  // any real evidence at all for this fresh account, so it's the queue's
  // top pick — proving the failure genuinely changed what's served next,
  // not just what's recorded in the database.
  await page.goto("/practice/warm-up");
  await expect(page.getByText(/Puzzle 1\//)).toBeVisible();
  const pickText = await page.getByText(/Today's pick:/).textContent();
  expect(pickText).not.toMatch(/keeping your skills sharp/);
  expect(pickText).toMatch(/missed|contradicted/);
});

test("guest/account sync doesn't duplicate review work: a stale, uncleared local guest-progress blob doesn't re-migrate on every later login", async ({
  page,
}) => {
  test.setTimeout(90_000); // a full guest lesson + signup + logout + login, same reasoning as the lesson-mistake test above
  // Real, confirmed gap this locks in: migrateGuestProgress
  // (app/actions.ts) runs on every signup *and* login that carries a
  // non-empty guestProgress field, and nothing ever clears the browser's
  // localStorage afterward — login/LoginForm.tsx and signup/page.tsx both
  // read it fresh from localStorage on every page load. Before this fix,
  // each subsequent login on the same browser re-synthesized and
  // re-inserted the same batch of ExerciseAttempt rows, inflating the
  // concept's attempt history and pushing nextRevisionDueAt out further
  // on every login even though no real practice happened.
  await gotoGuestLesson(page, "meet-the-pieces.01-welcome");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  // step-3: select-square, correctSquares=['e1']. One wrong, then correct.
  await page.locator('[aria-label*="a1,"]').click();
  await page.locator('[aria-label*="e1,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  // step-4: select-square, correctSquares=['e8'].
  await page.locator('[aria-label*="e8,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "False" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Finish lesson" }).click();
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();

  const email = `guestsync${Date.now()}@example.com`;
  const password = "password123";
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  const userId = dbHelper("get-user-id", { email });
  const afterSignup = JSON.parse(dbHelper("count-progress", { userId }));
  expect(afterSignup.attempts).toBeGreaterThan(0); // the guest's real mistake+completion migrated in for real

  // Log out, then back in on the *same* browser context — localStorage
  // (and its stale guestProgress blob) is never cleared by migration, so
  // the login form resends the exact same data again.
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("/");
  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  const afterSecondLogin = JSON.parse(dbHelper("count-progress", { userId }));
  // The fix: gated on `!existing` in migrateGuestProgress, so a repeat
  // login carrying the same stale data is a no-op for ExerciseAttempt/
  // mastery — not doubled.
  expect(afterSecondLogin.attempts).toBe(afterSignup.attempts);
  expect(afterSecondLogin.completions).toBe(afterSignup.completions);
  expect(afterSecondLogin.mastery).toBe(afterSignup.mastery);
});
