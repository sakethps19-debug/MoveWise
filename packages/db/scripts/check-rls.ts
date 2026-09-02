/**
 * RLS + Data-API-exposure regression check (packages/db's own security
 * gate, run in CI after every migration — see .github/workflows/ci.yml).
 *
 * Exists because of two real, confirmed gaps, not hypothetical ones:
 *
 * 1. The first RLS migration (20260815075152_enable_rls) only covered
 *    the three tables that existed at the time. Nine tables added by
 *    later migrations silently shipped with RLS disabled — nothing
 *    caught this until Supabase's own Security Advisor was checked by
 *    hand, well after those tables had been live. This is what the
 *    original (table-only) version of this check guarded against.
 *
 * 2. A follow-up security audit found the *actual* root cause behind (1):
 *    querying `pg_default_acl` against the real Supabase project
 *    (erfjoslqpjdnlsfzimvi) showed that role "postgres" — the exact role
 *    `prisma migrate deploy` runs as — has a default-privilege entry for
 *    the `public` schema that auto-grants `anon`/`authenticated` full
 *    privileges on every NEW table, sequence, and function it creates.
 *    Enabling RLS on today's tables (and revoking today's grants, done
 *    in 20260902110000) does nothing to stop the *next* migration from
 *    shipping a brand new table already exposed — this check's default-
 *    privilege section exists specifically so that keeps failing loudly
 *    instead of silently recurring, until
 *    20260902120000_default_privileges_deny_anon_authenticated (or
 *    whatever future migration re-closes it) is applied.
 *
 * Deliberately does NOT check for the *presence* of RLS policies — this
 * app intentionally has zero (see the migration's own doc comment: no
 * Supabase Auth, so a policy modeled on `auth.uid()` would be actively
 * wrong here). "RLS enabled, no policies" is the correct, deny-all
 * posture for the anon/authenticated Data API roles this app never uses;
 * asserting "some table has a policy" would be asserting the wrong thing.
 *
 * Portable by design: every check that references `anon`/`authenticated`
 * (Supabase-only roles, absent on CI's/local dev's plain-Postgres
 * instances) is skipped — not failed — when those roles don't exist,
 * exactly mirroring the migrations' own guarded DO blocks. Only the
 * table-level RLS/FORCE-RLS checks run unconditionally, since those are
 * plain PostgreSQL features present everywhere.
 */
import "dotenv/config";
import { Client } from "pg";

/**
 * Never read `DATABASE_URL` here as a silent fallback — this check is
 * explicitly meant to be pointed at whatever database was just migrated
 * (CI's throwaway Postgres, a local ephemeral test database, or —
 * deliberately, for the one-time production verification step in the
 * deployment runbook — the real Supabase project), never assumed. A
 * dedicated var name (falling back to DATABASE_URL, which is what CI and
 * local dev already set for `prisma migrate deploy`) keeps that call
 * site explicit without forcing every caller to rename an env var they
 * already have.
 */
const DATABASE_URL = process.env.RLS_CHECK_DATABASE_URL ?? process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error(
    "check-rls: no database URL supplied — set RLS_CHECK_DATABASE_URL or DATABASE_URL. Refusing to guess a default.",
  );
  process.exit(1);
}

/**
 * Views/materialized views/SECURITY DEFINER functions this check accepts
 * as intentionally reviewed, keyed by `"schema.name"`. Empty today — the
 * live schema has zero views and zero functions of any kind in `public`
 * (confirmed against the real Supabase project before writing this
 * check). Add an entry here only after actually reviewing what a new
 * object exposes and to whom; this array *is* the "explicitly reviewed"
 * record the brief asks for, not a formality — an unlisted view or
 * SECURITY DEFINER function fails the build on purpose.
 */
const REVIEWED_VIEWS: ReadonlySet<string> = new Set([]);
const REVIEWED_SECURITY_DEFINER_FUNCTIONS: ReadonlySet<string> = new Set([]);

interface TableRlsRow {
  table_name: string;
  rls_enabled: boolean;
  force_rls: boolean;
}

interface GrantRow {
  grantee: string;
  object_name: string;
  privilege_type: string;
}

