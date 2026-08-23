# End-to-end testing (Playwright + GitHub Actions)

Everything in this doc is doable from a browser — the GitHub web UI, the
Actions tab, a PR page. Nothing here requires a terminal or a local
checkout, which matters because this project is developed from an iPad.

## What's tested

`apps/web/e2e/` (24 spec files, 135 tests as of this writing) is a real,
click-through end-to-end suite against a running instance of the app — no
mocked network, no mocked chess logic. It covers:

- **Availability & navigation** — home page loads, both units render, key
  routes return correctly, an unknown lesson/route/puzzle 404s instead of
  blank-screening or crashing (`smoke.spec.ts`, `dev-tools.spec.ts`).
- **Responsive layout** — no horizontal scroll and correct nav variant
  (bottom bar vs. side rail) across the full documented breakpoint
  matrix, 320px through 1536px, including iPad portrait/landscape widths
  (`responsive.spec.ts`); chessboard cells stay perfectly square with
  consistent gaps at every one of those breakpoints, checked via real
  `getBoundingClientRect()` measurements, not CSS inspection
  (`chessboard-geometry.spec.ts`).
- **Touch interaction on real device profiles** — not just a resized
  desktop browser: `move-piece-alt-valid.spec.ts` and
  `tablet-touch-interactions.spec.ts` open real Playwright device
  contexts (`devices["iPad (gen 7)"]`, `"iPad (gen 7) landscape"`,
  `"iPhone 14"`) with `hasTouch` enabled and drive the board with
  `.tap()`, across lesson moves, Play mode, and puzzle solving.
- **Authentication** — signup, the under-13 age gate, duplicate-email and
  wrong-password rejection, logout, session persistence across re-login,
  protected-route redirect behavior (`auth.spec.ts`).
- **Learning path & lesson gating** — locked/available/completed states
  for a guest and a signed-in account, direct-URL bypass attempts against
  locked lessons (server-side gated, not just hidden in the UI), guest
  progress migrating into a new account on signup, principle-level
  gating and mastery-star tiering (`learning-path.spec.ts`,
  `progression-guard.spec.ts`, `cross-unit-progression.spec.ts`).
- **The chessboard itself** — all 13 exercise-step types
  (`exercise-types.spec.ts`, `lessons.spec.ts`,
  `new-concept-lessons.spec.ts`), retry-after-wrong-answer and hearts
  behavior (`retry-and-hearts.spec.ts`), a specific real regression
  around alternate-valid destinations (`move-piece-alt-valid.spec.ts`,
  `board-regression.spec.ts`).
- **Puzzles** — pool gating on prerequisite completion, wrong/correct
  moves, multi-puzzle sequences, and real progress persistence
  (`puzzle-practice.spec.ts`).
- **Play mode (Play & Learn)** — a real game against the embedded
  Stockfish engine as either color, resignation, and the demo-labeled
  post-game review (`play-mode.spec.ts`); real (non-demo) post-game
  analysis, move classification, and lesson recommendations for a signed-
  in account (`play-analysis.spec.ts`, `game-history.spec.ts`).
- **Remediation** — the struggling-learner reteach/easier-puzzle/retry
  flow (`remediation.spec.ts`) and the cross-unit practice hub
  (`practice-hub.spec.ts`).
- **XP & progress integrity** — stars/XP awarded once, not farmable by
  refresh or replay; progress surviving refresh and re-login; a dev-only
  reset control used to prove state actually clears, not just that a
  success message appears (`dev-tools.spec.ts`, `learning-path.spec.ts`).
- **Accessibility** — automated `axe-core` checks (WCAG 2.0/2.1 A/AA)
  against the home page (guest and signed-in), auth pages, a lesson
  mid-flow, lesson completion, Play mode, and account settings
  (`accessibility.spec.ts`).
- **Account management** — data export and account deletion, including
  that dismissing the delete-confirmation dialog leaves the account
  intact (`account.spec.ts`).

See `docs/testing-strategy.md` for the fuller narrative (unit tests,
content validation, and how this suite fits alongside them) and
`docs/known-risks.md` for defects this suite has caught historically.

**A `@smoke`-tagged subset** (6 tests: home loads, full auth round-trip,
a complete lesson flow with a real chess move, XP/star progression, a
solved puzzle, and a Play-mode game against the engine) covers the
business-critical path in well under a minute — see "Running only the
smoke suite" below.

### What isn't covered, and why

- **Vercel Preview Deployments are not used as the test target.**
  `docs/deployment.md` documents a deliberate, still-open decision: a
  Preview deployment's `DATABASE_URL` is left unset so PRs don't run
  migrations against the production Supabase database by default. Until
  that's decided (a separate preview database, or an accepted read-only/
  migration-safe posture), a Preview URL isn't guaranteed to even boot,
  so it isn't a dependable test target. The suite instead runs against a
  real `next dev` server started fresh inside the CI job itself, backed
  by a throwaway Postgres container — the same app code and real network
  requests, just not literally the deployed Vercel instance. This is the
  "most dependable alternative" the testing brief for this project asked
  for when Preview-URL testing isn't practical — worth revisiting once
  the Preview-database decision above is made.
- **Load/performance testing** — not built (see `docs/testing-strategy.md`).
- **Drag-and-drop chessboard interaction** — not applicable: the board
  only implements click/tap-to-select-then-move (`Board.tsx`'s
  `onSquareClick`), no drag handlers exist anywhere in the app. Every
  touch test in this suite uses `.tap()` accordingly.

