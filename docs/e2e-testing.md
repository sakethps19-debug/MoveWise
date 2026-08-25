# End-to-end testing (Playwright + GitHub Actions)

Everything in this doc is doable from a browser — the GitHub web UI, the
Actions tab, a PR page. Nothing here requires a terminal or a local
checkout, which matters because this project is developed from an iPad.

## What's tested

`apps/web/e2e/` (26 spec files, 236 tests across 3 projects as of this
writing — 144 of those under the default desktop `chromium` project
alone; see "Named `iPad`/`Mobile` Playwright projects" below for the
rest) is a real, click-through end-to-end suite against a running
instance of the app — no mocked network, no mocked chess logic. It
covers:

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
- **Named `iPad`/`Mobile` Playwright projects** (`playwright.config.ts`),
  alongside the default `chromium` (desktop) project — deliberately
  scoped via `testMatch` to just `responsive.spec.ts` and
  `chessboard-geometry.spec.ts` rather than the whole suite, since those
  two are the ones actually built to be viewport/device-parametrized
  (each already loops over its own breakpoint matrix); running the other
  ~120 tests three times over too would 3x CI time for no real extra
  signal. Report output shows which project a test ran under, e.g.
  `[iPad] › responsive.spec.ts:24:7 › ...`. `browserName: "chromium"` is
  forced explicitly on both — the `iPad`/`iPhone` device presets default
  to WebKit (a real iPad only ever runs Safari), and neither this repo's
  CI nor local dev installs a WebKit binary.
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
- **Uncaught JS exceptions and real browser console errors** —
  `e2e/fixtures.ts` wraps `@playwright/test`'s own `test`; every spec
  imports from it instead of `@playwright/test` directly, and an
  auto-fixture attaches a `console`/`pageerror` listener to every test's
  page, failing the test (with the offending message in the assertion
  text) if anything unexpected fires. The handful of specs that open
  their own device context (`move-piece-alt-valid.spec.ts`,
  `tablet-touch-interactions.spec.ts`) call the same exported
  `watchForConsoleErrors(page)` helper manually, since the auto-fixture
  only instruments the default `page` fixture. This is a real check, not
  a formality — a forced `console.error()` reliably fails the test it
  occurs in (verified by hand before this was trusted); a swallowed
  exception that still leaves the right DOM/text behind (previously
  invisible to every assertion in this suite) now fails loudly instead.
  A pattern proven benign (verified against a real run, not guessed) can
  be added to `IGNORED_CONSOLE_PATTERNS`/`IGNORED_PAGEERROR_PATTERNS` in
  that file — kept short and specific on purpose, so a genuinely new
  error still fails.
- **Accessibility** — automated `axe-core` checks (WCAG 2.0/2.1 A/AA)
  against the home page (guest and signed-in), auth pages, a lesson
  mid-flow, lesson completion, Play mode, and account settings
  (`accessibility.spec.ts`).
- **Account management** — data export and account deletion, including
  that dismissing the delete-confirmation dialog leaves the account
  intact (`account.spec.ts`).
- **Network-failure resilience** (`network-resilience.spec.ts`) — a real
  dropped connection (`page.route(...).abort()`, not a mock) during
  lesson completion, puzzle solving, and completed-game saving. Added
  after a manual audit found all three fired their persistence call
  without awaiting or catching it: lesson completion showed a false
  "Lesson complete!" success screen with nothing actually saved; a
  failed puzzle attempt was silently dropped with no indication at all;
  a failed game save left "Analyze this game" permanently, silently
  disabled. All three now show a real, visible, and — where blocking the
  user's next step — retryable error instead. Each of the three specs
  was verified to genuinely fail against the pre-fix code (not just pass
  trivially) before being trusted.

See `docs/testing-strategy.md` for the fuller narrative (unit tests,
content validation, and how this suite fits alongside them) and
`docs/known-risks.md` for defects this suite has caught historically.

**A `@smoke`-tagged subset** (6 tests: home loads, full auth round-trip,
a complete lesson flow with a real chess move, XP/star progression, a
solved puzzle, and a Play-mode game against the engine) covers the
business-critical path in well under a minute — see "Running only the
smoke suite" below.

### What isn't covered, and why

