# Deploying `apps/web`

A first real deploy (Vercel) happened during this project, driven
jointly: I can't reach any hosting provider's API from this development
environment (Vercel, Netlify, Render, Railway, Fly, Cloudflare are all
blocked by its outbound network policy — a property of the environment,
not the app), so the user executed each step in their own browser while
I diagnosed failures from screenshots and logs. It took three real
attempts to get a working deployment, and each one found something this
guide now documents precisely instead of guessing at. `next build` and
`next start` passing locally, and CI passing against a throwaway
container, are necessary but not sufficient — none of them caught any of
the three issues below.

## Why Vercel

Zero-config Next.js hosting, native pnpm-workspace support, and a
generous free tier — consistent with the $0/month choice already made
for the database (ADR-0005).

## One-time setup

1. **Get the real database connection string.** Supabase never exposes
   the database password through its API (by design) — go to the
   Supabase dashboard for the project → Project Settings → Database →
   Connection string → **Transaction pooler** (port 6543). Use the
   project's `postgres` role (or another role with `BYPASSRLS`), not a
   restricted one — the RLS policy ADR-0005 added would otherwise block
   the app's own queries.

   **Real finding**: Supabase's Transaction pooler defaults to IPv6,
   and Vercel's build environment couldn't reach it — the build didn't
   fail fast, it hung for 15+ minutes until timing out. The fix that
   worked: use the **Session pooler** instead (same host, port `5432`
   instead of `6543`). Session mode holds one connection per client for
   the session's duration rather than pooling per-transaction, which is
   less ideal under high concurrency than Transaction mode — a real
   tradeoff accepted here, not an oversight — but it's what actually
   connects over IPv4 without needing Supabase's paid IPv4 add-on. If a
   future deploy target has real IPv6 egress, Transaction mode (6543)
   is worth retrying.

2. **Import the repository on Vercel** (vercel.com → Add New → Project →
   import the repo from GitHub). When configuring:
   - **Root Directory**: `apps/web` — this is a pnpm workspace with the
     deployable app nested inside it. Vercel still auto-detects the
     pnpm workspace from the real repo root and installs correctly
     across all packages.
   - **Framework Preset**: Next.js (auto-detects).
   - If the project name collides with an existing one in the Vercel
     team, just rename it — a leftover from a prior partial attempt,
     not a real conflict to resolve.

3. **Add the environment variable**: `DATABASE_URL`, set to the Session
   pooler connection string from step 1 (`postgresql://<user>:<password>@<host>:5432/postgres`).

   **Update, contradicting what this step used to say**: this guide
   previously recommended scoping `DATABASE_URL` to Production only and
   leaving Preview unset, specifically so a PR's Preview build wouldn't
   run `prisma migrate deploy` against the production database by
   default. Observed reality no longer matches that: PR #21's own
   Preview deployment build log
   (https://vercel.com/sak21/movewise-app/CVQ2wxriKLaVAoWZpVTTaEcDqy9z)
   shows a live `DATABASE_URL` connected to
   `aws-0-ap-south-1.pooler.supabase.com`, applying/checking the same 9
   migrations this repo's own `packages/db/prisma/migrations/` defines
   — i.e. Preview builds do now run `prisma migrate deploy` against a
   real Supabase Postgres instance. Whether that instance is literally
   the same one Production uses, or a separate Supabase project with an
   identical schema, isn't confirmed from a deploy log alone — check
   the Vercel project's Environment Variables settings
   (Settings → Environment Variables → `DATABASE_URL`'s scope) to know
   for sure. Either way, the "safe because migrations are additive-only"
   reasoning below still holds for schema changes; it does **not** cover
   arbitrary read/write traffic a Preview deployment's app code performs
   at runtime (e.g. real signups) — see `docs/e2e-testing.md`'s note on
   why this repo's E2E suite still doesn't run against Preview URLs.

4. **Deploy.**

## What happens during the build

`apps/web`'s `prebuild` script (`scripts/copy-engine-assets.mjs` +
`scripts/setup-db.mjs`) stages the Stockfish WASM engine into
`public/engine/`, generates the Prisma client, and runs
`prisma migrate deploy` — applying any migrations in
`packages/db/prisma/migrations/` the target database doesn't have yet.

**Real finding — `P3005`, "database schema is not empty"**: this
project's Supabase database already had its schema (applied directly
via the Supabase MCP tool earlier in development, before that tool
disconnected), but Prisma's own migration-history table
(`_prisma_migrations`) had never been populated, since that path never
went through `prisma migrate deploy`. Prisma refuses to touch a
non-empty, unbaselined database. Fixed by manually inserting baseline
rows into `_prisma_migrations` (via Supabase's SQL Editor) for every
migration already known to be applied, `id`/`checksum` computed the
same way `prisma migrate resolve --applied <name>` would — leaving out
any migration *not* yet actually applied, so `migrate deploy` still
applies those for real on the next build. This was a one-time
consequence of how this specific database's schema was first created,
not a recurring deploy step — a database that's only ever been touched
by `prisma migrate deploy`/`dev` won't hit this.

## What's still not decided

- Preview deployments now have a working `DATABASE_URL` (see step 3's
  update) — but whether that's a dedicated preview database or the same
  one Production uses isn't confirmed in this doc. Worth checking and
  recording here, since it changes how safe it is to point any
  automated tool (including this repo's own E2E suite) at a Preview URL.
- A real deploy is also when `docs/security-checklist.md`'s "Secure
  headers: not implemented" and "Backups and recovery: not
  independently set up" rows stop being abstract.
