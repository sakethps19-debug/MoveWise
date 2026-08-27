import { test, expect } from "./fixtures";
import { execFileSync } from "node:child_process";
import path from "node:path";

function uniqueEmail(prefix: string) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
}

const DB_HELPER = path.join(__dirname, "db-helper.mjs");

function dbHelper(command: string, args: Record<string, unknown> = {}): string {
  return execFileSync("node", [DB_HELPER, command, JSON.stringify(args)], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf-8",
  });
}

async function signUp(page: import("@playwright/test").Page, email: string, password = "password123") {
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");
}

test("a guest visiting /account is redirected to sign in, not shown the delete-account form", async ({ page }) => {
  // Real, confirmed bug: /account was a client component with no session
  // check at all — a guest who navigated there directly saw the full
  // delete-account form (unstyled, no Nav) instead of being redirected,
  // even though the server action itself already rejected the request.
  await page.goto("/account");
  await expect(page).toHaveURL("http://localhost:3000/login");
});

test("an unauthenticated request to /account/export is rejected with 401, not another user's data", async ({
  request,
}) => {
  // Hits the route directly (no browser session at all — not even a
  // guest page load), the same "server-side, not just hidden" guarantee
  // the UI-level redirect test above proves from the other direction.
  const response = await request.get("/account/export");
  expect(response.status()).toBe(401);
  const body = await response.json();
  expect(body.error).toBeTruthy();
});

test("a request with an expired session is treated as signed out, not a stale-but-valid session", async ({ page }) => {
  const email = uniqueEmail("expiredsession");
  await signUp(page, email);
  const userId = dbHelper("get-user-id", { email });

  // Backdates the real Session row's expiresAt — exercises getSession()'s
  // actual DB-checked expiry path, not a fabricated cookie.
  const expiredCount = Number(dbHelper("expire-session", { userId }));
  expect(expiredCount).toBeGreaterThan(0);

  await page.goto("/account");
  await expect(page).toHaveURL("http://localhost:3000/login");

  // The still-present (but now expired) session cookie must not grant
  // the export route access either.
  const exportResponse = await page.request.get("/account/export");
  expect(exportResponse.status()).toBe(401);
});

test("repeated wrong-password attempts against account deletion are rate-limited", async ({ page }) => {
  const email = uniqueEmail("ratelimitdelete");
  const password = "password123";
  await signUp(page, email, password);
  const userId = dbHelper("get-user-id", { email });

  await page.goto("/account");
  page.on("dialog", (dialog) => dialog.accept()); // persistent, not once — every attempt below shows the same confirm() dialog
  const submitButton = page.locator("button[type=submit]");

  // DELETE_ACCOUNT_LIMIT is 8/15min — the 9th attempt must be blocked,
  // regardless of whether the password guessed happens to be right. Each
  // iteration waits for the button to fully re-enable (the real signal a
  // previous submission's round trip actually completed) before the
  // next one — a click while still disabled/pending is a silent no-op,
  // which previously undercounted real server hits below 8.
  for (let i = 0; i < 8; i++) {
    await page.fill("input[name=password]", "still-the-wrong-password");
    await submitButton.click();
    await expect(submitButton).toBeDisabled();
    await expect(submitButton).toBeEnabled();
    await expect(page.locator('p[role="alert"]').first()).toContainText("Incorrect password");
  }

  await page.fill("input[name=password]", password); // even the *correct* password is blocked once rate-limited
  await submitButton.click();
  await expect(page.locator('p[role="alert"]').first()).toContainText("Too many attempts");

  const hitCount = Number(dbHelper("count-rate-limit-hits", { key: `delete-account:${userId}` }));
  expect(hitCount).toBeGreaterThanOrEqual(8);
});

test("exporting account data downloads a JSON file with the account's completions", async ({ page }) => {
  const email = uniqueEmail("export");
  await signUp(page, email);

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

  // Nav.tsx's fifth item links to /account but is labeled "Profile", not
  // "Account" — this predates that redesign.
  await page.getByRole("link", { name: "Profile" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download my data" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("movewise-data.json");

  const streamPath = await download.path();
  const fs = await import("node:fs/promises");
  const content = JSON.parse(await fs.readFile(streamPath!, "utf-8"));
  expect(content.account.email).toBe(email);
  expect(content.lessonCompletions).toHaveLength(1);
  expect(content.lessonCompletions[0].lessonId).toBe("meet-the-pieces.01-welcome");
});

test("deleting the account requires the correct password and a confirmation, then signs the user out for good", async ({
  page,
}) => {
  const email = uniqueEmail("delete");
  const password = "password123";
  await signUp(page, email, password);

  await page.goto("/account");

  // Wrong password: rejected before the confirm dialog even matters.
  page.once("dialog", (dialog) => dialog.accept());
  await page.fill("input[name=password]", "the-wrong-password");
  await page.click("button[type=submit]");
  await expect(page.locator('p[role="alert"]').first()).toContainText("Incorrect password");

  // Correct password, but the user cancels the confirm dialog: account survives.
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await page.waitForTimeout(200); // no navigation to wait for when the dialog is dismissed
  await expect(page).toHaveURL("/account");

  // Correct password, confirmed: account and all its data are gone.
  page.once("dialog", (dialog) => dialog.accept());
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL("/");
  // Both the nav rail and the guest page header render a "Sign in" link
  // — scope to the rail to avoid a strict-mode multi-match.
  await expect(page.locator(".mw-nav-rail").getByRole("link", { name: "Sign in" })).toBeVisible();

  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await expect(page.locator('p[role="alert"]').first()).toContainText("Incorrect");
});
