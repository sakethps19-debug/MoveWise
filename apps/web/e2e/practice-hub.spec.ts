import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * The `/practice` aggregation hub (ADR-0008): every unit's puzzle pool in
 * one page, instead of only reachable one principle at a time from
 * LearningPath's per-principle row. Reuses the exact same unlock
 * computation LearningPath already uses and already has its own E2E
 * coverage for (learning-path.spec.ts); this file is about the hub's own
 * aggregation and locked/unlocked/needs-review presentation, not
 * re-proving the underlying gating logic.
 *
 * A real account is created directly via db-helper.mjs and logged in via
 * /login rather than /signup — this test only needs a signed-in session,
 * not the signup flow itself, so it draws from the separate login
 * rate-limit budget instead of signupAction's shared one (see
 * remediation.spec.ts's own note on the same constraint).
 */

const DB_HELPER = path.join(__dirname, "db-helper.mjs");

function dbHelper(command: string, args: Record<string, unknown> = {}): string {
  return execFileSync("node", [DB_HELPER, command, JSON.stringify(args)], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf-8",
  });
}

test("practice hub: aggregates unlocked/locked pools across units, plus needs-review", async ({ page }) => {
  const email = `practicehub${Date.now()}@example.com`;
  const password = "password123";
  dbHelper("create-user", { email, password });

  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  // Nav wires straight to the real route now (no more "Soon" badge).
  await page.getByRole("link", { name: "Practice" }).click();
  await page.waitForURL("/practice");
  await expect(page.getByRole("heading", { name: "Practice" })).toBeVisible();

  // Nothing completed yet — every pool is locked.
  await expect(page.getByText("The rook")).toBeVisible();
  await expect(page.getByRole("link", { name: /The rook/ })).toHaveCount(0);

  const userId = dbHelper("get-user-id", { email });
  dbHelper("seed-completions", {
    userId,
    lessonIds: [
      "meet-the-pieces.01-welcome",
      "meet-the-pieces.02-ranks-files-squares",
      "meet-the-pieces.03-meet-the-rook",
      "meet-the-pieces.04-rook-captures",
    ],
  });
  dbHelper("set-mastery", { userId, conceptId: "board-orientation", status: "proficient" });

  await page.goto("/practice");

  // The rook's pool is now unlocked (both its sub-lessons are complete,
  // and the previous principle's concept is proficient).
  const rookLink = page.getByRole("link", { name: /The rook/ });
  await expect(rookLink).toBeVisible();
  await expect(rookLink).toHaveAttribute("href", "/practice/meet-the-pieces.the-rook");
  await rookLink.click();
  await page.waitForURL("/practice/meet-the-pieces.the-rook");

  // The bishop's pool is still locked — its own sub-lessons aren't done.
  await page.goto("/practice");
  await expect(page.getByText("The bishop")).toBeVisible();
  await expect(page.getByText("finish its lessons to unlock").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /The bishop/ })).toHaveCount(0);

  // A concept that's regressed to "struggling" surfaces in "Review needed",
  // same section LearningPath's own home page shows.
  dbHelper("set-mastery", { userId, conceptId: "rook-movement", status: "struggling" });
  await page.goto("/practice");
  await expect(page.getByRole("heading", { name: "Review needed" })).toBeVisible();
  const reviewLink = page.getByRole("link", { name: /The rook/ }).filter({ hasText: "went wrong" });
  await expect(reviewLink).toBeVisible();
  await expect(reviewLink).toHaveAttribute("href", "/review/meet-the-pieces.the-rook");
});

test("practice hub: a guest with no local progress sees every pool locked", async ({ page }) => {
  await page.goto("/practice");
  await expect(page.getByRole("heading", { name: "Practice" })).toBeVisible();
  await expect(page.getByText("Board basics")).toBeVisible();
  await expect(page.getByRole("link", { name: /Board basics/ })).toHaveCount(0);
});
