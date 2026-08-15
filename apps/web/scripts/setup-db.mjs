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
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APPS_WEB_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const DB_PACKAGE_DIR = join(APPS_WEB_DIR, "..", "..", "packages", "db");

for (const args of [["prisma", "generate"], ["prisma", "migrate", "deploy"]]) {
  execFileSync("npx", args, { cwd: DB_PACKAGE_DIR, stdio: "inherit" });
}
