# ADR-0005: SQLite → Postgres migration, hosted on Supabase

## Status
Accepted. Resolves open decision #1 in `docs/roadmap.md` ("Hosting/infra
for Postgres, and who pays for it") — the user chose Supabase and
approved creating a project; the RLS remediation below was a separate,
explicit choice they made when asked (not decided autonomously — see
Context).

## Context
`docs/known-risks.md` and ADR-0002 both flagged this as inevitable: SQLite
was a deliberate dev-only choice (no persistent filesystem on serverless
hosts like Vercel), and ADR-0002's Consequences section predicted the
exact mechanics of this swap almost exactly (`@prisma/adapter-libsql` →
`@prisma/adapter-pg`, schema/app code unchanged). What was genuinely open
was hosting/cost/ownership — not something to pick unilaterally.

Supabase MCP tools became available mid-session. The user chose to
migrate now rather than continue deferring it.

## Decision
1. **`packages/db/prisma/schema.prisma`**: `datasource.provider` changed
   `sqlite` → `postgresql`. Nothing else in the schema changed — same
   models, same `cuid()` IDs (generated client-side by Prisma, not a
   DB-native default, so this is provider-independent).
2. **`packages/db/src/index.ts`**: `PrismaLibSql` → `PrismaPg`
   (`@prisma/adapter-pg`, wrapping the standard `pg` driver).
   `apps/web/next.config.ts`'s webpack `externals` updated to match
   (`@prisma/adapter-pg`, `pg` in place of the libsql packages) — same
   reason as ADR-0002: `pg`'s bindings don't survive webpack bundling
   inside a Next.js server build, and Next's `serverExternalPackages`
   still doesn't match symlinked pnpm workspace packages.
3. **Real tracked migrations, not `db push`**: SQLite's `dev.db` was
   ephemeral and local-only, so `prisma db push` (force-sync schema, no
   history) was fine. A shared Postgres database needs real migration
   history — `prisma/migrations/` is now committed, and
   `apps/web/scripts/setup-db.mjs` (the predev/prebuild hook) runs
   `prisma migrate deploy` (applies pending migrations, non-interactive,
   safe for automation) instead of `db push`. Schema changes now go
   through `prisma migrate dev` by hand in `packages/db`, generating a
   new migration file to commit.
4. **CI**: both `verify` and `e2e` jobs in `.github/workflows/ci.yml`
   gained a `postgres:16` service container — a throwaway instance per
   run, not the real Supabase project. CI never touches production/dev
   data, and doesn't need real Supabase credentials at all.
5. **Row-Level Security**: Supabase auto-provisions a public PostgREST
   API (gated by an anon/publishable key) on every project, regardless of
   whether the app uses it — this app doesn't (Prisma connects
   server-side only, via a direct connection string, never exposed to the
   browser). Creating the tables initially left RLS disabled, which
   Supabase's own tooling flags as critical: with an anon key, that REST
   API can read/write any row. **This was surfaced to the user directly,
   with the remediation SQL shown, not auto-applied** — they chose to
   enable RLS with no policies on all three tables. No policies means
   deny-all for the anon/authenticated PostgREST roles; the app's own
   Postgres role isn't affected (table owner bypasses RLS by default),
   so nothing about the app's behavior changes — this only closes an API
   surface the app never used.

## Consequences
- **Real production `DATABASE_URL` still needs a human step**: Supabase
  never exposes the database password through its API after project
  creation (by design). The user needs to get the real connection string
  from the Supabase dashboard (Project Settings → Database → Connection
  string) and set it as `DATABASE_URL` wherever the app actually deploys
  (a deploy platform's env vars) — this repo's own `.env`/`.env.local`
  files stay local-only and gitignored, same as always. **Use the
  Supabase project's own `postgres` role for this** (or another role
  with `BYPASSRLS`), not a restricted one, so the app isn't blocked by
  the RLS policy from step 5.
  **Direct connection vs. the pooler depends on the still-unchosen
  deploy platform**: a long-running server (self-hosted Node, a
  Docker/VM host) should use the direct connection (port 5432) —
  `@prisma/adapter-pg` maintains its own long-lived pool, and adding
  Supabase's pooler on top would just be a second layer of pooling for
  no benefit. A serverless platform (Vercel and similar) should use
  Supabase's pooler (Supavisor, port 6543, "Transaction" mode) instead —
  each function invocation there can open its own short-lived `pg` pool,
  and many concurrent invocations would exhaust Postgres's direct
  connection limit fast. This wasn't decided wrong here; it just isn't
  decidable yet, since no deploy platform is chosen (see below).
- **A real deploy is still not built.** This ADR only lands the data
  layer; there's no deploy workflow, no hosting platform chosen for the
  Next.js app itself, no production `DATABASE_URL` wired anywhere yet.
- Local dev now needs a real Postgres instance (local install, Docker, or
  pointing `.env`/`.env.local` at the Supabase project directly) instead
  of a zero-setup SQLite file. `packages/db/.env.example` documents the
  one-time local role/database creation.
- Verified end-to-end before this landed: full local clean-simulation
  (fresh Postgres database, no prior migration history, exact CI
  credentials/DATABASE_URL) running the identical `verify` job sequence,
  and the full 24-test E2E suite against a real local Postgres instance —
  not assumed to work just because the schema change was small.
