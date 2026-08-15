# Security checklist

Status against the brief's Section 16 list. This is a checklist of what's
true today, not a claim of completeness — several rows are honest "no"s.

| Requirement | Status |
|---|---|
| Secure authentication | Implemented — bcryptjs password hashing, database-backed opaque session tokens, httpOnly cookies. See ADR-0003. |
| Server-side access control | Partial — every mutation goes through a Server Action that calls `getSession()` server-side; there is exactly one role ("learner"), so there's nothing to authorize *between* roles yet. |
| Role-based permissions | **Not implemented.** No `role` field exists. Needed before an authoring portal (brief Section 14) can exist safely. |
| Row-level data protections | Implicit via `userId` filtering in every query (e.g. `completeLessonAction` only ever reads/writes the session's own `userId`) — not enforced by a per-row database-level policy on the app's own access path (Prisma connects as a role that bypasses RLS by default). Postgres RLS *is* enabled on all three tables (no policies — deny-all), closing Supabase's auto-provisioned public REST API instead; see ADR-0005. |
| Input validation | Server Actions validate email format, password length, and birth year server-side (`app/actions.ts`) before any DB write. Exercise content is Zod-validated at build/content-validation time, not at runtime request time (content is trusted, author-controlled, not user input). |
| Rate limiting | **Implemented**, backed by a Postgres `RateLimitHit` table (ADR-0005 gave the app a real shared database, which is what made this fix possible without new infrastructure) — applied to both `loginAction` (per-IP and per-email) and `signupAction` (per-IP). Started in-memory, which would have been close to a no-op on the planned Vercel deploy target (serverless functions don't share memory between invocations); fixed in the same pass once that was concrete rather than theoretical. Still collapses many real users into one bucket behind shared NAT or any deploy without a reverse proxy setting `x-forwarded-for` — deliberately generous limits account for that, not a fix for it. See `docs/known-risks.md`. |
| Secure headers | **Not implemented.** No CSP, no explicit security-header configuration in `next.config.ts`. |
| CSRF protection | Relies on Next.js Server Actions' built-in origin-check protection (App Router default) — not independently audited or documented beyond that default. |
| XSS prevention | React's default JSX escaping covers all rendered lesson content and user-facing text; no `dangerouslySetInnerHTML` anywhere in the codebase. |
| Safe database access | Prisma's parameterized queries throughout — no raw SQL anywhere in the app. |
| Secret management | `.env`/`.env.local` gitignored; `.env.example` files committed with no real values. No secrets manager (Vault, etc.) — appropriate for local dev, not audited for a production deployment since none exists. |
| Dependency scanning | **Implemented.** `.github/dependabot.yml` — weekly npm (whole pnpm workspace) and github-actions ecosystem updates, security PRs ungrouped. |
| Administrative audit trails | **Not implemented** — no admin actions exist yet to audit. |
| Account export and deletion | **Implemented.** `/account` — export via a Route Handler returning the account's data as JSON; deletion requires re-entering the password plus a client-side confirm dialog, and cascades (Session, LessonCompletion) via `onDelete: Cascade`. See `docs/known-risks.md`. |
| Data retention | Not documented or enforced — no automatic deletion of anything. |
| Backups and recovery | **Not independently set up.** The database itself is now Supabase-hosted Postgres (ADR-0005), which includes its own backup story on the free tier (daily, short retention) — not verified or documented here, and no separate backup strategy exists beyond whatever Supabase provides by default. |
| Privacy policy | **Does not exist.** No privacy policy page or copy anywhere in the app. |
| Child-safety / parental consent | **Not real compliance — a conservative stopgap.** Signup collects a birth year, checks it server-side, and blocks account creation outright for under-13s with an explanatory message. Birth year is used only for this check and is never persisted (data minimization). This is a refusal to collect a child's data without a real verifiable-parental-consent mechanism, not COPPA compliance — see ADR discussion in `docs/roadmap.md`'s open-decisions list. Real compliance is a legal question, not something this codebase should claim to have solved. |

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
