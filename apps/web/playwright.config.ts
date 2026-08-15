import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// This sandbox pre-installs a full Chromium build at a fixed path (not the
// "headless shell" variant @playwright/test downloads by default) and sets
// PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD so `pnpm install` doesn't try to fetch
// its own copy. A real CI runner has neither — `playwright install` there
// fetches the normal way and this path simply won't exist.
const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium";
const executablePath = existsSync(PREINSTALLED_CHROMIUM) ? PREINSTALLED_CHROMIUM : undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1, // shared SQLite dev.db across tests; avoid write races
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
