# Deployment runbook: RLS remediation migrations

Covers both:
- `packages/db/prisma/migrations/20260902110000_enforce_rls_all_tables_revoke_data_api`
- `packages/db/prisma/migrations/20260902120000_default_privileges_deny_anon_authenticated`
  (a follow-up audit found that role "postgres" — the exact role
  migrations run as — had a default-privilege entry auto-granting
  `anon`/`authenticated` on every *future* table/sequence/function; the
  first migration alone would not have stopped the next new table from
  shipping exposed again)

**Why this is a runbook and not just "push the branch"**: Vercel Preview
and Production share the exact same live Supabase database
(`erfjoslqpjdnlsfzimvi`) — confirmed in `docs/deployment.md`, not a
guess. `prisma migrate deploy` used to run on every build via `apps/web`'s
`prebuild` script, including Preview builds for an open PR, which would
have applied these migrations to the one shared production database the
moment Vercel built the Preview — before a human ever reviewed the diff.

**This is now closed at the code level, not just by a runbook step**:
`apps/web/scripts/setup-db.mjs` checks Vercel's own `VERCEL_ENV` system
variable and skips `prisma migrate deploy` entirely whenever it's
`"preview"` — a Preview build can no longer run any migration, ever,
regardless of how `DATABASE_URL` happens to be scoped in Vercel's
project settings. Proven behaviorally, not just by reading the code, in
`apps/web/scripts/setup-db.test.ts` (a deliberately-unreachable
`DATABASE_URL` makes a real Production-mode run fail fast, since
`migrate deploy` needs a live connection; the same unreachable URL under
`VERCEL_ENV=preview` succeeds, proving `migrate deploy` was never even
attempted). Step 1 below is now a defense-in-depth option, not the sole
safeguard. **These migrations have not been pushed.** Everything below is
what to do, in order, when a human decides to proceed.

## 0. Preconditions (already satisfied — recorded here for the record)