interface DefaultAclRow {
  obj_type: "r" | "S" | "f";
  grantee: string;
}

interface ViewRow {
  schema: string;
  name: string;
  kind: "view" | "materialized view";
}

interface SecurityDefinerFunctionRow {
  schema: string;
  name: string;
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
  } catch (err) {
    console.error(`check-rls: could not connect to the target database (${redact(String(err))})`);
    process.exit(1);
  }

  const failures: string[] = [];

  try {
    // --- 1. Table RLS / FORCE RLS — unconditional, plain PostgreSQL. ---
    // relkind 'r' = ordinary table, 'p' = partitioned table (the brief's
    // "ordinary or partitioned"). Excludes views ('v'), materialized
    // views ('m'), foreign tables ('f'), and indexes/sequences, which
    // RLS doesn't apply to.
    const { rows: tableRows } = await client.query<TableRlsRow>(`
      SELECT
        c.relname AS table_name,
        c.relrowsecurity AS rls_enabled,
        c.relforcerowsecurity AS force_rls
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p')
      ORDER BY c.relname;
    `);

    if (tableRows.length === 0) {
      console.error("check-rls: found zero tables in the public schema — refusing to report a false pass on an empty/wrong database.");
      process.exit(1);
    }

    const rlsDisabled = tableRows.filter((r) => !r.rls_enabled);
    const forceRlsEnabled = tableRows.filter((r) => r.force_rls);

    if (rlsDisabled.length > 0) {
      failures.push(
        `RLS is DISABLED on ${rlsDisabled.length} public table(s): ${rlsDisabled.map((r) => r.table_name).join(", ")}`,
      );
    }
    if (forceRlsEnabled.length > 0) {
      failures.push(
        `FORCE ROW LEVEL SECURITY is enabled on ${forceRlsEnabled.length} table(s), which this app never intends to use ` +
          `(it would start applying RLS to the table owner too — see docs/security-checklist.md): ${forceRlsEnabled.map((r) => r.table_name).join(", ")}`,
      );
    }

    // --- 2. Views / materialized views — unconditional. ---
    // RLS does not protect views the way it protects tables; an
    // unreviewed view (especially one built on a security-sensitive
    // table) can expose data even with the base table locked down.
    const { rows: viewRows } = await client.query<ViewRow>(`
      SELECT n.nspname AS schema, c.relname AS name, CASE c.relkind WHEN 'm' THEN 'materialized view' ELSE 'view' END AS kind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
      ORDER BY c.relname;
    `);
    const unreviewedViews = viewRows.filter((v) => !REVIEWED_VIEWS.has(`${v.schema}.${v.name}`));
    if (unreviewedViews.length > 0) {
      failures.push(
        `${unreviewedViews.length} unreviewed view(s)/materialized view(s) in public — add to REVIEWED_VIEWS in this script only after ` +
          `confirming what they expose and to whom: ${unreviewedViews.map((v) => `${v.name} (${v.kind})`).join(", ")}`,
      );
    }

    // --- 3. SECURITY DEFINER functions — unconditional. ---
    // A SECURITY DEFINER function runs with its owner's privileges
    // regardless of who calls it — RLS on the tables it queries doesn't
    // help if the function itself is callable by anon/authenticated and
    // was written (or owned) carelessly. Every application-owned
    // function needs individual review, not just an EXECUTE-grant check.
    const { rows: secDefRows } = await client.query<SecurityDefinerFunctionRow>(`
      SELECT n.nspname AS schema, p.proname AS name
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef = true;
    `);
    const unreviewedSecDef = secDefRows.filter((f) => !REVIEWED_SECURITY_DEFINER_FUNCTIONS.has(`${f.schema}.${f.name}`));
    if (unreviewedSecDef.length > 0) {
      failures.push(
        `${unreviewedSecDef.length} unreviewed SECURITY DEFINER function(s) in public — add to REVIEWED_SECURITY_DEFINER_FUNCTIONS in this ` +
          `script only after confirming its search_path is pinned and its EXECUTE grants are intentional: ${unreviewedSecDef.map((f) => f.name).join(", ")}`,
      );
    }

    // --- Everything below only applies where anon/authenticated exist
    // (the real Supabase project) — skipped, not failed, on CI's/local
    // dev's plain-Postgres instances, which have no such roles. ---
    const { rows: dataApiRoles } = await client.query<{ rolname: string }>(
      `SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated');`,
    );
    const hasDataApiRoles = dataApiRoles.length === 2;

    if (hasDataApiRoles) {
      // --- 4. Direct table/sequence privileges for anon/authenticated. ---
      const { rows: tableGrants } = await client.query<GrantRow>(`
        SELECT grantee, table_name AS object_name, privilege_type
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated');
      `);
      if (tableGrants.length > 0) {
        const byTable = [...new Set(tableGrants.map((g) => `${g.object_name} (${g.grantee})`))];
        failures.push(`anon/authenticated hold direct table privileges on: ${byTable.join(", ")}`);
      }

      const { rows: sequenceGrants } = await client.query<GrantRow>(`
        SELECT grantee, object_name, privilege_type
        FROM information_schema.role_usage_grants
        WHERE object_schema = 'public' AND object_type = 'SEQUENCE' AND grantee IN ('anon', 'authenticated');
      `);
      if (sequenceGrants.length > 0) {
        const bySeq = [...new Set(sequenceGrants.map((g) => `${g.object_name} (${g.grantee})`))];
        failures.push(`anon/authenticated hold sequence privileges on: ${bySeq.join(", ")}`);
      }

      // --- 5. Function EXECUTE privileges for anon/authenticated. ---
      const { rows: functionGrants } = await client.query<{ grantee: string; routine_name: string }>(`
        SELECT grantee, routine_name
        FROM information_schema.role_routine_grants
        WHERE routine_schema = 'public' AND grantee IN ('anon', 'authenticated');
      `);
      if (functionGrants.length > 0) {
        const byFn = [...new Set(functionGrants.map((g) => `${g.routine_name} (${g.grantee})`))];
        failures.push(`anon/authenticated can EXECUTE application function(s): ${byFn.join(", ")}`);
      }

      // --- 6. Unsafe default privileges — the "future objects" gap
      // 20260902120000_default_privileges_deny_anon_authenticated exists
      // to close. Checks every default-ACL owner, not just the app's own
      // runtime role: a default ACL owned by a different role that still
      // names anon/authenticated is just as real a future-exposure risk.
      const { rows: defaultAcls } = await client.query<DefaultAclRow>(`
        SELECT d.defaclobjtype AS obj_type, a.grantee::regrole::text AS grantee
        FROM pg_default_acl d
        JOIN pg_namespace n ON n.oid = d.defaclnamespace
        CROSS JOIN LATERAL aclexplode(d.defaclacl) a
        WHERE n.nspname = 'public'
          AND a.grantee::regrole::text IN ('anon', 'authenticated');
      `);
      if (defaultAcls.length > 0) {
        const kindName: Record<string, string> = { r: "tables", S: "sequences", f: "functions" };
        const byKind = [...new Set(defaultAcls.map((d) => `${kindName[d.obj_type] ?? d.obj_type} (${d.grantee})`))];
        failures.push(
          `unsafe default privileges: future ${byKind.join(", ")} would automatically grant anon/authenticated access on creation`,
        );
      }
    }

    if (failures.length > 0) {
      console.error(`check-rls: ${failures.length} issue(s) found:`);
      for (const f of failures) console.error(`  - ${f}`);
      process.exit(1);
    }

    console.log(
      `check-rls: OK — RLS enabled on all ${tableRows.length} public table(s), FORCE ROW LEVEL SECURITY not set on any, ` +
        `no unreviewed views/SECURITY DEFINER functions` +
        (hasDataApiRoles ? ", and anon/authenticated have no current or default privileges on any application object." : " (anon/authenticated roles absent — grant/default-privilege checks skipped)."),
    );
  } finally {
    await client.end();
  }
}

/** Strips anything that looks like a Postgres connection URI (scheme + credentials) out of a string before it's ever printed. */
function redact(text: string): string {
  return text.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[redacted connection string]");
}

main().catch((err) => {
  console.error(`check-rls: unexpected failure — ${redact(String(err))}`);
  process.exit(1);
});
