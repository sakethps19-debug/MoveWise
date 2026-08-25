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
  workers: 1, // one shared dev-mode Postgres database across tests; avoid write races
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 45_000, // a full lesson flow is several navigations + engine waits; the 30s default is too tight on a loaded CI runner
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    // Screenshots and video are the artifacts a human (or a future Claude
    // session) actually looks at first when a CI run is red — "only on
    // failure" so a green run doesn't pay the disk/upload cost for
    // hundreds of screenshots nobody will open.
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } } },
    // Named device projects, deliberately scoped to just the two specs
    // built to be viewport/device-parametrized (each already loops over
    // its own breakpoint matrix via setViewportSize) rather than the
    // whole suite — running all 135 tests under 3 profiles would 3x CI
    // time for near-zero extra signal, since almost none of the other
    // specs' assertions are viewport-sensitive. These two specifically
    // benefit from a *named* project (not just the ad hoc
    // `browser.newContext(devices[...])` contexts used elsewhere, e.g.
    // tablet-touch-interactions.spec.ts) because their own explicit
    // `setViewportSize()` calls only change width/height — running them
    // under a real device profile still contributes real
    // `hasTouch`/`isMobile`/device-scale-factor/user-agent differences a
    // plain desktop context with a resized viewport never exercises.
    {
      // `devices["iPad (gen 7)"]` implies `defaultBrowserType: "webkit"`
      // (a real iPad only ever runs WebKit) — fine for the ad hoc
      // `browser.newContext(devices[...])` calls elsewhere in this suite
      // (e.g. tablet-touch-interactions.spec.ts), which only apply
      // context-level options against an already-launched browser, but
      // fatal at the *project* level, where it controls which engine
      // actually gets launched. Neither this sandbox nor `ci.yml`
      // installs WebKit (`playwright install --with-deps chromium`
      // only), so `browserName: "chromium"` is forced explicitly,
      // overriding that default — everything else about the device
      // (viewport, touch, user agent, device scale factor) still comes
      // from the preset.
      name: "iPad",
      use: { ...devices["iPad (gen 7)"], browserName: "chromium", launchOptions: { executablePath } },
      testMatch: ["responsive.spec.ts", "chessboard-geometry.spec.ts"],
    },
    {
      name: "Mobile",
      use: { ...devices["iPhone 14"], browserName: "chromium", launchOptions: { executablePath } },
      testMatch: ["responsive.spec.ts", "chessboard-geometry.spec.ts"],
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
