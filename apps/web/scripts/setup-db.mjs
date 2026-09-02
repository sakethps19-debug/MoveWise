/**
 * Generates the Prisma client and applies any pending tracked migrations
 * before every dev/build run, so `@movewise/db` is always up to date
 * with prisma/schema.prisma without a separate manual step.
 *
 * Uses `migrate deploy`, not `db push` — this repo has real tracked
 * migrations (prisma/migrations/) now that the datasource is Postgres,
 * not an ephemeral local SQLite file. `migrate deploy` non-interactively
 * applies pending migrations (safe for an automated predev/prebuild
 * hook and for CI); it never generates new ones. When the schema
 * changes, run `prisma migrate dev` by hand in packages/db to create and
 * apply the new migration file.
 *
 * Preview-build migration guard (real, confirmed risk this closes, not a
 * hypothetical): `docs/deployment.md` confirms Vercel Preview and
 * Production share the exact same live Supabase database — one
 * `DATABASE_URL`, one Postgres instance, for every open PR's Preview
 * deployment and Production alike. Before this guard, *any* PR's Preview
 * build ran this same `prisma migrate deploy` against that one shared
 * database the moment Vercel built it — meaning an unreviewed migration
 * on an open PR branch could alter the production schema before a human
 * ever approved the PR. `VERCEL_ENV` is a Vercel system environment
 * variable, always present during a Vercel build without needing any
 * project configuration (unlike `NEXT_PUBLIC_`-prefixed vars, which
 * require an opt-in to reach the browser — this is server-side only and
 * unconditional): `"production"` for the Production deployment,
 * `"preview"` for every PR/branch Preview deployment, `"development"`
 * for `vercel dev`. Skipping the migration step specifically (and only)
 * when it's `"preview"` means a Preview build can never mutate the
 * shared schema — schema changes only ever apply from the real
 * Production build, i.e. after merge to main, exactly matching how
 * `prisma migrate deploy` already ran on every Production build before
 * this guard existed. Local dev and any non-Vercel environment
 * (`VERCEL_ENV` unset) are unaffected — this only ever changes behavior
 * for a Vercel Preview build specifically.
 *
 * Trade-off, stated plainly rather than hidden: a Preview build for a PR
 * that itself introduces a new migration will run against the
 * *pre-migration* schema (Production's current one), since Preview no
 * longer applies pending migrations at all. If that PR's own code
 * depends on the new migration's schema change, the Preview deployment
 * for that specific PR may error at runtime until it's merged and
 * Production actually migrates. This is a deliberate, accepted
 * trade-off: a broken Preview for one PR is vastly preferable to any
 * Preview build being able to silently alter the shared production
 * database.
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APPS_WEB_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const DB_PACKAGE_DIR = join(APPS_WEB_DIR, "..", "..", "packages", "db");

const isPreviewBuild = process.env.VERCEL_ENV === "preview";

const steps = [["prisma", "generate"]];
if (isPreviewBuild) {
  console.log(
    "setup-db: VERCEL_ENV=preview — skipping `prisma migrate deploy`. Preview and Production share one database " +
      "(see docs/deployment.md); only a real Production build is allowed to apply migrations. This Preview runs " +
      "against Production's current schema as-is.",
  );
} else {
  steps.push(["prisma", "migrate", "deploy"]);
}

for (const args of steps) {
  execFileSync("npx", args, { cwd: DB_PACKAGE_DIR, stdio: "inherit" });
}
