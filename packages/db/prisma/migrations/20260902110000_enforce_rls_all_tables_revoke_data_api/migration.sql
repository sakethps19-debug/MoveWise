-- Not derivable from schema.prisma (Prisma doesn't model RLS/GRANT/REVOKE)
-- — hand-authored, same as the 20260815075152_enable_rls migration this
-- one supersedes/completes.
--
-- Supabase Security Advisor findings this closes (confirmed live against
-- project erfjoslqpjdnlsfzimvi before writing this migration):
--   - rls_disabled_in_public (ERROR) on 9 tables: RateLimitHit,
--     MoveAnalysis, GameAnalysis, LessonCheckpoint, Game, ExerciseAttempt,
--     PasswordResetToken, PlacementAttempt, UserConceptMastery. These
--     were added by migrations written after 20260815075152_enable_rls,
--     which only ever covered the three tables that existed at the time
--     (User, Session, LessonCompletion) — every table added since was
--     silently missing RLS, the exact gap this migration exists to close
--     for good (see the regression check added alongside this migration,
--     which now fails CI if it ever recurs).
--   - rls_enabled_no_policy (INFO) on User/Session/LessonCompletion/
--     _prisma_migrations: expected and intentional (see below) — not a
--     gap, informational only.
--
-- _prisma_migrations already has RLS enabled on the real Supabase
-- project (from whenever it was first provisioned there) but not on a
-- fresh local/CI Postgres instance, which never went through that step —
-- included explicitly below so the regression check added alongside this
-- migration (packages/db/scripts/check-rls.ts, "every ordinary/
-- partitioned table in public", no carve-outs) passes identically in
-- every environment instead of needing a special-cased exemption for
-- Prisma's own bookkeeping table. `ENABLE ROW LEVEL SECURITY` is
-- idempotent — safe to re-run against a table that already has it set.
--
-- Runtime-role preflight (performed before this migration was written,
-- not assumed): the application's runtime Postgres role connects as
-- "postgres", has rolbypassrls = true, and owns all 13 public tables
-- (pg_class.relowner). Table ownership alone bypasses ordinary RLS in
-- Postgres regardless of the BYPASSRLS attribute, so enabling RLS below
-- (deliberately WITHOUT ever using FORCE ROW LEVEL SECURITY, which is the
-- one thing that *would* start applying RLS to the owner too) cannot
-- affect Prisma's own queries. See docs/security-checklist.md and
-- docs/adr/0005-postgres-migration-via-supabase.md for the full
-- verification method and its caveats.
--
-- Posture: default deny for Supabase's auto-provisioned PostgREST Data
-- API, on every application table, not just the three that happened to
-- exist when RLS was first enabled. No RLS policies are created on
-- purpose — this app has no Supabase Auth users (custom cuid userIds,
-- opaque server-side sessions, no auth.uid() anywhere), so a policy
-- written against Supabase Auth's model would be actively wrong here,
-- not just unnecessary. RLS-enabled + zero policies is a real, working
-- deny-all for anon/authenticated; combined with the REVOKE below (belt
-- and suspenders — RLS denies rows, REVOKE denies the connection the
-- ability to even attempt the query), the Data API path is fully closed
-- without touching the app's own trusted server-side connection at all.

ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."LessonCompletion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PasswordResetToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."LessonCheckpoint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UserConceptMastery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ExerciseAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Game" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."GameAnalysis" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MoveAnalysis" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PlacementAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."RateLimitHit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- anon/authenticated are Supabase's Data API roles (PostgREST switches
-- into one of these per request via the "authenticator" login role) —
-- this app never uses the Supabase client, Supabase Auth, or the Data
-- API from the browser at all, so these roles have no legitimate reason
-- to hold any table privilege here. Revoking is a second, independent
-- layer on top of RLS above: even a future policy mistake (e.g. someone
-- later adding a USING (true) policy without realizing what it exposes)
-- would still hit a permission-denied wall at the GRANT level first.
-- Deliberately does NOT touch the application's own runtime role (see
-- the preflight note above) or service_role (Supabase's other privileged
-- role — also unused by this app, but out of scope for this change;
-- revoking from it is a separate decision, not implied by "this app
-- doesn't use the Data API").
--
-- Guarded, not a bare REVOKE: this migration also runs via
-- `prisma migrate deploy` against CI's and local dev's own throwaway
-- plain-Postgres instances (postgres:16 in .github/workflows/ci.yml,
-- packages/db/.env.example's local role) — those have no "anon"/
-- "authenticated" roles at all (Supabase-only), and a bare REVOKE FROM
-- a nonexistent role errors out, which would break every build, not just
-- the Supabase one. Skips cleanly wherever those roles don't exist;
-- performs the real revoke wherever they do (i.e. the actual Supabase
-- project).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL PRIVILEGES ON TABLE
      public."User",
      public."Session",
      public."LessonCompletion",
      public."PasswordResetToken",
      public."LessonCheckpoint",
      public."UserConceptMastery",
      public."ExerciseAttempt",
      public."Game",
      public."GameAnalysis",
      public."MoveAnalysis",
      public."PlacementAttempt",
      public."RateLimitHit",
      public."_prisma_migrations"
    FROM anon, authenticated;
  END IF;
END $$;