## How CI runs

`.github/workflows/ci.yml` has two jobs:

1. **`verify`** — install, typecheck, lint, unit tests (Vitest, 159
   tests across all 6 packages), content validation, and a real
   production build (`next build`).
2. **`e2e`** — installs a fresh Chromium, starts the app for real
   (`pnpm dev`, against a throwaway Postgres service container scoped to
   that one job run), and runs the Playwright suite above.

Both run automatically on:
- every push to `main`,
- every pull request,
- and on demand (see below).

### Triggering a run manually from GitHub, on an iPad

1. Open the repository on **github.com** (Safari or the GitHub app both
   work).
2. Tap **Actions** in the repo's top navigation.
3. In the left sidebar, tap **CI**.
4. Tap **Run workflow** (top right of the run list). GitHub shows a small
   form.
5. Pick the branch, and for **"E2E suite to run"** choose `full` (every
   test) or `smoke` (the fast 6-test critical-path subset).
6. Tap **Run workflow**. A new run appears at the top of the list within
   a few seconds — tap it to watch progress live.

### Viewing results and reports

- The run page itself shows pass/fail per job and, on failure, GitHub
  annotates the exact failing test inline (via the `github` reporter).
- Scroll to the bottom of a finished run for **Artifacts**:
  - **`playwright-report`** — always uploaded, pass or fail. This is a
    self-contained HTML report: tap to download the zip, then (on
    iPadOS) tap it in Downloads/Files to unzip, and open `index.html`
    with **Open in Safari** or **Quick Look**. It lists every test, and
    for any failure shows the step that failed, the assertion message,
    and an embedded screenshot.
  - **`playwright-test-results`** — only uploaded when something failed.
    Contains the raw per-test trace (`trace.zip`) and video, if one was
    recorded. You don't need a local Playwright install to read a
    trace: go to **trace.playwright.dev** in any browser (works on
    iPad) and drop the `trace.zip` file onto the page — it replays the
    entire test, DOM snapshot by DOM snapshot, with network and console
    logs alongside.

### Required secrets / environment variables

**None are required for the E2E job to run.** It uses a disposable
Postgres service container created fresh by the workflow itself
(`postgresql://movewise:movewise_ci@localhost:5432/movewise_ci`) — never
the real Supabase database. The only non-default environment variable
set is `SIGNUP_RATE_LIMIT=200` (raising `apps/web/app/actions.ts`'s
signup rate limit for the CI job only, since the suite's own ~20 real
signups run from one shared runner IP and would otherwise collide with
production's own 20/hour default — see the comment above that line in
`ci.yml`). Production's real rate limit is untouched.

## Test data & Supabase safety

The suite never touches the real Supabase project. Every CI run gets its
own empty Postgres 16 container (`services.postgres` in `ci.yml`),
migrated fresh via `prisma migrate deploy`, and destroyed when the job
ends — so there's no seed data to keep in sync and no way for a bad test
run to accumulate cruft in a shared database. Within a run, tests that
need an account create one with a timestamped unique email
(`user+Date.now()@example.com`) via either the real `/signup` form or
`e2e/db-helper.mjs` (a small script that talks to Postgres directly
through `@movewise/db`, used to skip the signup-rate-limit budget for
tests that only need a signed-in session, not the signup flow itself —
see the comment at the top of that file). Nothing here can reach or
mutate a real learner's data.

## Adding new tests

- New spec files go in `apps/web/e2e/`, named `<area>.spec.ts`.
- Prefer real user-facing selectors (`getByRole`, `getByText`) over CSS
  classes; the board itself exposes `aria-label` per square
  (`"e4, white pawn"` etc.) and `data-square` — use those rather than
  coordinate math.
- Need a signed-in account without spending the signup-flow's own rate
  limit? Use `e2e/db-helper.mjs`'s `create-user` command, then log in via
  `/login` (see `remediation.spec.ts` for the pattern).
- Need to exercise touch/tablet behavior specifically (not just a resized
  viewport)? Open a real device context —
  `browser.newContext({ ...devices["iPad (gen 7)"] })` — and use
  `.tap()`, not `.click()` (see `tablet-touch-interactions.spec.ts` or
  `move-piece-alt-valid.spec.ts`).
- A test in the business-critical path (auth, a full lesson, a puzzle, a
  Play-mode game, XP/progression) should get `@smoke` appended to its
  title so it's included in `pnpm test:e2e:smoke` / the `smoke` manual
  workflow_dispatch option. Keep this subset small and fast — it exists
  to stay runnable in well under a minute.
- If a defect is found (by hand or by CI), the expected shape is: write a
  failing test that reproduces it, fix the underlying code, confirm the
  test now passes — not just fix the symptom and move on.

## Running it yourself (optional — not required from an iPad)

```bash
pnpm install
pnpm --filter @movewise/web test:e2e        # full suite
pnpm --filter @movewise/web test:e2e:smoke  # @smoke subset only
```

Needs a local Postgres reachable via `DATABASE_URL` (see
`apps/web/.env.example`) — `pnpm --filter @movewise/web test:e2e` starts
the dev server itself via `playwright.config.ts`'s `webServer`, so
`pnpm dev` doesn't need to be running separately first.
