import { test, expect } from "@playwright/test";

function uniqueEmail(prefix: string) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
}

async function signUp(page: import("@playwright/test").Page, email: string, password = "password123") {
  await page.goto("/signup");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.fill("input[name=birthYear]", String(new Date().getFullYear() - 25));
  await page.click("button[type=submit]");
  await page.waitForURL("/");
}

test("exporting account data downloads a JSON file with the account's completions", async ({ page }) => {
  const email = uniqueEmail("export");
  await signUp(page, email);

  await page.goto("/learn/meet-the-pieces.01-welcome");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('[aria-label*="e1,"]').click();
  await page.getByRole("button", { name: "Finish lesson" }).click();
  await page.getByRole("link", { name: "Back to learning path" }).click();
  await page.waitForURL("/");

  await page.getByRole("link", { name: "Account" }).click();
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
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();

  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await expect(page.locator('p[role="alert"]').first()).toContainText("Incorrect");
});
