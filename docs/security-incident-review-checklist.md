# Incident-review checklist: RLS-disabled exposure window

## Why this exists

Nine public application tables (`RateLimitHit`, `MoveAnalysis`,
`GameAnalysis`, `LessonCheckpoint`, `Game`, `ExerciseAttempt`,
`PasswordResetToken`, `PlacementAttempt`, `UserConceptMastery`) had Row-
Level Security **disabled** — and `anon`/`authenticated` held **all table
privileges** — on the real Supabase project (`erfjoslqpjdnlsfzimvi`) from
whenever each table was created (see the migration timestamps below)
until the remediation in `20260902110000_enforce_rls_all_tables_revoke_data_api`
closes it. During that window, anyone holding the project's public `anon`
key could, in principle, have read or written any row in those tables
directly through Supabase's auto-provisioned PostgREST Data API — a
completely different path from the app's own Prisma connection, and one
the app itself never used.

This document is deliberately **review-only**. It does not delete,
invalidate, or rotate anything — see "Escalation (requires approval)" at
the end for what to do if the review below finds evidence of misuse. Per
the task this was written under: **no destructive or credential-rotating
action has been taken.**

## Table exposure windows (from migration history)

| Table | First live without RLS since (migration) |
|---|---|
| `RateLimitHit` | `20260815083709_add_rate_limit_hit` |
| `UserConceptMastery`, `ExerciseAttempt` | `20260815123011_add_concept_mastery_and_exercise_attempts` |
| `GameAnalysis` | `20260823094922_add_game_analysis` |
| `MoveAnalysis` | `20260823100335_add_game_analysis_summary` (`Game`'s own table predates this; see below) |
| `LessonCheckpoint` | `20260826164631_add_lesson_checkpoint` |
| `PasswordResetToken` | `20260826174910_add_password_reset_token` |
| `PlacementAttempt` | `20260830121630_add_placement_attempt` |
| `Game` | Present since `20260815075025_init_postgres` (the very first migration) — RLS was never enabled on it even though it's one of the app's original tables, since the initial `20260815075152_enable_rls` migration only covered `User`/`Session`/`LessonCompletion`. |

## Known limitation: PostgREST/API logs do not reach back this far

**Checked, not assumed.** Supabase's log retention on this project does
not cover the exposure window above. Confirmed two ways before writing
this checklist:

1. `edge_logs` (the source that carries PostgREST/Data-API HTTP
   requests) for the last 24 hours (2026-09-01 → 2026-09-02) contains
   exactly one entry, and it's Supabase's own internal management-API
   traffic (`POST /admin/v1/network-bans/retrieve`), not application or
   Data API traffic — zero requests to any `/rest/v1/...` table endpoint.
2. Querying `edge_logs` for an arbitrary 24-hour window well inside the
   exposure period (2026-08-25) returned **zero rows total** — not
   "zero matching," zero of anything. The retention window has already
   rolled past the exposure period entirely.

**This means step 1 below ("review PostgREST logs") is not actually
executable against this project today** — there is nothing left to
review. Recorded here so this isn't silently skipped or falsely claimed
as "done": if a longer-retention log export/drain exists elsewhere (a
paid plan's extended retention, a third-party log sink, Vercel's own
request logs if any request pattern is distinguishable there), check
that instead. Absent that, the review below relies on the data itself
(which persists, unlike the logs) rather than access logs.

## Review checklist

### 1. PostgREST/Data-API access logs (see limitation above)
- [ ] If an extended-retention log source exists (paid plan, external
      drain), query it for requests to:
      `/rest/v1/RateLimitHit`, `/rest/v1/MoveAnalysis`,
      `/rest/v1/GameAnalysis`, `/rest/v1/LessonCheckpoint`,
      `/rest/v1/Game`, `/rest/v1/ExerciseAttempt`,
      `/rest/v1/PasswordResetToken`, `/rest/v1/PlacementAttempt`,
      `/rest/v1/UserConceptMastery`
      from each table's own exposure start date (above) onward.
- [x] Supabase's own default-retention `edge_logs` checked for the only
      window still available (last 24h) — **zero Data-API requests
      found** to any table endpoint. (Performed 2026-09-02, before
      writing this checklist — see above.)

### 2. `PasswordResetToken` anomalies
- [x] **Checked directly against the live table** (2026-09-02, read-only
      `count(*)` queries — no token values read or displayed, per this
      checklist's own requirement):
      - Active, unused tokens (`usedAt IS NULL AND expiresAt > now()`): **0**
      - Expired, unused tokens (`usedAt IS NULL AND expiresAt <= now()`): **0**
      - Used tokens (`usedAt IS NOT NULL`): **0**
      - **Total rows ever created: 0**
- No password-reset activity has ever occurred against this project —
  nothing to investigate for this table specifically, as of this review.
  Re-run the same `count(*)` query (never `SELECT token`) if this
  checklist is revisited later and the total is no longer 0, to see how
  many new tokens appeared since.

### 3. Suspicious mutations: rate-limit, learner-progress, game-analysis tables
- [x] **Row counts checked directly** (2026-09-02): `User` — 0,
      `RateLimitHit` — 0, `Game` — 0, `GameAnalysis` — 0,
      `PlacementAttempt` — 0, `UserConceptMastery` — 0,
      `ExerciseAttempt` — 0, `LessonCheckpoint` — 0. **Every one of these
      tables is completely empty** — no rows exist at all, so there is
      nothing to review for suspicious content, timing anomalies, or
      out-of-band mutation patterns (e.g. a `RateLimitHit` row with an IP
      that never hit the app's own rate-limited routes, or a
      `UserConceptMastery` row with no corresponding `PlacementAttempt`/
      lesson history explaining it).
- [ ] If this checklist is re-run later and any of these counts are
      non-zero, look specifically for: `RateLimitHit` rows whose
      `identifier`/timing don't correlate with real login/signup
      attempts from the app's own logs; `UserConceptMastery` rows marked
      proficient with no explaining `PlacementAttempt` or lesson
      completion; `GameAnalysis`/`MoveAnalysis` rows with no matching
      `Game` row (orphaned writes bypassing the app's own game-creation
      flow); any row whose `createdAt` predates its owning `User`'s
      `createdAt`.

### 4. General anomaly sweep
- [x] Confirmed via `pg_class`/live query (2026-09-02): all 13 public
      tables now have RLS enabled, zero policies exist, `anon`/
      `authenticated` hold zero table privileges, and — the point of
      this whole review — **the tables were empty before the fix was
      even applied**, so no historical data exists that could have been
      exfiltrated or tampered with via the exposed path.

## Bottom line (as of 2026-09-02)

**No evidence of misuse — because there is no data to have been misused.**
Every table that was exposed is, and per the checks above appears to have
been, empty. This is not the same as "confirmed no unauthorized access
occurred" (the log evidence needed to say that definitively no longer
exists — see the limitation above); it is "confirmed there was nothing of
value at the exposed endpoints to access." Re-run section 2/3's `count(*)`
checks periodically, and section 1 the moment a longer-retention log
source becomes available, to keep this conclusion current rather than
treating it as a one-time clearance.

## Escalation (requires approval — recommend only, do not execute)

None of the following was performed as part of this review. If a future
re-run of this checklist (or a longer-retention log review) finds
evidence of actual unauthorized access or data tampering, the recommended
response — **pending explicit approval, not to be executed automatically**:

1. Invalidate all outstanding `PasswordResetToken` rows (set `expiresAt`
   to the past, or delete — a genuine data-changing action, get sign-off
   first).
2. Invalidate all active `Session` rows (forces every signed-in user to
   re-authenticate) if session hijacking via the exposed path is
   suspected.
3. Force a password reset for any account whose data shows signs of
   tampering.
4. Rotate the Supabase project's `anon`/`service_role` keys (Project
   Settings → API) if there's reason to think the `anon` key itself was
   ever exposed beyond its intended public-but-now-RLS-protected role —
   rotating keys is not a substitute for the RLS fix (per this task's own
   explicit instruction) and should only be done in addition to it, with
   the same care taken here to test the runtime role isn't broken by it.
