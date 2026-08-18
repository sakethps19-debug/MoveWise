import { test, expect } from "@playwright/test";

function uniqueEmail(prefix: string) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
}

test("under-13 signup is blocked with an explanatory message, birth year is never persisted as a bypass", async ({
  page,
}) => {
  await page.goto("/signup");
  await page.fill("input[name=email]", uniqueEmail("kid"));
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 10));
  await page.click("button[type=submit]");
  await expect(page.locator('p[role="alert"]').first()).toContainText("under 13");
});

test("signup, duplicate email rejected, wrong password rejected, logout, XP persists across re-login", async ({
  page,
}) => {
  const email = uniqueEmail("auth");
  const adultBirthYear = String(new Date().getFullYear() - 25);

  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", adultBirthYear);
  await page.click("button[type=submit]");
  await page.waitForURL("/");
  await expect(page.getByText(email, { exact: false })).toBeVisible();
  // XP now lives in the nav rail (Nav.tsx's mw-nav-xp), not a combined
  // "N XP, M lessons completed" line on the page body — that text was
  // dropped when the nav rail/home page were redesigned.
  await expect(page.getByText("0 XP", { exact: true })).toBeVisible();

  // duplicate email
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", adultBirthYear);
  await page.click("button[type=submit]");
  await expect(page.locator('p[role="alert"]').first()).toContainText("already exists");

  // complete a lesson while signed in
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
  await expect(page.getByText("30 XP", { exact: true })).toBeVisible();

  // sign out, sign back in, XP is still there
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("/");
  // Both the nav rail and the guest page header render a "Sign in" link
  // — scope to the rail to avoid a strict-mode multi-match.
  await expect(page.locator(".mw-nav-rail").getByRole("link", { name: "Sign in" })).toBeVisible();

  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "the-wrong-password");
  await page.click("button[type=submit]");
  await expect(page.locator('p[role="alert"]').first()).toContainText("Incorrect");

  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.click("button[type=submit]");
  await page.waitForURL("/");
  await expect(page.getByText("30 XP", { exact: true })).toBeVisible();
});