- **Vercel Preview Deployments are not used as the test target — confirmed
  unsafe to do, not just unconfirmed.** `docs/deployment.md` now documents
  this definitively: Preview and Production share the exact same
  Supabase database (one Supabase project, zero database branches, both
  Preview's and Production's own build logs show the identical Postgres
  host and database name — see that doc's step 3 for the full evidence).
  This suite's specs create real accounts on every run
  (`uniqueEmail()`-style signups); pointing Playwright at a Preview URL
  would write real test-account rows into production on every PR run —
  the opposite of Step 9's "don't damage real user data" requirement. The
  suite instead runs against a real `next dev` server started fresh
  inside the CI job itself, backed by a throwaway Postgres container —
  the same app code and real network requests, just not the deployed
  Vercel instance. This is the "most dependable alternative" the testing
  brief for this project asked for when Preview-URL testing isn't
  practical. Revisit once Preview has its own database (see
  `docs/deployment.md`'s recommended fix) — until then, this isn't a gap
  to close, it's a guard that should stay up.
- **Load/performance testing** — a lightweight, safe subset now exists:
  see "Performance checks" below. Full load testing (sustained concurrent
  traffic) is still not built.
- **Drag-and-drop chessboard interaction** — not applicable: the board
  only implements click/tap-to-select-then-move (`Board.tsx`'s
  `onSquareClick`), no drag handlers exist anywhere in the app. Every
  touch test in this suite uses `.tap()` accordingly.

## Performance checks

Two layers, both deliberately scoped as *smoke* checks — "hasn't
regressed by an order of magnitude" — not real performance tuning or
capacity planning:

- **`e2e/performance.spec.ts`** (`@perf` tag, part of the main Playwright
  suite) — real Navigation Timing API measurements for the home page, a
  lesson, Play mode, and a puzzle, against `pnpm dev` (the same server
  the rest of the suite runs against). Each route is navigated to twice
  — once to force `next dev`'s on-demand per-route compile, once to
  measure — so the number reflects render/hydration cost, not one-time
  dev-server compilation. Budgets are generous (8s) since dev-mode
  timing is not representative of production; this exists to catch a
  route that's become catastrophically slow, not to characterize real
  latency. Run just this subset with
  `pnpm --filter @movewise/web test:e2e:perf`.
- **`scripts/perf-smoke.mjs`** (`autocannon`) — a short burst of modest
  concurrent traffic (10 connections, 8s) against a handful of
  guest-reachable routes on a **real production build** (`next start`,
  not `next dev` — dev mode's on-demand compilation makes concurrent-
  throughput numbers meaningless). Asserts zero failed/non-2xx requests
  and a generous p99 latency budget (2s) per route. Runs as its own CI
  job (`perf` in `ci.yml`): build, start the production server, wait for
  it to answer, run the script, print the server log either way. Run it
  yourself against any already-running server with
  `pnpm --filter @movewise/web test:perf:smoke [baseUrl]`.

Neither layer is real load testing — no sustained high-concurrency run,
no capacity/breaking-point search. That's a genuine, larger gap this
project doesn't have production traffic history to size against yet.

## How CI runs

`.github/workflows/ci.yml` has three jobs:

1. **`verify`** — install, typecheck, lint, unit tests (Vitest, 159
   tests across all 6 packages), content validation, and a real
   production build (`next build`).
2. **`e2e`** — installs a fresh Chromium, starts the app for real
   (`pnpm dev`, against a throwaway Postgres service container scoped to
   that one job run), and runs the Playwright suite above (including the
   `@perf` dev-mode timing checks).
3. **`perf`** — a real production build (`next start`) against its own
   throwaway Postgres, then `scripts/perf-smoke.mjs`. Skipped on a manual
   `smoke`-suite dispatch run (see below) to keep that path fast; runs on
   every push/PR and on a `full` dispatch run.

All three run automatically on:
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
- Import `test`/`expect` from `./fixtures`, not `@playwright/test`
  directly — that's what wires up the automatic console/runtime-error
  guard described above. If the test opens its own
  `browser.newContext()` rather than using the default `page` fixture,
  also call `watchForConsoleErrors(page)` (also exported from
  `./fixtures`) on that page manually — see
  `tablet-touch-interactions.spec.ts` for the pattern.
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
