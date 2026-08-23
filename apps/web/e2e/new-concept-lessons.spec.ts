import { test, expect } from "./fixtures";

/**
 * Closes a real, previously-documented gap (docs/known-risks.md,
 * docs/roadmap.md): 3 of the 4 Play & Learn-detected concepts
 * (hanging-pieces, king-safety-castling, queen-development-timing) had no
 * backing Concept/Principle/lesson content, so a real game's recommendation
 * for one of them pointed nowhere. This exercises the new lessons directly;
 * the concept-to-lesson lookup itself (lib/studyPlan.ts's
 * findPrincipleByConceptId) needed no code changes — it already resolves
 * any Principle whose own conceptId matches, so adding these 3 Principles
 * is what closes the gap.
 */

test("move-piece step with castling: King safety and castling", async ({ page }) => {
  await page.goto("/learn/meet-the-pieces.13-king-safety-and-castling");
  await page.getByRole("button", { name: "Continue" }).click();

  // step-2: move-piece, castle kingside (e1g1 / O-O).
  await page.locator('[aria-label*="e1,"]').click();
  await page.locator('[aria-label*="g1,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  // The rook moves too, as part of castling — the board should reflect it.
  await expect(page.locator('[data-square="f1"]')).toHaveAttribute("aria-label", /white rook/);
  await page.getByRole("button", { name: "Continue" }).click();

  // step-3: true-false, correct=false.
  await page.getByRole("button", { name: "False" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-4: review — this is the lesson's last step.
  await expect(page.getByText("A centralized king is a target")).toBeVisible();
  await page.getByRole("button", { name: "Complete unit" }).click();
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();
});

test("capture step: Hanging pieces", async ({ page }) => {
  await page.goto("/learn/basic-tactics.02-hanging-pieces");
  await page.getByRole("button", { name: "Continue" }).click();

  // step-2: capture, Rxd4.
  await page.locator('[aria-label*="d1,"]').click();
  await page.locator('[aria-label*="d4,"]').click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-3: mcq, correctIndex 1.
  await page.getByRole("button", { name: "The bishop is defended — capturing it starts a trade, not a free win" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-4: review — this is the lesson's last step.
  await expect(page.getByText("A hanging piece is attacked and undefended")).toBeVisible();
  await page.getByRole("button", { name: "Complete unit" }).click();
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();
});

test("mcq and true-false steps: Develop your minor pieces first", async ({ page }) => {
  await page.goto("/learn/basic-tactics.03-opening-development");
  await page.getByRole("button", { name: "Continue" }).click();

  // step-2: mcq, correctIndex 1.
  await page.getByRole("button", { name: "Develop your knights and bishops first" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-3: true-false, correct=false.
  await page.getByRole("button", { name: "False" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Correct" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // step-4: review — this is the lesson's last step.
  await expect(page.getByText("Develop your minor pieces before your queen")).toBeVisible();
  await page.getByRole("button", { name: "Complete unit" }).click();
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();
});
