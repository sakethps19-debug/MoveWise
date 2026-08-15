# Known risks

Not a todo list — a register of what's known to be missing or weak, kept
current as things get fixed or new risks are found. Cross-references the
fuller detail in `docs/security-checklist.md` and `docs/testing-strategy.md`
rather than repeating it.

## High priority

- **Real COPPA compliance is not implemented**, only a conservative
  stopgap (block under-13 signup outright). This is a legal question, not
  an engineering one — see `docs/security-checklist.md` and
  `docs/roadmap.md`'s open-decisions list.

## Medium priority

- **No account export or deletion.** A real gap against both the brief's
  Profile section and general privacy expectations for a product that
  will eventually handle real users' data, including minors' guardians'
  data once COPPA compliance is real.
- **No analytics.** None of the brief's Section 18 questions ("where do
  learners struggle," "which misconceptions recur") are answerable yet —
  blocked on both an analytics pipeline and the learner model
  (`docs/learner-model.md`) that would give the analytics something
  meaningful to measure.
- **No role/permission system.** Every account is implicitly a "learner" —
  fine today, blocking for an authoring portal (brief Section 14).

## Lower priority / accepted for now

- **SQLite in production would not work** (Vercel's serverless runtime has
  no persistent filesystem) — not a bug, a known constraint of the current
  dev-only database choice, resolved by the Postgres migration in
  `docs/roadmap.md`'s open decisions, not before.
- **No i18n infrastructure.** English-only throughout, no translation
  keys, no locale routing.
- **No PWA/offline support.**
- **Board orientation is always White-at-bottom** — not configurable,
  not validated as a distinct concept in content validation (see
  `docs/testing-strategy.md`'s coverage table).
- **Star tiers (0/1-2/3+ mistakes) are an initial guess**, not user-tested
  — see ADR-0004.

## Resolved this session, kept here for the record

- **Guest progress isn't persisted anywhere**: `lib/guestProgress.ts`
  writes completions to `localStorage` for signed-out learners
  (best-effort — silently no-ops if storage is unavailable, e.g. private
  browsing), and `LearningPath` now reads it back so guests get the same
  prerequisite-based locking and star display as signed-in users, instead
  of the old "everything unlocked, nothing remembered" guest view. On
  signup or login, that local progress is sent as a hidden form field and
  folded into the account server-side (`migrateGuestProgress` in
  `app/actions.ts`) in the same request that creates the session — validated
  and range-clamped there, since it's client-controlled input, and merged
  with the same best-mistakes rule as a repeat signed-in completion so it
  can never downgrade progress the account already has. Applies to login
  as well as signup: signing into an *existing* account from a browser
  with local guest progress carries it in too, on the same "this device's
  progress is mine" assumption most products with guest modes make.
  Verified: the E2E suite's guest-locking test needed updating for the
  new (deliberately different, more useful) guest-locking behavior — a
  fresh guest with zero completions now sees the same locked/unlocked
  state as a fresh account, not everything open — plus a new test driving
  the full guest-completes-a-lesson → signs up → sees it migrated flow.
- **No dependency scanning**: `.github/dependabot.yml` now watches both
  the npm ecosystem (root `package.json`/`pnpm-lock.yaml`, which
  Dependabot resolves across the whole pnpm workspace — no per-package
  config needed) and `github-actions` (the workflow file's own pinned
  action versions), weekly. Security-update PRs are never batched;
  routine version bumps are grouped into one PR to keep noise down for
  a small team.
- **No rate limiting on login/signup**: `apps/web/lib/rate-limit.ts` adds
  an in-memory sliding-window limiter — 5 signups/hour per IP, 15
  logins/15min per IP, and 8 logins/15min per email (the last one to
  catch credential stuffing distributed across IPs against a single
  account). Explicitly a stopgap, not the final answer: it's per-process
  state, so it doesn't survive a restart or share state across multiple
  server instances. A real fix (shared store, e.g. Redis) belongs with
  the Postgres/hosting migration in `docs/roadmap.md`'s open decisions,
  for the same reason SQLite is dev-only for now (ADR-0002) — not worth
  building before that migration's infrastructure exists. Verified: full
  E2E suite (14/14 at the time this landed) still passes with the
  limiter active, plus a direct read of the new code.
- **No E2E suite was committed to the repo**: `apps/web/e2e/` now has 8
  real `@playwright/test` specs (14 tests at the time this landed — see
  `docs/testing-strategy.md` for the current count) covering lesson
  flows across all 13 exercise-step types, the retry-bug fix, hearts,
  mastery stars, learning-path locking, auth, and Play mode — promoted
  from this session's scratch verification scripts, and wired into CI as
  a second job (`e2e`, browsers installed fresh each run). Writing this
  suite immediately surfaced a real bug (see below) that ad hoc
  scratch-script testing had never caught, which is exactly the point of
  committing it.
- **Missing lesson-completion feedback**: clicking "Finish lesson" called
  the persistence action but showed nothing and navigated nowhere — a
  real gap against the brief's explicit "completion feedback" and "lesson
  completion screens" requirements (Sections 7–8), not just a missing
  nicety. Found while writing the E2E suite (a test asserting
  `waitForURL("/")` after finishing timed out) — every earlier manual/
  scratch-script check happened to `page.goto("/")` explicitly afterward
  instead of asserting on real navigation, so it went unnoticed. Fixed
  with a real completion screen (star rating, XP earned, a link back to
  the learning path) in `LessonRunner`.
- **No CI**: `.github/workflows/ci.yml` now runs install (frozen lockfile),
  typecheck, unit tests, content validation, and a real production build
  on every push/PR — the exact sequence that was previously only run
  manually. Verified locally first with a true clean-checkout simulation
  (local `.env`/`.env.local` temporarily moved aside) before trusting the
  workflow file, since CI has no local env files to fall back on.
- **Stuck-state bug**: every board-click exercise type could get
  permanently stuck after a wrong answer, including on the *correct*
  answer clicked immediately after. Existed since these exercise types
  were first built; found and fixed during the `LessonRunner` component
  split. See that commit's message for the full root-cause writeup.
- **Prisma 7 + webpack + native bindings**: `better-sqlite3`'s native
  binary lookup broke under webpack bundling; switched to
  `@prisma/adapter-libsql` and added an explicit `webpack.externals`
  override (Next's built-in `serverExternalPackages` doesn't work for
  symlinked pnpm workspace packages). See ADR-0002.
- **Guided-sequence validator gap**: the content validator checked
  player-move legality without ever applying the scripted opponent
  replies between them, which could produce false legality results on
  any sequence where a reply changes what's legal next. Fixed when the
  5 previously-unrendered exercise types were built out.
