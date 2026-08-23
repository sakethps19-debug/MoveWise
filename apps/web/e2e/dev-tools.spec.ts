import { test, expect } from "./fixtures";

function uniqueEmail(prefix: string) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
}

/**
 * Phase 4: "a clearly isolated development-only progress reset mechanism
 * ... do not expose developer controls in production." This suite always
 * runs against `pnpm dev` (NODE_ENV=development — see playwright.config.ts's
 * webServer command), which is exactly the one environment where the
 * control (components/DevResetControl.tsx, app/actions.ts's
 * devResetProgressAction) is supposed to render and work. Its production
 * absence isn't independently E2E-tested here — that's a build-time
 * `process.env.NODE_ENV` branch Next.js dead-code-eliminates, verified by
 * code inspection (app/page.tsx, app/actions.ts) rather than a second
 * production E2E run.
 */
test("dev reset control clears a signed-in account's lesson progress", async ({ page }) => {
  const email = uniqueEmail("devreset");
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  await expect(page.getByText("DEV ONLY")).toBeVisible();

  // Complete a lesson, confirm it's recorded.
  await page.goto("/learn/meet-the-pieces.01-welcome");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="e1,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="e8,"]').click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "False" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Complete unit" }).click();
  await page.getByRole("link", { name: "Back to learning path" }).click();
  await page.waitForURL("/");
  // Filtered by the row's own title element, not hasText on the whole
  // row — lesson-02's "Unlocks after ..." subtitle quotes this same
  // lesson's title as substring text, which would otherwise match two rows.
  const welcomeRow = page
    .locator(".mw-lesson-node")
    .filter({ has: page.locator(".mw-lesson-node-title", { hasText: "Welcome to the chessboard" }) });
  await expect(welcomeRow).toHaveClass(/mw-lesson-node--(completed|mastered)/);

  // Reset via the dev-only control — progress must actually clear, not
  // just show a success message.
  await page.getByRole("button", { name: "Reset progress" }).click();
  await expect(page.getByText("Progress reset.")).toBeVisible();
  await expect(welcomeRow).toHaveClass(/mw-lesson-node--available/);
});
