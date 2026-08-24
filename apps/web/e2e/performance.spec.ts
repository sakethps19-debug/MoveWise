import { test, expect } from "./fixtures";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { Page } from "@playwright/test";

/**
 * A performance *smoke* suite, not real load testing: real
 * Navigation-Timing-API measurements against `pnpm dev` (the same
 * server the rest of this suite runs against), asserting generous
 * "hasn't regressed by an order of magnitude" budgets rather than tight
 * Core Web Vitals targets. `next dev` compiles each route lazily on
 * first request and is materially slower than a production build under
 * `next start` — every test below navigates to its target route once
 * to force that compile before the timed navigation, so the number
 * measured reflects real render/hydration cost, not one-time dev-server
 * compilation. These numbers are NOT representative of production
 * latency; they exist to catch a route that's gotten catastrophically
 * slower (a runaway loop, an accidentally-synchronous heavy computation
 * on the request path), not to tune performance.
 *
 * Tagged @perf so they can be excluded from a fast local run
 * (`--grep-invert @perf`) the same way @smoke selects a fast one in —
 * these are slower and their timing is CI-runner-dependent, hence
 * generous thresholds rather than the exact-value assertions elsewhere
 * in this suite.
 */

const DB_HELPER = path.join(__dirname, "db-helper.mjs");

function dbHelper(command: string, args: Record<string, unknown> = {}): string {
  return execFileSync("node", [DB_HELPER, command, JSON.stringify(args)], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf-8",
  });
}

interface NavTiming {
  ttfb: number;
  domContentLoaded: number;
  loadEvent: number;
}

async function measure(page: Page, url: string): Promise<NavTiming> {
  await page.goto(url); // cold: forces next dev's lazy per-route compile
  await page.goto(url); // warm: the one actually measured
  return page.evaluate(() => {
    const [nav] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    return {
      ttfb: nav.responseStart - nav.startTime,
      domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
      loadEvent: nav.loadEventEnd - nav.startTime,
    };
  });
}

// Generous on purpose (see file comment) — a real regression here means
// something is at minimum several seconds slower, not a few hundred ms.
const BUDGET_MS = 8_000;

test("home page: warm navigation completes within budget @perf", async ({ page }) => {
  const timing = await measure(page, "/");
  expect(timing.loadEvent, `home page load event fired at ${timing.loadEvent}ms (budget ${BUDGET_MS}ms)`).toBeLessThan(
    BUDGET_MS,
  );
});

test("a lesson page: warm navigation completes within budget @perf", async ({ page }) => {
  const timing = await measure(page, "/learn/meet-the-pieces.01-welcome");
  expect(
    timing.loadEvent,
    `lesson page load event fired at ${timing.loadEvent}ms (budget ${BUDGET_MS}ms)`,
  ).toBeLessThan(BUDGET_MS);
});

test("Play mode: warm navigation completes within budget @perf", async ({ page }) => {
  const timing = await measure(page, "/play");
  expect(
    timing.loadEvent,
    `Play mode load event fired at ${timing.loadEvent}ms (budget ${BUDGET_MS}ms)`,
  ).toBeLessThan(BUDGET_MS);
});

test("a puzzle page (signed in): warm navigation completes within budget @perf", async ({ page }) => {
  const email = `perfpuzzle${Date.now()}@example.com`;
  const password = "password123";
  dbHelper("create-user", { email, password });
  const userId = dbHelper("get-user-id", { email });
  dbHelper("seed-completions", { userId, lessonIds: ["check-and-checkmate.01-what-is-check"] });

  await page.goto("/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await page.click("button[type=submit]");
  await page.waitForURL("/");

  const timing = await measure(page, "/practice/check-and-checkmate.recognizing-check");
  expect(
    timing.loadEvent,
    `puzzle page load event fired at ${timing.loadEvent}ms (budget ${BUDGET_MS}ms)`,
  ).toBeLessThan(BUDGET_MS);
});
