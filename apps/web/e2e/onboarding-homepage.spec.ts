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

/**
 * P1-A: a genuinely fresh visitor (no progress at all) previously saw
 * every unit's every lesson listed immediately — roughly 20 disabled
 * cards before doing anything. Now they see a lightweight, skippable
 * onboarding quiz first, then a compact "current chapter / next chapter
 * preview / collapsed future chapters" view instead of the full
 * syllabus, with an explicit "View full curriculum" escape hatch.
 *
 * The onboarding quiz itself retires the instant there's any real
 * progress (unchanged). The curriculum MAP is a separate question, fixed
 * later in this file: a real, reproduced production defect had it
 * expanding to the full ~33-lesson wall the instant a single lesson
 * finished — "hasAnyProgress" was being used for both decisions, when
 * only the quiz-retirement one should ever fire that early. The map now
 * waits for a real milestone (finishing the whole current chapter, or
 * placement evidence for a rated learner) — see LearningPath.tsx's own
 * `readyForFullCurriculum`.
 */

test("a fresh guest sees the onboarding quiz first, and it's fully skippable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("region", { name: "A few quick questions" })).toBeVisible();
  await expect(page.getByText("Step 1 of 3")).toBeVisible();

  // Skip is available on the very first step, no forced answers.
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByRole("region", { name: "A few quick questions" })).toHaveCount(0);

  // A skipped/answered onboarding never shows again on this browser.
  await page.reload();
  await expect(page.getByRole("region", { name: "A few quick questions" })).toHaveCount(0);
});

test("a fresh guest sees a compact preview, not every unit's full lesson list, until they expand it", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Skip for now" }).click();

  // The "Start here" continue card and a compact current/next-chapter
  // preview are visible...
  await expect(page.getByText("Start here")).toBeVisible();
  await expect(page.getByText("Current chapter")).toBeVisible();
  await expect(page.getByText("Meet the Pieces")).toBeVisible();
  await expect(page.getByText("Next chapter")).toBeVisible();

  // ...but the full per-lesson breakdown (every lesson node) is not
  // rendered yet — only the CompactCurriculumPreview's own rows.
  await expect(page.locator(".mw-lesson-node")).toHaveCount(0);

  await page.getByRole("button", { name: "View full curriculum" }).click();
  await expect(page.locator(".mw-lesson-node").first()).toBeVisible();
  const lessonNodeCount = await page.locator(".mw-lesson-node").count();
  expect(lessonNodeCount).toBeGreaterThan(10); // the real, full syllabus — nothing was removed, just collapsed by default
});

