import { test, expect } from "@playwright/test";

function uniqueEmail(prefix: string) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
}

test("a fresh guest and a fresh account both see later lessons locked", async ({ page }) => {
  // Guests now get the same prerequisite-based locking as signed-in
  // users, evaluated against locally-persisted progress (see
  // lib/guestProgress.ts) instead of always showing everything open —
  // there'd be no point tracking guest completions otherwise.
  await page.goto("/");
  const guestLockCount = await page.getByText("🔒").count();
  expect(guestLockCount).toBeGreaterThan(0);

  const email = uniqueEmail("path");
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  const lockCount = await page.getByText("🔒").count();
  expect(lockCount).toBeGreaterThan(0);
  // The entire second unit is locked via its lesson's own prerequisite
  // chain into the first unit's mastery-challenge lesson.
  const checkmateBasicsRow = page.getByText("What is check?");
  await expect(checkmateBasicsRow.locator("..")).toContainText("🔒");
});

test("guest progress persists locally, unlocks the next lesson, and migrates into a new account on signup", async ({
  page,
}) => {
  await page.goto("/learn/meet-the-pieces.01-welcome");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="e1,"]').click();
  await page.getByRole("button", { name: "Finish lesson" }).click();
  await page.getByRole("link", { name: "Back to learning path" }).click();
  await page.waitForURL("/");

  // Locally recorded: the completed lesson shows a star rating, and the
  // next lesson (whose only prerequisite is this one) is now unlocked.
  // (`exact: true` avoids also matching the "Continue learning" callout,
  // whose accessible name includes the same lesson title.)
  const welcomeRow = page.getByText("Welcome to the chessboard").locator("..");
  await expect(welcomeRow.locator("span[aria-label='3 of 3 stars']")).toBeVisible();
  const nextRow = page.getByRole("link", { name: "Ranks, files and squares", exact: true });
  await expect(nextRow).not.toContainText("🔒");

  const email = uniqueEmail("migrate");
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  // The guest completion migrated into the new account: same star
  // rating, same lesson unlocked, now backed by the DB instead of
  // localStorage.
  const welcomeRowSignedIn = page.getByText("Welcome to the chessboard").locator("..");
  await expect(welcomeRowSignedIn.locator("span[aria-label='3 of 3 stars']")).toBeVisible();
  const nextRowSignedIn = page.getByRole("link", { name: "Ranks, files and squares", exact: true });
  await expect(nextRowSignedIn).not.toContainText("🔒");
});

test("a perfect first run earns 3 stars; a run with mistakes earns fewer", async ({ page }) => {
  const email = uniqueEmail("stars");
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  await page.goto("/learn/meet-the-pieces.01-welcome");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="a1,"]').click(); // wrong
  await page.locator('[aria-label*="a2,"]').click(); // wrong again
  await page.locator('[aria-label*="e1,"]').click(); // correct
  await page.getByRole("button", { name: "Finish lesson" }).click();
  await page.getByRole("link", { name: "Back to learning path" }).click();
  await page.waitForURL("/");

  // 2 mistakes -> 2 filled stars, not 3 (see docs/adr/0004 for the tiering rule)
  const lessonRow = page.getByText("Welcome to the chessboard").locator("..");
  await expect(lessonRow).toContainText("★★");
  await expect(lessonRow.locator("span[aria-label='2 of 3 stars']")).toBeVisible();
});

test("a signed-in learner can't bypass locked-lesson sequencing via direct URL", async ({ page }) => {
  // Real gap found in review: a later lesson opened fine when navigated to
  // directly by URL, even though it showed as locked on the learning path
  // — the check only lived in the UI (disabled/hidden links), never on
  // the server. meet-the-pieces.03-meet-the-rook requires 01 and 02,
  // neither of which this fresh account has completed.
  const email = uniqueEmail("sequencing");
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  await page.goto("/learn/meet-the-pieces.03-meet-the-rook");
  await page.waitForURL(/\/\?locked=/);
  const banner = page.getByRole("alert").filter({ hasText: "locked" });
  await expect(banner).toContainText("Meet the rook");
  await expect(banner).toContainText("locked");
});

test("a zero-mistake run that used a hint doesn't earn 3 stars", async ({ page }) => {
  // Real defect found in review: stars were computed from mistakes only,
  // so a run with zero wrong clicks but a revealed hint (even the
  // solution-reveal level) still showed 3 stars. See lib/mastery.ts.
  const email = uniqueEmail("hintstars");
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  await page.goto("/learn/meet-the-pieces.01-welcome");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Hint 1" }).click();
  await page.locator('[aria-label*="e1,"]').click(); // correct, zero wrong clicks
  await page.getByRole("button", { name: "Finish lesson" }).click();
  await expect(page.getByText(/hint used/)).toBeVisible();
  await page.getByRole("link", { name: "Back to learning path" }).click();
  await page.waitForURL("/");

  const lessonRow = page.getByText("Welcome to the chessboard").locator("..");
  await expect(lessonRow.locator("span[aria-label='2 of 3 stars']")).toBeVisible();
});
