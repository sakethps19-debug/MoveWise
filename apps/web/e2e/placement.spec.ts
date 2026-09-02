import { test, expect } from "./fixtures";
import { execFileSync } from "node:child_process";
import path from "node:path";

const DB_HELPER = path.join(__dirname, "db-helper.mjs");

function dbHelper(command: string, args: Record<string, unknown> = {}): string {
  return execFileSync("node", [DB_HELPER, command, JSON.stringify(args)], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf-8",
  });
}

/** Every move in packages/content/puzzles/placement.json's item order, verified legal via chess.js before this file was written (see the session's own content-authoring verification). Answering every one correctly exercises the full 14-item adaptive sequence end to end. */
const ALL_CORRECT_MOVES: { from: string; to: string }[] = [
  { from: "d1", to: "d3" }, // movement-rook
  { from: "c1", to: "h6" }, // movement-bishop
  { from: "d4", to: "g1" }, // movement-queen
  { from: "b1", to: "d2" }, // movement-knight
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

async function answerCorrectly(page: import("@playwright/test").Page, from: string, to: string) {
  await page.locator(`[aria-label*="${from},"]`).click();
  await page.locator(`[aria-label*="${to},"]`).click();
  await expect(page.getByText(/^Correct!/)).toBeVisible();
  const continueBtn = page.getByRole("button", { name: /Continue|See my result/ });
  await continueBtn.click();
}

test("a rated guest who aces the placement assessment unlocks tactics practice immediately, with zero lessons completed @smoke", async ({
  page,
}) => {
  await page.goto("/placement");
  await expect(page.getByText("Placement assessment")).toBeVisible();

  for (const { from, to } of ALL_CORRECT_MOVES) {
    await answerCorrectly(page, from, to);
  }

  await expect(page.getByRole("heading", { name: /Placement result: Intermediate concepts demonstrated/ })).toBeVisible();
  await expect(page.getByText(/14 of 14 answered correctly/)).toBeVisible();
  const goToTactics = page.getByRole("link", { name: "Go to tactics practice" });
  await expect(goToTactics).toBeVisible();
  await goToTactics.click();
  await page.waitForURL("/practice");

  // Real, confirmed bug this fixes: basic-tactics' own puzzle pools used to
  // require literally completing meet-the-pieces + check-and-checkmate's
  // lessons first, no matter what a placement assessment demonstrated.
  const knightForkPool = page.getByRole("link", { name: /The knight fork/ });
  await expect(knightForkPool).toBeVisible();
  await knightForkPool.click();
  await expect(page.getByText("Puzzle 1/")).toBeVisible();

  // The homepage reflects it too — no "Welcome to the chessboard" default.
  // Placement was never designed to test Tactical Vision's own patterns
  // (forks/pins/skewers/etc — genuinely new material, not implied by
  // foundational movement/blunder-recognition items), so acing it
  // honestly routes to the real remaining gap as the next thing to learn.
  //
  // P0 "make placement evidence honest" changed what that gap is: placement
  // no longer marks opposition-key-squares directly_demonstrated from the
  // single elementary endgame-king-escort move (see lib/placement.ts's own
  // doc comment on that item — a real, reported overclaim, not this test's
  // concern). basic-tactics.05-the-opposition (the unit's *last* principle)
  // is therefore correctly still un-demonstrated even after a perfect
  // 14/14, so the homepage recommends finishing it before Tactical Vision —
  // a more honest recommendation than before this fix, not a regression.
  await page.goto("/");
  const continueCard = page.locator(".mw-continue-card");
  await expect(continueCard.getByText("Start here")).toBeVisible();
  await expect(continueCard.getByText("King and pawn endings: the opposition")).toBeVisible();
});

test("a guest who aces the placement assessment can open 'What is check?' directly by URL, even though its prerequisite is meet-the-pieces' own mastery-challenge lesson @smoke", async ({
  page,
}) => {
  // Real, confirmed live bug (reproduction #2 of the P0 "guest and account
  // availability" defect): check-and-checkmate.01-what-is-check's own
  // prerequisite is meet-the-pieces.12-unit-mastery-challenge — a lesson
  // that belongs to no principle's own subLessonIds, so the old
  // components/LessonGate.tsx (a THIRD, independent reimplementation of
  // lesson-gating logic that checked only literal readGuestProgress()
  // completions, never placement evidence at all) could never unlock it
  // for a guest, no matter what their placement demonstrated — even
  // though the homepage's own recommendation and a signed-in learner's
  // server-side route guard both correctly treated a fully-demonstrated
  // meet-the-pieces unit as satisfying it. Fixed by having LessonGate call
  // the exact same statusOf/unlockReason functions (lib/lessonStatus.ts)
  // every other surface already uses, via the shared
  // computeGuestDemonstratedConceptIds() evidence-gathering step.
  await page.goto("/placement");
  for (const { from, to } of ALL_CORRECT_MOVES) {
    await answerCorrectly(page, from, to);
  }
  await expect(page.getByRole("heading", { name: /Placement result: Intermediate concepts demonstrated/ })).toBeVisible();

  // Direct URL navigation, not a card click — the client-side route guard
  // (LessonGate) itself is what's under test here, not LearningPath's card
  // rendering (already covered by the "Start here" assertion in the
  // previous test).
  await page.goto("/learn/check-and-checkmate.01-what-is-check");
  await expect(page).not.toHaveURL(/\/\?locked=/);
  await expect(page.getByText(/is locked until/)).toHaveCount(0);
  await expect(page.getByText("What is check?")).toBeVisible();
  await expect(page.getByText("Step 1/")).toBeVisible();
});

test("a placement assessment failed at the foundational level ends early, recommends starting from the beginning, and demonstrates nothing", async ({
  page,
}) => {
  await page.goto("/placement");

  // Each foundational item's own king has a one-square move that isn't
  // that item's correct answer — a legal, real, wrong answer, not a no-op
  // click. Real, confirmed bug this test guards against: reusing
  // PuzzleRunner's "retry until correct" footer left a wrong answer with
  // no way to reach the next question at all (see PlacementItemFooter).
  const wrongMoves = [
    { from: "e1", to: "e2" }, // movement-rook's own king, not the rook's move
    { from: "e1", to: "e2" }, // movement-bishop's own king
    { from: "e1", to: "e2" }, // movement-queen's own king
    { from: "e1", to: "e2" }, // movement-knight's own king
  ];
  for (const { from, to } of wrongMoves) {
    await page.locator(`[aria-label*="${from},"]`).click();
    await page.locator(`[aria-label*="${to},"]`).click();
    await expect(page.getByText(/^Not quite\./)).toBeVisible();
    await page.getByRole("button", { name: /Next question|See my result/ }).click();
  }

  // Foundational cluster demonstrably failed (0 of 4 correct) — core-tier
  // items still get asked (nothing to early-exit from yet), but every one
  // of those is also answered wrong via the same king trick, past the
  // 3-consecutive-wrong-core-answers early-exit rule.
  for (let i = 0; i < 3; i++) {
    await page.locator('[aria-label*="e1,"]').click();
    await page.locator('[aria-label*="e2,"]').click();
    await expect(page.getByText(/^Not quite\.|^Correct!/)).toBeVisible();
    await page.getByRole("button", { name: /Next question|Continue|See my result/ }).click();
  }

  await expect(page.getByRole("heading", { name: /Placement result:/ })).toBeVisible();
  await expect(page.getByText("Continue from where you tested to")).toHaveCount(0); // no unit recommended past the very start
  await expect(page.getByRole("link", { name: "Review the fundamentals anyway" })).toBeVisible();

  // Never having demonstrated anything, the rook lesson is still locked
  // exactly as it is for anyone else who hasn't completed its prerequisites.
  await page.goto("/learn/meet-the-pieces.03-meet-the-rook");
  await expect(page).toHaveURL(/\/\?locked=/);

  // The mastery-challenge bypass (see the "aces the placement assessment"
  // test above) must never fire from a partial/failed result either — a
  // real, honest "locked" here, not just for the foundational-tier lesson.
  await page.goto("/learn/check-and-checkmate.01-what-is-check");
  await expect(page).toHaveURL(/\/\?locked=/);
});

test("a signed-in rated player's placement result is a real, server-persisted UserConceptMastery row — the server-side gate bypasses it too, not just the client UI", async ({
  page,
}) => {
  const email = `placement${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  await page.goto("/placement");
  for (const { from, to } of ALL_CORRECT_MOVES) {
    await answerCorrectly(page, from, to);
  }
  await expect(page.getByRole("heading", { name: /Placement result: Intermediate concepts demonstrated/ })).toBeVisible();

  // The server route itself (not just the client-rendered UI) must let a
  // signed-in learner straight into a lesson whose prerequisite it never
  // completed — this is app/learn/[lessonId]/page.tsx's own redirect
  // guard, proving the bypass is real UserConceptMastery data, not a
  // client-only illusion.
  await page.goto("/learn/meet-the-pieces.03-meet-the-rook");
  await expect(page).not.toHaveURL(/\/\?locked=/);

  // Same for the practice-pool route's own server-side gate.
  await page.goto("/practice/basic-tactics.the-knight-fork");
  await expect(page).not.toHaveURL(/\/\?locked=/);
  await expect(page.getByText("Puzzle 1/")).toBeVisible();
});

test("a signed-in rated player who scores 13/14 Advanced can open the recommended Tactical Vision lesson, not be bounced back as locked @smoke", async ({
  page,
}) => {
  // Real, confirmed bug this reproduces exactly as reported live: the
  // server-side prerequisite bypass in app/learn/[lessonId]/page.tsx
  // looked up the missing prerequisite's principle using the OPENED
  // lesson's own unit (`loadUnitPrinciples(lesson.unitId)`) — for
  // tactical-vision.01, that's Tactical Vision's own principles, which
  // can never contain Basic Tactics' "Is this trade worth it?" (the
  // cross-unit prerequisite this lesson actually declares). The bypass
  // was therefore silently dead for any cross-unit prerequisite: a
  // learner who directly demonstrated trade-evaluation via placement
  // still got redirected as locked, even though the homepage/learning
  // path (built from ALL units' principles) correctly recommended this
  // exact lesson as "Start here" — client and server disagreeing on
  // identical evidence. Every other placement item is answered correctly
  // except the very last one (an easy, low-stakes endgame item, not
  // trade-evaluation itself) to reproduce the exact "13/14, Advanced"
  // live finding rather than a suspiciously-perfect 14/14.
  const email = `crossunit${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  await page.goto("/placement");
  const moves = ALL_CORRECT_MOVES.slice(0, -1);
  for (const { from, to } of moves) {
    await answerCorrectly(page, from, to);
  }
  // The final item (endgame-king-escort) answered wrong, legally: the
  // king steps sideways instead of escorting the pawn.
  await page.locator('[aria-label*="e5,"]').click();
  await page.locator('[aria-label*="d5,"]').click();
  await expect(page.getByText(/^Not quite\./)).toBeVisible();
  await page.getByRole("button", { name: /See my result/ }).click();

  await expect(page.getByRole("heading", { name: /Placement result: Intermediate concepts demonstrated/ })).toBeVisible();
  await expect(page.getByText(/13 of 14 answered correctly/)).toBeVisible();

  // Real, since-added content (this round's "P0: content provenance" work)
  // now means the missing item (opposition-key-squares) has its own real
  // lesson — basic-tactics.05-the-opposition, added to fill a genuine
  // pre-existing curriculum gap. The homepage correctly recommends that
  // gap first, rather than skipping past it — a more accurate
  // recommendation than before this content existed, but not what this
  // test is here to check. Seed it as completed the same way
  // tactical-vision.spec.ts already seeds prerequisite lessons elsewhere
  // in this suite, so this test can still reach and verify the actual
  // regression it exists for: the cross-unit prerequisite bypass on
  // tactical-vision.01.
  const userId = dbHelper("get-user-id", { email });
  dbHelper("seed-completions", { userId, lessonIds: ["basic-tactics.05-the-opposition"] });

  // The homepage's own recommendation must lead somewhere it actually
  // works — this is the "recommended implies accessible" invariant. The
  // card now says "Continue learning" rather than "Start here" (seeding
  // basic-tactics.05's completion above gives this account real progress
  // history) — the label isn't what this test checks; the destination is.
  await page.goto("/");
  const continueCard = page.locator(".mw-continue-card");
  await expect(continueCard.getByText("Checks, captures, and threats")).toBeVisible();
  await continueCard.click();

  // Must land on the real lesson, never bounced back to "/" with a
  // locked banner — the exact contradiction reported live.
  await expect(page).toHaveURL("/learn/tactical-vision.01-checks-captures-and-threats");
  await expect(page.getByText(/is locked until/)).toHaveCount(0);
  await expect(page.getByText("Checks, captures, and threats")).toBeVisible();
  await expect(page.getByText("Step 1/")).toBeVisible();
});