- [x] Runtime-role preflight passed. Verified live against
      `erfjoslqpjdnlsfzimvi` (via Supabase's `execute_sql`, not assumed):
      `current_user = "postgres"`, `rolbypassrls = true`, and `postgres`
      owns all 13 public tables (`pg_class.relowner`). The migration does
      not use `FORCE ROW LEVEL SECURITY` anywhere.
- [x] Ephemeral-database tests passed (fresh-from-empty apply, apply to
      already-migrated schema, all 13 tables `relrowsecurity = true` /
      `relforcerowsecurity = false`, zero `pg_policies` rows, a real
      GRANT-then-migrate-then-verify-REVOKE round trip confirmed
      `anon`/`authenticated` privileges actually drop from 84 grants each
      to 0, and a full INSERT/SELECT/UPDATE/DELETE round trip on `User`
      succeeded under the app's own role).
- [x] Full local verification suite passed against the RLS-enabled local
      schema: typecheck, lint, all unit tests, content validation,
      production build, and the complete Playwright E2E suite (signup/
      login/logout/session, password reset, lessons/checkpoints/resume,
      placement, mastery/exercise attempts, games/analysis/history all
      exercised for real — see the session's own test-results summary
      for the exact pass count).
- [x] Documentation updated (`docs/security-checklist.md`, ADR-0005,
      `docs/known-risks.md`) — stale "only three tables" wording removed.
- [x] Incident-review checklist written
      (`docs/security-incident-review-checklist.md`) — reviewed the
      exposure window as far as log retention allows (see that
      document's own honest limitation note) and confirmed every exposed
      table is currently empty.

## 1. Preview safety (already guaranteed by the code-level guard — optional hardening below)

The `VERCEL_ENV` guard in `setup-db.mjs` (see above) already makes it
architecturally impossible for a Preview build to run either migration —
this holds regardless of Vercel project configuration, so there is no
required manual step here anymore. Optional further hardening, worth
doing independently of this specific migration since it addresses the
broader shared-database risk documented in `docs/deployment.md`:

- **Supabase branching**, if available on the project's plan — gives
  each Preview deployment its own isolated branch database instead of
  read/write access to the shared one. Checked during this same audit
  (`mcp__Supabase__list_branches`): the project has exactly one branch
  ("main", the production database itself) — branching is technically
  available on this project but no isolated preview branch has been
  created. Creating one requires a cost confirmation
  (`confirm_cost`/`create_branch`) — a paid action, so this was not done
  autonomously; a human should decide whether to enable it.
- Removing/unsetting Preview's `DATABASE_URL` in Vercel (the previous
  recommendation) is no longer necessary for migration safety
  specifically, but is still worth considering for the separate,
  broader risk that Preview can read/write real production *rows*
  (not just schema) — that risk is unaffected by anything in this
  migration and remains open, as `docs/deployment.md` already documents.

## 2. Push and open the PR

Once step 1's guard is in place: push `claude/movewise-supabase-rls-remediation`
(or whatever branch this work lands on), open the PR against `main`,
and let the (now-safe) Preview build run. Confirm the Preview build
itself succeeds (it applies every migration up to and including this one
against whatever database Preview is now pointed at per step 1) before
proceeding.

## 3. Apply to production — once, deliberately

This is the one step that actually changes the shared database's schema.
Do it as a controlled action, not as a side effect of a build:

1. Confirm the PR is reviewed and approved.
2. Merge to `main`. If step 1 chose option (b)(i) (Preview's
   `DATABASE_URL` removed), restore it now, after the migration has
   already been applied to production in the next steps — not before.
3. **Production's own build applies both migrations** the same way every
   previous migration has been applied (`prisma migrate deploy` via
   `prebuild`, per ADR-0005 — now gated by the `VERCEL_ENV !== "preview"`
   guard, which a real Production build always satisfies) — this is the
   one time it's meant to touch the shared database. Watch the Production
   deployment's build log for both migration names (`Applying migration
   20260902110000_enforce_rls_all_tables_revoke_data_api`, then
   `Applying migration 20260902120000_default_privileges_deny_anon_authenticated`)
   and a clean "All migrations have been successfully applied."
4. If the build log shows an error applying either migration: **stop, do
   not retry blindly.** The most likely failure mode given the guarded
   `REVOKE`/`ALTER DEFAULT PRIVILEGES` blocks is a role name that doesn't
   match (unlikely — `anon`/`authenticated` are Supabase-standard and
   were confirmed present via `execute_sql` before writing these
   migrations) or a permissions issue with the deploying role (would mean
   the preflight in step 0 is somehow stale — re-run it against
   production directly before doing anything else).

## 4. Immediately after production apply

1. **Signed-in learner and game smoke tests** — by hand, against the real
   production URL, not just local E2E: sign up (or sign in to an
   existing test account), complete one lesson step, start a Play-mode
   game against Stockfish and make a couple of moves, open `/progress`.
   Confirm nothing errors and data persists across a reload.
2. **Re-run the Supabase Security Advisor**
   (`mcp__Supabase__get_advisors` with `type: "security"`, or the
   dashboard's own Advisor page) against `erfjoslqpjdnlsfzimvi`. Confirm:
   - Zero `rls_disabled_in_public` findings.
   - Zero findings under whatever the Advisor currently calls exposed-
     sensitive-column checks (Advisor rule names can change between
     Supabase releases — check for anything flagging `PasswordResetToken`,
     `User`, or `Session` specifically, not just an exact string match on
     "sensitive_columns_exposed").
3. **Re-run the RLS regression check against production directly** — the
   same script, pointed at production instead of a throwaway/local
   database:
   ```
   RLS_CHECK_DATABASE_URL="<production DATABASE_URL>" pnpm --filter @movewise/db db:check-rls
   ```
   Never paste the real connection string into a shared terminal/log —
   run this from wherever the production secret is already available
   (the deploy platform's own shell/CLI, a properly-scoped local
   `.env.production.local` that's gitignored), and confirm the command's
   own output contains no credentials (it's designed not to print any —
   verify that design held).
4. **Monitor** authentication (signup/login error rate), password-reset
   request/completion, lesson-checkpoint/completion saves, and game-save
   errors for a reasonable window after the deploy (whatever
   error-tracking/logging is in place — Vercel's own function logs at
   minimum). Watch specifically for a spike in 5xx/permission-denied
   errors immediately after the migration lands, which would indicate
   the preflight's "app role bypasses RLS" conclusion was somehow wrong
   despite the verification above.

## Rollback

**If step 3's migrations fail to apply**: nothing has changed —
`prisma migrate deploy` is transactional per-migration and Prisma won't
mark a failed migration as applied. Fix the migration file (in a new
follow-up migration, per this repo's own rule — never edit an
already-applied migration) and redeploy.

To reverse the default-privileges migration specifically (restores the
pre-audit default ACL — only do this alongside the table-level rollback
below, since it re-opens the same class of exposure for any future
table):

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
```

**If the migration applies successfully but step 4's smoke tests or
monitoring reveal a real problem** (the app's own queries start failing,
which the preflight and ephemeral tests above make unlikely but not
provably impossible): the safe rollback is a new migration that reverses
this one, not a manual `psql` session against production and not editing
this migration file after the fact:

```sql
ALTER TABLE public."User" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."Session" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."LessonCompletion" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."PasswordResetToken" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."LessonCheckpoint" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserConceptMastery" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."ExerciseAttempt" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."Game" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."GameAnalysis" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."MoveAnalysis" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."PlacementAttempt" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."RateLimitHit" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."_prisma_migrations" DISABLE ROW LEVEL SECURITY;
-- Re-grant anon/authenticated if genuinely needed again — but note this
-- re-opens the exact Data API exposure this whole remediation closed;
-- only do this as a last resort while root-causing a real app-breaking
-- regression, not a routine "just in case" step, and re-close it again
-- (via another new migration) the moment the underlying issue is fixed.
```

Given the preflight and ephemeral-test results above, this rollback path
should not be needed — it's documented because "the migration might
theoretically block the app's own queries" was exactly the risk this
runbook's preconditions exist to rule out in advance, not because there's
a specific reason to expect it.
