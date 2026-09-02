-- Not derivable from schema.prisma — hand-authored, follow-up to
-- 20260902110000_enforce_rls_all_tables_revoke_data_api.
--
-- Real finding from a follow-up security audit, not a hypothetical: the
-- previous migration revokes anon/authenticated's privileges on the 13
-- tables that exist *today*, but a plain REVOKE only ever affects
-- existing objects. Querying pg_default_acl against the live Supabase
-- project (erfjoslqpjdnlsfzimvi) before writing this migration confirmed
-- that role "postgres" — the exact role `prisma migrate deploy` runs
-- as — has a default-privilege entry for the public schema that
-- auto-grants anon/authenticated/service_role full privileges on every
-- NEW table, sequence, and function it creates:
--   {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
--    authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}
-- (tables), plus matching entries for sequences and functions. This is
-- almost certainly the actual root cause of the original 9-table gap
-- this remediation closes elsewhere — not "someone forgot to add RLS to
-- each new migration," but that Supabase's own project-creation defaults
-- silently re-expose every single new table the moment it's created,
-- regardless of anyone's intent. Without this migration, the very next
-- `prisma migrate dev` that adds a table ships it already exposed again.
--
-- Scope: only anon/authenticated (the Data API roles this app never
-- uses) — matches the previous migration's own scope. Deliberately does
-- NOT touch service_role's default privileges (out of scope, same
-- reasoning as before: a private, RLS-bypassing credential never
-- exposed to a browser, not the "public" surface this remediation
-- targets) or any default ACL owned by supabase_admin/supabase_auth_admin
-- (Supabase-managed internal roles this migration must not touch).
--
-- Guarded the same way as the previous migration's REVOKE, for the same
-- reason: CI's and local dev's throwaway plain-Postgres instances have
-- no "anon"/"authenticated" roles at all, and ALTER DEFAULT PRIVILEGES
-- naming a nonexistent role errors out.
--
-- Deliberately omits "FOR ROLE postgres": a real bug caught by testing
-- this migration locally before it ever reached production — Postgres
-- only allows a role to change default privileges FOR ITSELF (or a role
-- it's a member of, or as superuser), so hardcoding "FOR ROLE postgres"
-- fails with "permission denied to change default privileges" everywhere
-- this migration runs as a different role — which is every environment
-- except the real Supabase project (locally it's "movewise", in CI it's
-- "movewise_ci"). Omitting FOR ROLE targets default privileges for
-- whichever role is actually executing this statement — exactly the
-- role `prisma migrate deploy` connects as in every environment, so this
-- is not just a portability workaround, it's the semantically correct
-- target in each one.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  END IF;
END $$;
