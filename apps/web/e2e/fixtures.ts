import { test as base, expect, devices } from "@playwright/test";
import type { ConsoleMessage, Page } from "@playwright/test";

/**
 * Every spec in this suite imports `test`/`expect` from here instead of
 * directly from "@playwright/test" so that every test, by default,
 * fails on an uncaught JS exception or a real browser console.error —
 * per the testing brief's "detect browser errors ... distinguish
 * genuine application defects from noise" requirement. Previously
 * nothing in this suite ever asserted on console/page errors at all: a
 * broken render that still happened to leave the right text/DOM nodes
 * in place (e.g. a caught-and-swallowed exception, a failed fetch logged
 * but not surfaced in the UI) could pass every existing assertion here
 * undetected.
 *
 * Kept short and specific, not a wildcard: a new, unexpected error
 * should still fail loudly. Verified against a full real suite run
 * before being trusted — see the comment on each entry for how it was
 * confirmed benign.
 */
const IGNORED_CONSOLE_PATTERNS: RegExp[] = [];

const IGNORED_PAGEERROR_PATTERNS: RegExp[] = [];

/**
 * Per-page, per-test allowance for a console error/exception a test
 * deliberately provokes on purpose (e.g. network-resilience.spec.ts
 * aborting a request and asserting on the app's own resulting error
 * UI — the browser logging that aborted request as
 * `net::ERR_FAILED` is expected, not a defect). Kept separate from the
 * static `IGNORED_*_PATTERNS` above so a genuinely new, unexpected
 * error anywhere else in the suite still fails loudly; this only
 * silences what the specific test that called it says it expects.
 */
const expectedPerPage = new WeakMap<Page, RegExp[]>();

export function allowExpectedConsoleError(page: Page, pattern: RegExp): void {
  const existing = expectedPerPage.get(page) ?? [];
  existing.push(pattern);
  expectedPerPage.set(page, existing);
}

/**
 * Attaches console/pageerror listeners to `page` and returns a function
 * that must be called once the test body is done (before the page/
 * context closes) — it throws if anything unexpected was captured.
 * Exported directly for the handful of specs that open their own
 * `browser.newContext()` (device-emulation tests) rather than using the
 * default `page` fixture the `test` export below instruments
 * automatically.
 */
export function watchForConsoleErrors(page: Page): () => void {
  const errors: string[] = [];

  const isExpected = (text: string) => (expectedPerPage.get(page) ?? []).some((p) => p.test(text));

  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORED_CONSOLE_PATTERNS.some((p) => p.test(text)) || isExpected(text)) return;
    errors.push(`console.error: ${text}`);
  };
  const onPageError = (err: Error) => {
    const text = err.stack ?? err.message;
    if (IGNORED_PAGEERROR_PATTERNS.some((p) => p.test(text)) || isExpected(text)) return;
    errors.push(`uncaught exception: ${text}`);
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);

  return () => {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    expect(errors, `no unexpected browser console errors / uncaught exceptions:\n\n${errors.join("\n\n")}`).toEqual(
      [],
    );
  };
}

export const test = base.extend<{ consoleErrorGuard: void }>({
  consoleErrorGuard: [
    async ({ page }, use) => {
      const check = watchForConsoleErrors(page);
      await use();
      check();
    },
    { auto: true },
  ],
});

export { expect, devices };
export type { Page };
