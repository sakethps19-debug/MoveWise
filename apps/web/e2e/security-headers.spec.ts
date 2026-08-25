import { test, expect } from "./fixtures";

// Closes "Secure headers: Not implemented" in docs/security-checklist.md.
// middleware.ts sets a nonce-based Content-Security-Policy per request
// (next.config.ts can't — it has no per-request context to mint a nonce
// from); the rest of the headers below are static, from next.config.ts.
// The absence of any CSP-violation console error across the *entire* E2E
// suite (fixtures.ts's consoleErrorGuard auto-fixture fails a test on an
// unexpected console.error) is the real regression guard for "the policy
// doesn't break the app" — these tests assert the headers exist and are
// shaped as intended, not just that nothing broke.

test("home page response carries the expected security headers", async ({ page }) => {
  const response = await page.goto("/");
  expect(response).not.toBeNull();
  const headers = response!.headers();

  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["strict-transport-security"]).toContain("max-age=");

  const csp = headers["content-security-policy"];
  expect(csp).toBeTruthy();
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("worker-src 'self'");
  expect(csp).toContain("wasm-unsafe-eval"); // required for the Stockfish engine's WASM
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
});

test("the CSP nonce is fresh on every request, not a fixed value", async ({ page }) => {
  const first = await page.goto("/");
  const firstNonce = first!.headers()["content-security-policy"]!.match(/'nonce-([^']+)'/)?.[1];
  const second = await page.goto("/play");
  const secondNonce = second!.headers()["content-security-policy"]!.match(/'nonce-([^']+)'/)?.[1];

  expect(firstNonce).toBeTruthy();
  expect(secondNonce).toBeTruthy();
  expect(firstNonce).not.toBe(secondNonce);
});

test("the inline theme-init script carries the matching nonce and actually runs", async ({ page, request }) => {
  // One single request, so the nonce in its CSP header and the nonce baked
  // into its HTML body are guaranteed to be from the same middleware run
  // (each request mints a fresh one) — a separate page.goto() here would
  // race against a second, differently-nonced request.
  const single = await request.get("/");
  const headerNonce = single.headers()["content-security-policy"]!.match(/'nonce-([^']+)'/)?.[1];
  const html = await single.text();

  // The nonce must match in the *server-rendered* HTML, which is what the
  // browser actually checks against the CSP header before running the
  // script — not the post-hydration DOM. React deliberately strips the
  // nonce attribute once React takes over on the client (so a fresh
  // per-request nonce isn't left sitting in the live DOM for anything else
  // on the page to read), so asserting against document.querySelector
  // after hydration would be asserting on the wrong artifact entirely.
  const scriptNonceMatch = html.match(/<script nonce="([^"]+)"[^>]*>[\s\S]*?movewise-theme/);
  expect(scriptNonceMatch?.[1]).toBe(headerNonce);

  // Prove the script actually executed (not just present with the right
  // nonce) by exercising the behavior it implements: applying a stored
  // theme preference before first paint.
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("movewise-theme", "dark"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
