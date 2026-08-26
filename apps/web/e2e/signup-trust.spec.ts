import { test, expect } from "./fixtures";

function uniqueEmail(prefix: string) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
}

test("password fields have a working show/hide toggle on both signup and login", async ({ page }) => {
  await page.goto("/signup");
  const passwordInput = page.locator("input[name=password]");
  await passwordInput.fill("secretpassword");
  await expect(passwordInput).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(passwordInput).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(passwordInput).toHaveAttribute("type", "password");

  await page.goto("/login");
  const loginPasswordInput = page.locator("input[name=password]");
  await expect(loginPasswordInput).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(loginPasswordInput).toHaveAttribute("type", "text");
});

test("the password-requirements checklist updates live as the learner types", async ({ page }) => {
  await page.goto("/signup");
  const requirement = page.locator(".mw-password-requirement");
  await expect(requirement).not.toHaveClass(/mw-password-requirement--met/);

  await page.fill("input[name=password]", "short");
  await expect(requirement).not.toHaveClass(/mw-password-requirement--met/);

  await page.fill("input[name=password]", "longenoughpassword");
  await expect(requirement).toHaveClass(/mw-password-requirement--met/);
});

test("an invalid email shows inline feedback before the form is even submitted", async ({ page }) => {
  await page.goto("/signup");
  await page.fill("input[name=email]", "not-an-email");
  await page.locator("input[name=email]").blur();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();

  await page.fill("input[name=email]", "real@example.com");
  await expect(page.getByText("Enter a valid email address")).toHaveCount(0);
});

test("birth year field explains why it's asked, and signup/login link to Terms and Privacy", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByText(/confirm you're 13 or older/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  await expect(page.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");

  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  await expect(page.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");

  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "Terms of Use" })).toBeVisible();
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
});

test("a duplicate-email signup error offers a direct sign-in link, not just a dead end", async ({ page }) => {
  const email = uniqueEmail("dupe");
  const adultBirthYear = String(new Date().getFullYear() - 25);

  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", adultBirthYear);
  await page.click("button[type=submit]");
  await page.waitForURL("/");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("/");

  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.fill("input[name=birthYear]", adultBirthYear);
  await page.click("button[type=submit]");
  await expect(page.locator('p[role="alert"]').first()).toContainText("already exists");
  await expect(page.locator('p[role="alert"]').getByRole("link", { name: "Sign in instead" })).toBeVisible();
});

test("forgot password: request a reset, set a new password, sign in with it (old password no longer works)", async ({
  page,
}) => {
  const email = uniqueEmail("forgot");
  const oldPassword = "old-password-123";
  const newPassword = "brand-new-password-456";
  const adultBirthYear = String(new Date().getFullYear() - 25);

  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", oldPassword);
  await page.fill("input[name=birthYear]", adultBirthYear);
  await page.click("button[type=submit]");
  await page.waitForURL("/");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("/");

  await page.goto("/forgot-password");
  await page.fill("input[name=email]", email);
  await page.click("button[type=submit]");
  await expect(page.getByText(/password reset link has been sent/)).toBeVisible();

  // Dev-only: no email service is configured, so the real link is
  // surfaced directly (see requestPasswordResetAction) — this is exactly
  // the mechanism the feature is built around, not a test-only shortcut.
  const resetLink = page.getByRole("link", { name: "Reset your password" });
  await expect(resetLink).toBeVisible();
  await resetLink.click();

  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await page.fill("input[name=password]", newPassword);
  await page.click("button[type=submit]");

  await expect(page).toHaveURL(/\/login\?reset=success/);
  await expect(page.getByText("Your password has been reset")).toBeVisible();

  // The old password is dead...
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", oldPassword);
  await page.click("button[type=submit]");
  await expect(page.locator('p[role="alert"]').first()).toContainText("Incorrect");

  // ...the new one works.
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", newPassword);
  await page.click("button[type=submit]");
  await page.waitForURL("/");
  await expect(page.locator(".mw-nav-rail").getByRole("link", { name: "Sign out" }).or(page.getByRole("button", { name: "Sign out" }))).toBeVisible();
});

test("requesting a reset for an email that doesn't exist gives the same generic message (no account enumeration)", async ({
  page,
}) => {
  await page.goto("/forgot-password");
  await page.fill("input[name=email]", uniqueEmail("doesnotexist"));
  await page.click("button[type=submit]");
  await expect(page.getByText(/password reset link has been sent/)).toBeVisible();
  // No account existed for this email, so no real token/link was ever created.
  await expect(page.getByRole("link", { name: "Reset your password" })).toHaveCount(0);
});

test("an invalid or already-used reset token is rejected with a clear, actionable error", async ({ page }) => {
  await page.goto("/reset-password/not-a-real-token");
  await page.fill("input[name=password]", "some-new-password");
  await page.click("button[type=submit]");
  await expect(page.locator('p[role="alert"]').first()).toContainText("invalid or has expired");
  await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
});
