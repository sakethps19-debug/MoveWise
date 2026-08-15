# ADR-0002: Prisma 7 driver adapters, and libsql over better-sqlite3

## Status
Accepted (decided autonomously — reversible technical choice, no cost/data implications).

## Context
Prisma 7 is a genuine breaking change from what most Prisma documentation
and training data describe: `datasource.url` moved out of `schema.prisma`
into a separate `prisma.config.ts`, and `PrismaClient` now requires an
explicit driver `adapter` argument rather than connecting on its own. This
wasn't discoverable from docs — this environment's egress proxy blocks
`prisma.io` and `pris.ly` outright — so it was worked out empirically by
scaffolding a disposable `prisma init --datasource-provider sqlite` project
and reading what it generated.

The first adapter tried was `@prisma/adapter-better-sqlite3`. It installed
and worked standalone (verified via a plain `tsx` script), but broke inside
Next.js's webpack bundling with `Cannot read properties of undefined
(reading 'indexOf')`, thrown deep inside `better-sqlite3`'s `bindings`
dependency. Root cause, confirmed via a temporary debug API route that
surfaced the full stack (Next's dev overlay truncates it): `bindings`
locates its native `.node` file by inspecting the call stack for real
filesystem paths, and webpack rewrites those to `webpack-internal://...`
during bundling — the lookup breaks structurally, not from a config
mistake. `serverExternalPackages` (Next's built-in bundling opt-out) didn't
fix it either, for a separate, unrelated reason: its matching regex
requires the *resolved* path to contain a literal `node_modules/<pkg>/`
segment, and a pnpm workspace package like `@movewise/db` resolves through
a symlink to a real path outside `node_modules` entirely, so it can never
match.

## Decision
Two independent fixes, both needed:
1. Use `@prisma/adapter-libsql` (`@libsql/client`) instead of
   `@prisma/adapter-better-sqlite3`. libsql doesn't use call-stack-based
   native lookup, so it survives webpack bundling without any special
   handling.
2. Add an explicit `webpack.externals` array in `apps/web/next.config.ts`
   naming `@movewise/db`, `@prisma/adapter-libsql`, and `@libsql/client` —
   bypassing Next's built-in `serverExternalPackages` mechanism (which
   doesn't work for symlinked workspace packages) rather than continuing to
   fight it.

## Consequences
- Both the CLI (`prisma db push`/`generate`, via `prisma.config.ts`) and the
  runtime client (`packages/db/src/index.ts`, constructing
  `new PrismaClient({ adapter })`) need `DATABASE_URL` independently — the
  CLI reads it from `packages/db/.env`, the app reads it from
  `apps/web/.env.local`. They point at the same physical SQLite file via
  different relative paths (different working directories). Documented in
  both `.env.example` files.
- The generated Prisma client is TypeScript *source*, not pre-built JS —
  `packages/db/tsconfig.json` needs `allowImportingTsExtensions`, and so
  does `apps/web/tsconfig.json` (any workspace package that imports it
  transitively hits the same requirement, since pnpm workspace links mean
  TypeScript checks the dependency's real source, not a `.d.ts`).
- Migrating to Postgres later (see README's "not here yet" list) means
  swapping `@prisma/adapter-libsql` for `@prisma/adapter-pg` — the schema
  and application code don't change, only the adapter construction in
  `packages/db/src/index.ts` and the connection string shape.
