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

- **No analytics.** None of the brief's Section 18 questions ("where do
  learners struggle," "which misconceptions recur") are answerable yet —
  blocked on both an analytics pipeline and the learner model
  (`docs/learner-model.md`) that would give the analytics something
  meaningful to measure.
- **No role/permission system.** Every account is implicitly a "learner" —
  fine today, blocking for an authoring portal (brief Section 14).

## Lower priority / accepted for now

- **No i18n infrastructure.** English-only throughout, no translation
  keys, no locale routing.
- **No PWA/offline support.**
- **Board orientation is always White-at-bottom** — not configurable,
  not validated as a distinct concept in content validation (see
  `docs/testing-strategy.md`'s coverage table).
- **Star tiers (0/1-2/3+ mistakes) are an initial guess**, not user-tested
  — see ADR-0004.

## Resolved this session, kept here for the record

- **SQLite in production would not work**: migrated to Postgres, hosted
  on Supabase (ADR-0005) — resolving open decision #1 in
  `docs/roadmap.md` once the user chose to (hosting/cost was the genuinely
  open question, not something to pick unilaterally). Along the way,
  Supabase's own tooling flagged Row-Level Security as disabled on the
  new tables — a real exposure via Supabase's auto-provisioned public
  REST API, even though this app doesn't use that API at all. Surfaced to
  the user with the remediation SQL shown, not auto-applied, per the
  tool's own instructions; they chose to enable it. **Still open**: a
  real production `DATABASE_URL` (Supabase never exposes the DB password
  via API — the user needs to get it from their dashboard) and an actual
  deploy of the app itself; ADR-0005 lands the data layer only.
- **No accessibility test automation**: `e2e/accessibility.spec.ts` runs
  `@axe-core/playwright` (scoped to WCAG 2.0/2.1 A and AA rules, not
  axe's full best-practice set) against the home page, login/signup, a
  lesson mid-flow, the completion screen, Play mode, and `/account`.
  Writing it immediately found two real bugs in `Board.tsx` — a
  `role="gridcell"` with no `role="row"` ancestor (ARIA requires one;
  fixed with `display: contents` row wrappers that don't disturb the CSS
  Grid layout they sit inside), and `aria-pressed` used on a gridcell,
  which isn't an ARIA-allowed attribute for that role at all (fixed by
  switching to `aria-selected`, the ARIA-correct selection state for a
  grid cell) — both invisible to the by-eye verification this project
  relied on before, and both fixed properly rather than suppressed via a
  rule exclusion.
- **The chess-legality validator's own logic had no dedicated unit
  tests**: `packages/exercise-schema/src/validate-chess.test.ts` (22
  tests) now exercises `checkStep`'s branches directly — illegal-FEN
  short-circuiting, check/checkmate-delivering-square computation, the
  order-steps permutation check, move-piece/capture/find-legal-move
  legality checks, the guided-sequence forced-reply-application fix (see
  below), and the deliberate move-piece-only scoping of hint-arrow
  legality checks — instead of relying only on real lesson content
  happening to trip them. Several fixtures reuse the exact FEN/move data
  from real, already-validated lessons, so a "this should pass" case is
  checked against data independently known correct, not just internally
  consistent with itself.
- **No account export or deletion**: `/account` (linked from the
  signed-in home page) offers both. Export is a Route Handler
  (`app/account/export/route.ts`, not a Server Action — it needs to hand
  back a real downloadable file with response headers) returning the
  account's email, creation date, and every lesson completion as JSON.
  Deletion (`deleteAccountAction`) requires re-entering the password
  (verified server-side before anything happens) plus a native
  `window.confirm()` on the client as a second, independent guard against
  an accidental click; a single `prisma.user.delete` cascades to Session
  and LessonCompletion (`onDelete: Cascade` on both relations in
  `schema.prisma` already), so nothing is left orphaned. Verified: a new
  E2E spec drives both flows for real, including asserting that
  dismissing the confirm dialog leaves the account intact and that a
  login attempt after deletion fails — not just that the button exists.
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
  an in-memory sliding-window limiter — 20 signups/hour per IP, 15
  logins/15min per IP, and 8 logins/15min per email (the last one to
  catch credential stuffing distributed across IPs against a single
  account). Explicitly a stopgap, not the final answer, for two reasons:
  it's per-process state, so it doesn't survive a restart or share state
  across multiple server instances; and every key can collapse many real,
  unrelated users into one bucket — shared NAT (a school computer lab is
  exactly this product's audience) collapses by IP, and any deploy
  without a reverse proxy setting `x-forwarded-for` collapses *every*
  visitor into a literal `"unknown"` bucket. Generous limits are the only
  lever available against that until this becomes a real shared-store,
  per-user/session limiter — now that ADR-0005 gives the app a real
  Postgres database, that's a plausible place to back it (a
  `RateLimitBucket` table, or a real cache layer), but it isn't built.
  The signup limit started at 5/hour and was
  raised to 20/hour after the full local E2E suite itself tripped it —
  every local test request shares the same `"unknown"` IP bucket in dev
  (no reverse proxy), so a suite doing 7 signups across its specs is
  exactly the shared-bucket scenario the limiter needs to tolerate, not
  an edge case to special-case away. Verified: full
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
