/**
 * RLS regression check (brief: "Add a regression check under the
 * database package that... fails if any ordinary or partitioned table in
 * public has RLS disabled... fails if FORCE ROW LEVEL SECURITY is
 * enabled unexpectedly... reports table names but never credentials").
 *
 * Exists because of a real, confirmed gap: the very first RLS migration
 * (20260815075152_enable_rls) only covered the three tables that existed
 * at the time (User, Session, LessonCompletion). Nine tables added by
 * later migrations (RateLimitHit, MoveAnalysis, GameAnalysis,
 * LessonCheckpoint, Game, ExerciseAttempt, PasswordResetToken,
 * PlacementAttempt, UserConceptMastery) silently shipped with RLS
 * disabled — nothing caught this until Supabase's own Security Advisor
 * was checked by hand, well after those tables had been live. This
 * script is the automated version of that check: run it after every
 * migration (CI does this — see .github/workflows/ci.yml) and a future
 * table that forgets `ENABLE ROW LEVEL SECURITY` fails the build instead
 * of silently drifting.
 *
 * Deliberately does NOT check for the *presence* of RLS policies — this
 * app intentionally has zero (see the migration's own doc comment: no
 * Supabase Auth, so a policy modeled on `auth.uid()` would be actively
 * wrong here). "RLS enabled, no policies" is the correct, deny-all
 * posture for the anon/authenticated Data API roles this app never uses;
 * asserting "some table has a policy" would be asserting the wrong thing.
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

interface TableRlsRow {
  table_name: string;
  rls_enabled: boolean;
  force_rls: boolean;
}

async function main(): Promise<void> {
  // Never log the connection string, nor let a connection error's own
  // message (which node-postgres/libpq can sometimes embed the DSN
  // inside) reach stdout unfiltered — redact it defensively even though
  // the ordinary error path here (auth/connect failure) doesn't
  // typically include it.
  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
  } catch (err) {
    console.error(`check-rls: could not connect to the target database (${redact(String(err))})`);
    process.exit(1);
  }

  try {
    // relkind 'r' = ordinary table, 'p' = partitioned table (the brief's
    // "ordinary or partitioned"). Excludes views ('v'), materialized
    // views ('m'), foreign tables ('f'), and indexes/sequences, which
    // RLS doesn't apply to.
    const { rows } = await client.query<TableRlsRow>(`
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

    if (rows.length === 0) {
      console.error("check-rls: found zero tables in the public schema — refusing to report a false pass on an empty/wrong database.");
      process.exit(1);
    }

    const rlsDisabled = rows.filter((r) => !r.rls_enabled);
    const forceRlsEnabled = rows.filter((r) => r.force_rls);

    let failed = false;

    if (rlsDisabled.length > 0) {
      failed = true;
      console.error(
        `check-rls: RLS is DISABLED on ${rlsDisabled.length} public table(s): ${rlsDisabled.map((r) => r.table_name).join(", ")}`,
      );
    }

    if (forceRlsEnabled.length > 0) {
      failed = true;
      console.error(
        `check-rls: FORCE ROW LEVEL SECURITY is enabled on ${forceRlsEnabled.length} table(s), which this app never intends to use ` +
          `(it would start applying RLS to the table owner too — see docs/security-checklist.md): ${forceRlsEnabled.map((r) => r.table_name).join(", ")}`,
      );
    }

    if (failed) {
      process.exit(1);
    }

    console.log(`check-rls: OK — RLS enabled on all ${rows.length} public table(s), FORCE ROW LEVEL SECURITY not set on any.`);
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
