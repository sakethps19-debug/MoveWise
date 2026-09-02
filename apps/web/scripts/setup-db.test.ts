import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * Regression check for the Preview-migration-safety guard in
 * setup-db.mjs — the real, confirmed risk it closes (not a hypothetical):
 * `docs/deployment.md` confirms Vercel Preview and Production share the
 * exact same live Supabase database, and this script's `prisma migrate
 * deploy` call runs on every predev/prebuild — including a Preview
 * build for an arbitrary open PR, before any human review. Proves the
 * guard behaviorally, not just by reading its source: a deliberately
 * unreachable `DATABASE_URL` makes `prisma migrate deploy` fail fast (it
 * needs a live connection), while `prisma generate` never does (it only
 * reads schema.prisma) — so if the guard is doing its job, a
 * `VERCEL_ENV=preview` run must succeed even with a broken DATABASE_URL,
 * and a non-preview run pointed at the same broken URL must fail,
 * proving migrate deploy really was attempted in that case.
 */
const SCRIPT_PATH = fileURLToPath(new URL("./setup-db.mjs", import.meta.url));
// Deliberately unreachable — a real host that refuses the connection
// immediately rather than a bogus hostname that could hang on DNS
// resolution in a sandboxed/offline test environment.
const UNREACHABLE_DATABASE_URL = "postgresql://nobody:nobody@127.0.0.1:1/nonexistent_db";

function runSetupDb(env: Record<string, string | undefined>): { status: number | null; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("node", [SCRIPT_PATH], {
      env: { ...process.env, ...env },
      encoding: "utf-8",
      timeout: 30_000,
    });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status: number | null; stdout?: string; stderr?: string };
    return { status: e.status, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

describe("setup-db.mjs Preview-migration-safety guard", () => {
  it(
    "VERCEL_ENV=preview: succeeds even with an unreachable DATABASE_URL — proves migrate deploy was never attempted",
    () => {
      const result = runSetupDb({ VERCEL_ENV: "preview", DATABASE_URL: UNREACHABLE_DATABASE_URL });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/skipping.*migrate deploy/i);
    },
    35_000,
  );

  it(
    "VERCEL_ENV unset (matches a real Production build or local dev): fails against an unreachable DATABASE_URL — proves migrate deploy WAS attempted",
    () => {
      const env: Record<string, string | undefined> = { DATABASE_URL: UNREACHABLE_DATABASE_URL };
      // Explicitly unset — a test runner or CI environment could have
      // its own VERCEL_ENV lying around; this test is specifically about
      // the "not preview" branch.
      delete env.VERCEL_ENV;
      const result = runSetupDb(env);
      expect(result.status).not.toBe(0);
    },
    35_000,
  );

  it(
    "VERCEL_ENV=production: fails against an unreachable DATABASE_URL — a real Production build must still migrate",
    () => {
      const result = runSetupDb({ VERCEL_ENV: "production", DATABASE_URL: UNREACHABLE_DATABASE_URL });
      expect(result.status).not.toBe(0);
    },
    35_000,
  );
});
