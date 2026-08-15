# MoveWise

A chess-learning platform. Central promise: "Learn how to think during a
chess game." See `docs/prd.md` for the product brief and `docs/roadmap.md`
for what phase this is at.

## What's here

A pnpm-workspace TypeScript monorepo:

- **`apps/web`** — Next.js 15 (App Router) app. Home page (a status-aware
  learning path: locked/available/completed lessons with mastery stars),
  lesson runner covering all 13 exercise-step types the schema defines,
  Play mode (freeform games against an embedded Stockfish), and
  email/password accounts with progress that persists, and an `/account`
  page for data export and account deletion. Guests get the same
  locking/stars via `localStorage`, migrated into an account on signup or
  login.
- **`packages/chess-rules`** — the only module allowed to import `chess.js`
  directly; everything else goes through its typed interface.
- **`packages/engine`** — typed UCI wrapper around a Stockfish Worker.
- **`packages/exercise-schema`** — Zod schema for lesson/exercise content,
  plus `validate-chess.ts`, a second-layer validator that checks *chess
  legality* (not just JSON shape): every FEN, expected move, hint arrow,
  and check/checkmate-delivering square in every lesson is verified
  programmatically, not hand-checked.
- **`packages/db`** — Prisma 7 (SQLite locally, via `@prisma/adapter-libsql`)
  — `User`, `Session`, `LessonCompletion`.
- **`packages/content`** — lesson JSON, two units so far: "Meet the Pieces"
  (12 lessons) and "Check and Checkmate Basics" (3 lessons). All 13
  exercise-step types the schema defines now have real curated content in
  these two units. A `step-type-preview` unit also exists (not linked
  from the UI) — a working demo of the five types added last
  (`find-check`, `find-checkmate`, `order-steps`, `guided-sequence`,
  `mini-game`), superseded as curated content once Check and Checkmate
  Basics was written, but kept as an E2E test fixture
  (`e2e/exercise-types.spec.ts`).

## Running it

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm validate:content
pnpm --filter @movewise/web dev   # predev auto-generates the Prisma client,
                                   # pushes the SQLite schema, and stages the
                                   # Stockfish engine asset — no manual setup
open http://localhost:3000

pnpm --filter @movewise/web test:e2e   # 23 Playwright tests (incl. automated accessibility checks); auto-starts the dev server
```

Copy `apps/web/.env.example` to `apps/web/.env.local` and
`packages/db/.env.example` to `packages/db/.env` first (both just need a
local SQLite path — no external services required for dev).

## Docs

- `docs/prd.md` — product requirements
- `docs/architecture.md` — technical architecture, as built
- `docs/learner-model.md` — specification for the not-yet-built adaptive
  learning / misconception-tracking system
- `docs/content-authoring-guide.md` — how to write a new lesson
- `docs/testing-strategy.md` — the verification approach used throughout
- `docs/security-checklist.md` — status against the brief's security bar
- `docs/content-licensing-register.md` — every third-party asset and its license
- `docs/known-risks.md` — open risks, not yet mitigated
- `docs/roadmap.md` — phase-by-phase status
- `docs/adr/` — architecture decision records

## What's intentionally not here yet

No PostgreSQL (SQLite for now — see ADR-0002), no admin/authoring portal, no
i18n, no PWA/offline support, no analytics, no real COPPA compliance (a
conservative age-gate blocks under-13 signup outright instead — see
`docs/security-checklist.md`). All six are live decisions pending
product-owner input; see `docs/roadmap.md` for the full list.

CI (`.github/workflows/ci.yml`) runs install/typecheck/test/validate-content/
build, plus the full E2E suite in a second job, on every push and PR.
