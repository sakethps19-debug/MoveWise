# Deploying `apps/web`

No deploy exists yet. This is a precise, one-time manual setup — not
automated, and **not verified by running it**, for a specific reason
worth stating plainly: every hosting provider's API (Vercel, Netlify,
Render, Railway, Fly, Cloudflare) is blocked by this development
environment's outbound network policy. That's a policy decision on the
environment this was built in, not a property of the app — nothing about
MoveWise prevents deployment, there's just no way to execute or verify
one from here. Everything below is standard, well-documented platform
behavior, not a guess, but it hasn't been run end-to-end the way every
other change in this repo has been.

## Why Vercel

Zero-config Next.js hosting, native pnpm-workspace support, and a
generous free tier — consistent with the $0/month choice already made
for the database (ADR-0005). Nothing about the app assumes Vercel
specifically; a self-hosted Node server (`next start`) works too, with
its own env var and process-management setup instead of steps 1–3 below.

## One-time setup

1. **Get the real database connection string.** Supabase never exposes
   the database password through its API (by design) — go to the
   Supabase dashboard for the "MoveWise" project → Project Settings →
   Database → Connection string. Vercel is a serverless platform, so use
   the **pooler** connection (Supavisor, port 6543, "Transaction" mode),
   not the direct one — see ADR-0005's Consequences section for why.
   Use the project's `postgres` role (or another role with `BYPASSRLS`),
   not a restricted one — the RLS policy ADR-0005 added would otherwise
   block the app's own queries.

2. **Import the repository on Vercel** (vercel.com → Add New → Project →
   import `sakethps19-debug/MoveWise` from GitHub). When configuring:
   - **Root Directory**: `apps/web` — this is a pnpm workspace with the
     deployable app nested inside it; Vercel needs to know where. It
     still auto-detects the pnpm workspace from the real repo root and
     installs correctly across all packages.
   - **Framework Preset**: Next.js (should auto-detect).
   - Leave build/install commands on their framework defaults — nothing
     in `apps/web/package.json` needs a custom override for Vercel
     specifically.

3. **Add the environment variable**: `DATABASE_URL`, set to the pooler
   connection string from step 1. Set it for the **Production**
   environment. Leave Preview unset for now — Preview deployments (one
   per pull request) would otherwise run `prisma migrate deploy` against
   the same production database on every PR, which is safe (migrations
   are additive-only) but not something to opt into without deciding
   whether preview deploys should share prod data at all. Leaving it
   unset means Preview builds fail at the `predev`/`prebuild` step until
   that's decided — a loud, clear failure, not a silent wrong behavior.

4. **Deploy.** Vercel builds and deploys automatically from this point
   on, on every push to `main` — no GitHub Actions workflow needed for
   this; Vercel's own GitHub integration handles it.

## What happens during the build

`apps/web`'s `prebuild` script (`scripts/copy-engine-assets.mjs` +
`scripts/setup-db.mjs`) runs automatically: it stages the Stockfish WASM
engine into `public/engine/`, generates the Prisma client, and runs
`prisma migrate deploy` — applying any migrations in
`packages/db/prisma/migrations/` that the production database doesn't
have yet. This is the same sequence CI runs against its throwaway
`postgres:16` container (`.github/workflows/ci.yml`), just against the
real database this time. If a build fails at this step, the error is
almost always a missing/wrong `DATABASE_URL`, not a code problem — the
exact same migrations already applied cleanly to a genuinely fresh
Postgres database as part of ADR-0005's verification.

## What's still not decided

- Whether Preview deployments get their own database, share production
  read-only, or stay disabled (see step 3).
- A real deploy is also when `docs/security-checklist.md`'s "Secure
  headers: not implemented" and "Backups and recovery: not
  independently set up" rows stop being abstract.