test("onboarding answers shape the homepage greeting and never gate or unlock any content", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Casual player" }).click();
  // Casual/rated players now get a real branching step (P0) instead of
  // going straight to the goal question — choosing to answer the quick
  // questions anyway still reaches the same goal/minutes flow as before.
  await page.getByRole("button", { name: "Just ask me a couple quick questions" }).click();
  await page.getByRole("button", { name: "Improve my tactics" }).click();
  await page.getByRole("button", { name: "10 minutes a day" }).click();

  await expect(page.getByText(/We'll get you into tactics/)).toBeVisible();
  // A non-"completely new" answer offers a secondary path to practice —
  // but the normal, real first lesson link is still the primary CTA and
  // still requires actually completing it; nothing was silently unlocked.
  await expect(page.getByRole("link", { name: /Jump straight to practice puzzles/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start here" })).toBeVisible();

  await page.goto("/learn/meet-the-pieces.03-meet-the-rook");
  await expect(page).toHaveURL(/\/\?locked=/); // still gated normally — onboarding never bypassed real prerequisites
});

/**
 * P0's "do not unlock advanced content solely from self-reported ability"
 * requirement, verified from the onboarding UI side: a casual/rated
 * learner gets real, functional branches (placement assessment, a game to
 * analyze, straight to tactics, or fundamentals review) rather than only
 * a self-report that changes copy. A rated player can also optionally
 * volunteer an approximate rating — never required, never an external
 * username.
 */
test("a casual/rated player sees a real branching path, and only a rated player is offered the optional rating field", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Casual player" }).click();
  await expect(page.getByRole("heading", { name: "Want to skip ahead?" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Take a placement assessment/ })).toHaveAttribute("href", "/placement");
  await expect(page.getByRole("link", { name: /Play a game/ })).toHaveAttribute("href", "/play");
  await expect(page.getByRole("link", { name: "Start with tactics practice" })).toHaveAttribute("href", "/practice");
  await expect(page.getByRole("link", { name: "Review the fundamentals" })).toHaveAttribute(
    "href",
    "/learn/meet-the-pieces.01-welcome",
  );
  await expect(page.locator("#mw-onboarding-rating")).toHaveCount(0); // casual, not rated — no rating prompt

  await page.getByRole("button", { name: "← Back" }).click();
  await page.getByRole("button", { name: "Rated player" }).click();
  await expect(page.getByRole("heading", { name: "How would you like to start?" })).toBeVisible();
  await expect(page.locator("#mw-onboarding-rating")).toBeVisible();
});

test("choosing the placement assessment from onboarding leaves the quiz permanently and lands on a real assessment", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Rated player" }).click();
  await page.getByRole("link", { name: /Take a placement assessment/ }).click();
  await page.waitForURL("/placement");
  await expect(page.getByText("Placement assessment")).toBeVisible();
  await expect(page.getByText("Question 1")).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("region", { name: "A few quick questions" })).toHaveCount(0);
});

test("a learner with any real progress never sees onboarding again, but the compact Today view stays until a real milestone is earned", async ({
  page,
}) => {
  // Real, reproduced production defect this test locks in: a beginner
  // who commits five minutes a day finishes lesson 1, reloads the
  // homepage, and the compact preview they'd just seen is instantly
  // replaced by the full ~33-lesson curriculum map — a wall of locked
  // cards, not the "helpful compact plan" the brief promises. Touching
  // anything at all correctly retires the onboarding quiz (never shown
  // again), but the curriculum map itself must wait for a real, promised
  // milestone (finishing the whole current chapter), not just "did
  // something."
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

  await expect(page.getByRole("region", { name: "A few quick questions" })).toHaveCount(0);
  // Still the compact plan, one lesson in — not the full wall of locks.
  await expect(page.getByText("Current chapter")).toBeVisible();
  await expect(page.locator(".mw-lesson-node")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Continue learning" })).toBeVisible();

  // The escape hatch still works for a learner who wants the map anyway.
  await page.getByRole("button", { name: "View full curriculum" }).click();
  await expect(page.locator(".mw-lesson-node").first()).toBeVisible();
});

test("finishing an entire chapter earns the full curriculum map by default", async ({ page }) => {
  const email = `chapterdone${Date.now()}@example.com`;
  const password = "password123";
  dbHelper("create-user", { email, password });
  const userId = dbHelper("get-user-id", { email });
  // Every meet-the-pieces lesson — the real milestone the compact
  // preview's own "next milestone: complete them all" copy promises.
  dbHelper("seed-completions", {
    userId,
    lessonIds: [
      "meet-the-pieces.01-welcome",
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
      "meet-the-pieces.12-unit-mastery-challenge",
      "meet-the-pieces.13-king-safety-and-castling",
    ],
  });

  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  await expect(page.getByText("Current chapter")).toHaveCount(0); // no compact preview — the map earned its place
  await expect(page.locator(".mw-lesson-node").first()).toBeVisible();
});

test("a signed-in account with real mastery data but zero completions is not treated as fresh for onboarding, but still gets the compact plan", async ({
  page,
}) => {
  // Regression test for a real bug: a struggling concept (real evidence
  // of engagement — computeMasteryStatus only ever sets this from actual
  // attempts) with no lesson ever fully completed was wrongly treated as
  // "fresh" for the onboarding quiz, which must never show again once
  // there's real engagement. The review-needed banner is unconditional
  // (rendered above the compact-vs-full split either way) and must
  // surface regardless. But this account hasn't earned the full
  // curriculum map either (no completed chapter, no placement evidence)
  // — same compact "Today" plan a genuinely fresh learner gets, per the
  // curriculum-expansion fix above, not the full 33-lesson wall.
  const email = `masteryonly${Date.now()}@example.com`;
  const password = "password123";
  dbHelper("create-user", { email, password });
  const userId = dbHelper("get-user-id", { email });
  dbHelper("set-mastery", { userId, conceptId: "rook-movement", status: "struggling" });

  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  await expect(page.getByRole("region", { name: "A few quick questions" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /went wrong/ })).toBeVisible();
  await expect(page.getByText("Current chapter")).toBeVisible();
  await expect(page.locator(".mw-lesson-node")).toHaveCount(0);
});
