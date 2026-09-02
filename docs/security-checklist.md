# Security checklist

Status against the brief's Section 16 list. This is a checklist of what's
true today, not a claim of completeness — several rows are honest "no"s.

| Requirement | Status |
|---|---|
| Secure authentication | Implemented — bcryptjs password hashing, database-backed opaque session tokens, httpOnly cookies. See ADR-0003. |
| Server-side access control | Partial — every mutation goes through a Server Action that calls `getSession()` server-side; there is exactly one role ("learner"), so there's nothing to authorize *between* roles yet. |
| Role-based permissions | **Not implemented.** No `role` field exists. Needed before an authoring portal (brief Section 14) can exist safely. |
| Row-level data protections | Implicit via `userId` filtering in every query (e.g. `completeLessonAction` only ever reads/writes the session's own `userId`) — not enforced by a per-row database-level policy on the app's own access path (Prisma connects as a role that both owns every table and has `BYPASSRLS`, verified live before ever changing this posture — see below). **Postgres RLS is enabled on every public application table** (all 12 Prisma models plus `_prisma_migrations`), not just the three that existed when this was first done — see "Row-Level Security posture" below and ADR-0005. |
| Input validation | Server Actions validate email format, password length, and birth year server-side (`app/actions.ts`) before any DB write. Exercise content is Zod-validated at build/content-validation time, not at runtime request time (content is trusted, author-controlled, not user input). |
| Rate limiting | **Implemented**, backed by a Postgres `RateLimitHit` table (ADR-0005 gave the app a real shared database, which is what made this fix possible without new infrastructure) — applied to both `loginAction` (per-IP and per-email) and `signupAction` (per-IP). Started in-memory, which would have been close to a no-op on the planned Vercel deploy target (serverless functions don't share memory between invocations); fixed in the same pass once that was concrete rather than theoretical. Still collapses many real users into one bucket behind shared NAT or any deploy without a reverse proxy setting `x-forwarded-for` — deliberately generous limits account for that, not a fix for it. See `docs/known-risks.md`. |
| Secure headers | **Implemented.** `middleware.ts` sets a nonce-based `Content-Security-Policy` (fresh nonce per request — `script-src 'self' 'nonce-...' 'wasm-unsafe-eval'`, the latter required for the Stockfish engine's WebAssembly; everything else same-origin only, `object-src 'none'`, `frame-ancestors 'none'`); `next.config.ts`'s `headers()` adds the static ones (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`). `style-src` keeps `'unsafe-inline'` — a deliberate, narrow trade-off (React's style prop and Next's dev-mode CSS injection aren't nonce-friendly the way `<script>` is, and inline-style-only XSS has far less exploit value than inline script) — everything else is nonce/self only. Verified against the real app, not just theory: a full local E2E run (`e2e/security-headers.spec.ts` plus the rest of the suite, whose `consoleErrorGuard` auto-fixture fails any test on an unexpected `console.error`, which is exactly how a CSP violation surfaces) confirmed Play mode's Stockfish worker+WASM still runs, the theme-init script still runs, and nothing else in the app trips the policy. |
| CSRF protection | Relies on Next.js Server Actions' built-in origin-check protection (App Router default) — not independently audited or documented beyond that default. |
| XSS prevention | React's default JSX escaping covers all rendered lesson content and user-facing text; no `dangerouslySetInnerHTML` anywhere in the codebase. |
| Safe database access | Prisma's parameterized queries throughout — no raw SQL anywhere in the app. |
| Secret management | `.env`/`.env.local` gitignored; `.env.example` files committed with no real values. No secrets manager (Vault, etc.) — appropriate for local dev, not audited for a production deployment since none exists. |
| Dependency scanning | **Implemented.** `.github/dependabot.yml` — weekly npm (whole pnpm workspace) and github-actions ecosystem updates, security PRs ungrouped. |
| Administrative audit trails | **Not implemented** — no admin actions exist yet to audit. |
| Account export and deletion | **Implemented.** `/account` — export via a Route Handler returning the account's data as JSON; deletion requires re-entering the password plus a client-side confirm dialog, and cascades (Session, LessonCompletion) via `onDelete: Cascade`. See `docs/known-risks.md`. |
| Data retention | Not documented or enforced — no automatic deletion of anything. |
| Environment isolation (Preview vs. Production) | **Not implemented — confirmed shared, not just unaudited.** Every Vercel Preview deployment (one per open PR, no auth gate observed) connects to the same live Supabase database Production uses; see `docs/known-risks.md` and `docs/deployment.md` for the evidence and the recommended fix (Supabase branching, or unsetting Preview's `DATABASE_URL`). Real user data is one PR-preview click away from anyone with the link. **The RLS/Data API remediation below does not fix this** — it closes Supabase's anon-key REST API surface, which is a completely different path from Prisma's own trusted connection that every Preview and Production deployment shares equally; a pushed migration still reaches the one shared database regardless of RLS. See the deployment runbook in this remediation's own documentation for the specific precaution taken because of this. |
| Backups and recovery | **Not independently set up.** The database itself is now Supabase-hosted Postgres (ADR-0005), which includes its own backup story on the free tier (daily, short retention) — not verified or documented here, and no separate backup strategy exists beyond whatever Supabase provides by default. |
| Privacy policy | **Does not exist.** No privacy policy page or copy anywhere in the app. |
| Child-safety / parental consent | **Not real compliance — a conservative stopgap.** Signup collects a birth year, checks it server-side, and blocks account creation outright for under-13s with an explanatory message. Birth year is used only for this check and is never persisted (data minimization). This is a refusal to collect a child's data without a real verifiable-parental-consent mechanism, not COPPA compliance — see ADR discussion in `docs/roadmap.md`'s open-decisions list. Real compliance is a legal question, not something this codebase should claim to have solved. |

## Row-Level Security posture (Supabase Data API)

Supabase auto-provisions a public PostgREST API (the "Data API"), gated by
`anon`/`authenticated` roles, on every project regardless of whether the
app uses it. MoveWise doesn't: Prisma connects server-side only, via a
direct/pooled Postgres connection string, never exposed to the browser,
and there is no Supabase Auth usage anywhere (custom cuid `userId`s,
hand-rolled opaque sessions — see ADR-0003 — not `auth.uid()`). The Data
API endpoint exists anyway, so it needs to be closed explicitly rather
than left to "the app just doesn't call it."

**Current posture, true of every public application table** (all 12
Prisma models — `User`, `Session`, `PasswordResetToken`,
`LessonCompletion`, `LessonCheckpoint`, `UserConceptMastery`,
`ExerciseAttempt`, `Game`, `GameAnalysis`, `MoveAnalysis`,
`PlacementAttempt`, `RateLimitHit` — plus Prisma's own
`_prisma_migrations`), not just the three that happened to exist when RLS
was first turned on (`20260815075152_enable_rls`) — nine tables added by
later migrations shipped with RLS disabled until
`20260902110000_enforce_rls_all_tables_revoke_data_api` closed the gap:

1. **Row-Level Security is enabled on every one.** No exceptions, no
   "new tables are fine to skip for now."
2. **There are intentionally zero RLS policies, on any table.** This is
   not an oversight to fill in later — this app has no Supabase Auth
   users at all, so a policy modeled on `auth.uid()` (the only identity
   Postgres RLS policies here could reasonably reference) would be
   actively wrong, not just redundant. RLS enabled + zero policies is a
   real, working default-deny for the Data API roles.
3. **`anon` and `authenticated` have zero table privileges** — the same
   migration also runs a guarded `REVOKE ALL PRIVILEGES ... FROM anon,
   authenticated` (guarded because those roles don't exist on a
   plain/CI/local Postgres instance, only on the real Supabase project;
   see the migration's own comments). This is a second, independent
   layer on top of RLS: even a future mistaken policy (e.g. someone adds
   `USING (true)` without realizing what it exposes) still hits a
   permission-denied wall at the grant level first.
4. **Prisma's own connection is a separately verified, trusted
   server-side role** — not affected by any of the above. RLS only
   restricts a table's *owner* when `FORCE ROW LEVEL SECURITY` is set,
   which this app never uses (see next point); ordinarily, the owner
   (and any `BYPASSRLS` role) bypasses RLS entirely, by Postgres design.
   Before ever writing the enabling migration, this was verified live
   against the actual Supabase project (`erfjoslqpjdnlsfzimvi`), not
   assumed from documentation: the runtime role (`postgres`) has
   `rolbypassrls = true` **and** is `pg_class.relowner` for all 13 public
   tables — either fact alone would be sufficient; both hold. Re-verify
   this preflight (`SELECT current_user, rolbypassrls FROM pg_roles WHERE
   rolname = current_user`, plus table ownership) before ever changing
   which role Prisma connects as, or before setting `FORCE ROW LEVEL
   SECURITY` on anything (see next point).
5. **`FORCE ROW LEVEL SECURITY` must never be enabled without first
   redesigning application data access.** Doing so would start applying
   RLS to the table owner too — since there are zero policies, that would
   make every one of Prisma's own queries fail outright (RLS enabled + no
   policies + forced = deny-all for literally everyone, including the
   app). This is not a "stricter is safer" knob to reach for casually;
   it requires first deciding what a real per-row policy model would even
   look like for a schema with no Supabase Auth identity to key off of.
6. **A new public table must pass the automated RLS regression check**
   before it can be considered done. `packages/db/scripts/check-rls.ts`
   (`pnpm --filter @movewise/db db:check-rls`) connects to a target
   database and fails if any ordinary/partitioned table in `public` has
   RLS disabled, or if `FORCE ROW LEVEL SECURITY` is set anywhere it
   shouldn't be — it never logs the connection string it used, only table
   names. Wired into CI (`.github/workflows/ci.yml`'s `verify` job) right
   after the build step that applies migrations, specifically because the
   nine-table gap above went undetected by every other check in this
   repository (typecheck, lint, unit tests, content validation, a real
   production build, the full E2E suite) — none of them can see database
   grants/RLS state, which is exactly why this needed its own dedicated
   check rather than being assumed to be "probably still fine."

**Data API exposure at the project-settings level (separate from the
above, not yet closed by any migration)**: everything in points 1–6
above closes access at the *database* layer (RLS, grants, default
privileges) — it does not disable the Data API endpoint itself. A
follow-up audit checked whether the endpoint could be turned off
entirely at the Supabase project-settings level (the strictest possible
closure, since it removes the PostgREST/GraphQL/Realtime surface
regardless of any future grant mistake) and found no MCP tool capable of
reading or changing that setting — it is dashboard-only. Also confirmed:
this app has zero Supabase SDK/PostgREST/GraphQL/Realtime/Storage/Auth
usage anywhere in the codebase (`@supabase/*` does not appear in any
`package.json`), so disabling the Data API is safe for the app itself
whenever a human does it. The manual path, for whoever has dashboard
access: **Supabase dashboard → Project Settings → Data API → either
remove `public` from "Exposed schemas" or turn the Data API off
entirely.** This is recorded here as an open, documented action, not
performed autonomously — it is a project-configuration change outside
this migration-based remediation's own scope and outside what the
available tooling can verify or execute.

**What this does not fix**: the Preview/Production shared-database risk
(see the "Environment isolation" row above) is a completely separate
problem — RLS and the REVOKE only close the Data API/PostgREST path,
which this app was never using in the first place. Prisma's own trusted
connection, and everyone who can reach a Preview URL, still hits the same
one live database either way.

## "Never rely on hidden UI controls as authorization" (brief, explicit instruction)

Followed: lesson **locking** on the home page (`LearningPath.tsx`) is a
pedagogical sequencing feature, computed and rendered client-visible — it
is *not* enforced server-side, and deliberately isn't presented as a
security boundary anywhere in the code or docs. Nothing sensitive is
protected by lesson order; a learner could deep-link to a
not-yet-unlocked lesson's URL and it would render normally. This is a
correct, intentional distinction, not an oversight — don't "fix" it by
adding server-side lesson-access blocking without first confirming that's
actually wanted (it would be new scope, not a bug fix).
