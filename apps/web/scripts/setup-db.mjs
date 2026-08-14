/**
 * Generates the Prisma client and syncs the local SQLite schema before
 * every dev/build run, so `@movewise/db` is always up to date with
 * prisma/schema.prisma without a separate manual step.
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APPS_WEB_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const DB_PACKAGE_DIR = join(APPS_WEB_DIR, "..", "..", "packages", "db");

for (const args of [["prisma", "generate"], ["prisma", "db", "push"]]) {
  execFileSync("npx", args, { cwd: DB_PACKAGE_DIR, stdio: "inherit" });
}
