import { test, expect } from "./fixtures";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * P1 "complete placement confirmation": a concept unlocked purely from an
 * inferred placement signal (lib/placementEvidence.ts's
 * `inferred_high_confidence`) can be converted into real, directly
 * demonstrated evidence via a short quiz (components/ConfirmationActivity.tsx,
 * app/practice/confirm/[principleId]/page.tsx). Solving every puzzle
 * writes a real UserConceptMastery "proficient" row — the same evidence a
 * direct placement item or ordinary practice produces.
 */

const DB_HELPER = path.join(__dirname, "db-helper.mjs");

function dbHelper(command: string, args: Record<string, unknown> = {}): string {
  return execFileSync("node", [DB_HELPER, command, JSON.stringify(args)], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf-8",
  });
}

test("solving a concept's confirmation activity perfectly promotes it to real, directly demonstrated evidence", async ({
  page,
}) => {
  const email = `confirm${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  await page.goto("/practice/confirm/meet-the-pieces.board-basics");
  await expect(page.getByRole("heading", { name: /Confirm:/ })).toBeVisible();
  await expect(page.getByText(/Your placement result unlocked/)).toBeVisible();
  await expect(page.getByText("Puzzle 1/2")).toBeVisible();

  // meet-the-pieces' board-basics puzzles: king a1 -> b2, then e1 -> f2.
  await page.locator('[aria-label*="a1,"]').click();
  await page.locator('[aria-label*="b2,"]').click();
  await expect(page.getByText(/^Correct!/)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Puzzle 2/2")).toBeVisible();
  await page.locator('[aria-label*="e1,"]').click();
  await page.locator('[aria-label*="f2,"]').click();
  await expect(page.getByText(/^Correct!/)).toBeVisible();
  await page.getByRole("button", { name: "Finish practice" }).click();

  await expect(page.getByRole("heading", { name: "Thanks — confirmed" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Back to Board basics/i })).toBeVisible();

  const userId = dbHelper("get-user-id", { email });
  const progressJson = dbHelper("count-progress", { userId });
  expect(JSON.parse(progressJson).mastery).toBe(1); // a real UserConceptMastery row now exists
});

test("a wrong answer during confirmation does not promote anything, and never blocks the pool it's about", async ({
  page,
}) => {
  const email = `confirmfail${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  await page.goto("/practice/confirm/meet-the-pieces.board-basics");
  await expect(page.getByText("Puzzle 1/2")).toBeVisible();

  // A wrong move first (not a legal single-square king move) — the
  // activity accepts a retry, same as ordinary puzzle practice.
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
  await expect(page.getByRole("heading", { name: "Thanks — confirmed" })).toBeVisible();
  await page.waitForTimeout(300);

  // Never punished: no mastery row was written (the one wrong answer means
  // this attempt doesn't count as confirmation), but the pool itself was
  // never locked by this activity in the first place.
  const userId = dbHelper("get-user-id", { email });
  const progressJson = dbHelper("count-progress", { userId });
  expect(JSON.parse(progressJson).mastery).toBe(0);
});
