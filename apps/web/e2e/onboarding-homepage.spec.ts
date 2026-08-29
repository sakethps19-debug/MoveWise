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
 * syllabus, with an explicit "View full curriculum" escape hatch. A
 * returning learner (any real progress) always sees the full syllabus
 * directly, same as before this change.
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

test("a learner with any real progress never sees onboarding and always sees the full curriculum directly", async ({
  page,
}) => {
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
  await expect(page.getByText("Current chapter")).toHaveCount(0); // no compact preview — straight to the full view
  await expect(page.locator(".mw-lesson-node").first()).toBeVisible();
});

test("a signed-in account with real mastery data but zero completions is not treated as fresh either", async ({
  page,
}) => {
  // Regression test for a real bug: a struggling concept (real evidence
  // of engagement — computeMasteryStatus only ever sets this from actual
  // attempts) with no lesson ever fully completed was wrongly treated as
  // "fresh," hiding the review-needed banner behind the onboarding
  // quiz/compact preview instead of surfacing it as it should.
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
  await expect(page.getByText("Current chapter")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /went wrong/ })).toBeVisible();
});
