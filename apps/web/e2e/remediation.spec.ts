import { test, expect } from "./fixtures";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * docs/learner-model.md's struggling-learner remediation flow: a
 * shortened reteach, then an easier-puzzle round, then a link back to
 * retry the principle — served at /review/[principleId], gated on the
 * learner's UserConceptMastery status actually being "struggling".
 *
 * The struggling -> recovered transition itself (computeMasteryStatus's
 * recentAccuracy check) is already exhaustively unit-tested in
 * masteryModel.test.ts; this file is about the *delivery* of the flow
 * docs/learner-model.md specifies (reteach content, easier puzzles,
 * gating, the retry link), not re-proving the state machine. A real
 * account is created directly via db-helper.mjs rather than through
 * /signup, and logged in via /login instead — this test only needs a
 * signed-in session, not the signup flow itself, so it draws from the
 * separate login rate-limit budget (lib/rate-limit.ts's
 * LOGIN_IP_LIMIT/LOGIN_EMAIL_LIMIT) instead of adding to
 * signupAction's already-near-capacity one shared with the rest of this
 * suite (see puzzle-practice.spec.ts's own note on the same constraint).
 */

const DB_HELPER = path.join(__dirname, "db-helper.mjs");

function dbHelper(command: string, args: Record<string, unknown> = {}): string {
  return execFileSync("node", [DB_HELPER, command, JSON.stringify(args)], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf-8",
  });
}

test("remediation: gated on struggling status, then reteach + easier puzzles + a working retry link", async ({
  page,
}) => {
  const email = `remediation${Date.now()}@example.com`;
  const password = "password123";
  dbHelper("create-user", { email, password });

  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  // Not struggling yet (no UserConceptMastery row at all) — the route
  // has nothing to remediate, so it sends the learner home rather than
  // showing an empty or nonsensical review screen.
  await page.goto("/review/meet-the-pieces.the-rook");
  await expect(page).toHaveURL("http://localhost:3000/");

  const userId = dbHelper("get-user-id", { email });
  dbHelper("set-mastery", { userId, conceptId: "rook-movement", status: "struggling" });

  // Now it's reachable, and the home page itself surfaces it.
  await page.goto("/");
  const reviewLink = page.getByRole("link", { name: /The rook/ }).filter({ hasText: "went wrong" });
  await expect(reviewLink).toBeVisible();
  await reviewLink.click();
  await page.waitForURL("/review/meet-the-pieces.the-rook");

  // Reteach phase: one explain step from each of the-rook's two
  // sub-lessons (lesson-03, lesson-04), capped at 2 total.
  await expect(page.getByText("Review: The rook")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Easier-puzzle phase: meet-the-pieces' rook puzzles are difficulty 1,
  // so both are served. puzzle-rook-1: rook d3 -> d8.
  await expect(page.getByText("Puzzle 1/2")).toBeVisible();
  await page.locator('[aria-label*="d3,"]').click();
  await page.locator('[aria-label*="d8,"]').click();
  await expect(page.getByText(/^Correct!/)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // puzzle-rook-2: rook d3 -> d4 (captures the blocking pawn).
  await expect(page.getByText("Puzzle 2/2")).toBeVisible();
  await page.locator('[aria-label*="d3,"]').click();
  await page.locator('[aria-label*="d4,"]').click();
  await expect(page.getByText(/^Correct!/)).toBeVisible();
  await page.getByRole("button", { name: "Finish practice" }).click();

  await expect(page.getByRole("heading", { name: "Nice work!" })).toBeVisible();
  await expect(page.getByText(/reviewed the ideas behind The rook/)).toBeVisible();
  const retryLink = page.getByRole("link", { name: "Try it again" });
  await expect(retryLink).toHaveAttribute("href", "/learn/meet-the-pieces.03-meet-the-rook");
  await retryLink.click();
  await page.waitForURL("/learn/meet-the-pieces.03-meet-the-rook");

  // The route stays reachable afterward regardless of the concept's
  // current status (proficient here) — same "repeatable, not a one-shot
  // gate" philosophy /practice/[principleId] already uses for its own
  // pool. What actually gates it is having *any* evidence for the
  // concept at all, not being in exactly one status — see the route's
  // own comment for why a stricter check broke mid-round.
  dbHelper("set-mastery", { userId, conceptId: "rook-movement", status: "proficient" });
  await page.goto("/review/meet-the-pieces.the-rook");
  await expect(page).toHaveURL("http://localhost:3000/review/meet-the-pieces.the-rook");
  // The "Review needed" section itself does drop it, though — that
  // listing is specifically for "struggling", unlike the route's own
  // broader access check.
  await page.goto("/");
  await expect(page.getByRole("link", { name: /The rook/ }).filter({ hasText: "went wrong" })).toHaveCount(0);

  // A principle with zero evidence at all is still correctly gated —
  // this isn't a general-purpose "visit any review page" shortcut.
  await page.goto("/review/meet-the-pieces.the-bishop");
  await expect(page).toHaveURL("http://localhost:3000/");
});
