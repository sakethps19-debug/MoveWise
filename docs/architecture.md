# Architecture

## Overview

pnpm workspace, TypeScript throughout. Six packages, one app:

```
apps/web             Next.js 15 App Router — the only deployable unit
packages/chess-rules  chess.js wrapper — the only module allowed to import chess.js
packages/engine        Stockfish Worker/UCI wrapper
packages/exercise-schema  Zod content schema + chess-legality validator
packages/db            Prisma 7 + Postgres (Supabase) via @prisma/adapter-pg
packages/content        lesson JSON, organized by unit
```

This mirrors the brief's Section 11 separation requirement (content /
rendering / exercise validation / chess rules / engine / persistence kept
apart) — it's a consequence of how the packages were built one at a time
across this project's history, not a deliberate up-front design exercise,
but it satisfies the requirement regardless.

## Information architecture (ADR-0008 — built for all three curated units)

ADR-0008 specifies `Course → Level → Unit → Principle → SubLesson`, plus
a pooled `Puzzle` content type and a `Concept` taxonomy every teaching
and diagnostic surface references (`docs/concept-taxonomy.md`). Built:
`Concept` (`packages/content/concepts.json`) and `Principle`
(`packages/content/principles/{unitId}.json`) for all three curated
units — `meet-the-pieces` (7 principles), `check-and-checkmate` (3),
and `basic-tactics` (1) — each real unit fully restructured, matching
Phase A's stated priority to finish one unit before generalizing, then
applied to the rest once that pattern proved out. The non-curated
`step-type-preview` unit deliberately stays flat (no principle file; a
lesson without a `principleId` is simply ungrouped, both shapes are
content-valid). `Puzzle` isn't built at all yet — no puzzle content
exists, so every principle's `puzzleIds` is empty. `Course`/`Level`
remain unmodeled, content or database, at today's volume — see
ADR-0008's own reasoning. The key continuity point: `SubLesson` **is**
today's `Lesson` shape, unchanged — the existing
`packages/exercise-schema` schema, all 8 exercise-step-type renderers,
and everything ADR-0007 fixed (required prompts, hearts recovery, real
stars) carry forward without rework. See ADR-0008 for the full proposed
schema and why `Course`/`Level` don't need real tables yet at today's
content volume.

## Data flow: a lesson

1. `apps/web/lib/lessons.ts` reads and Zod-parses a lesson JSON file into a
   `Lesson` (Server Component, runs at request time — content isn't
   pre-compiled or cached beyond Next's own page caching).
2. `LessonRunner` (client component) receives it, owns step navigation and
   shared state (XP, mistakes, hearts), and renders one of 8 exercise
   components from `apps/web/components/exercises/` based on `step.type`,
   keyed by `step.id` so each new step gets a fresh mount instead of manual
   reset logic.
3. Each exercise component calls chess-rules functions directly (`tryMove`,
   `moveMatches`, `legalTargetsFrom`, etc.) to validate attempts — no
   server round-trip for move legality, it's synchronous client-side chess
   logic reused unchanged from `packages/chess-rules`.
4. On lesson completion, `onComplete` — a Server Action
   (`completeLessonAction`) bound with the lesson ID via `.bind(null,
   lesson.id)` in the page component — persists XP and mistake count to
   the DB if the learner is signed in. Guests (`isGuest`, from
   `getSession()` in the page component) instead call
   `recordGuestCompletion` (`lib/guestProgress.ts`), which writes to
   `localStorage` — best-effort, silently no-op if storage is unavailable.
   `LearningPath` reads that back for a guest's home-page view (locking,
   stars), and on signup/login the browser's guest progress is sent as a
   hidden form field and folded into the account server-side
   (`migrateGuestProgress` in `app/actions.ts`), using the same
   best-mistakes merge as a repeat signed-in completion.

## Data flow: Play mode / mini-game steps

`packages/engine`'s `createEngine()` spins up one Stockfish Web Worker per
mount (`apps/web/lib/useStockfishEngine.ts`, shared between `PlayRunner`
and `MiniGameStep` so there's one Worker-lifecycle implementation, not two).
The Stockfish build itself (`stockfish-18-lite-single.js/.wasm`, GPLv3) is
staged from the `stockfish` npm package into `apps/web/public/engine/` by
`scripts/copy-engine-assets.mjs`, run via `predev`/`prebuild` — not
committed to git, since it's fully reproducible from the pinned dependency
(see `docs/content-licensing-register.md` for the GPL implications).

## Auth and persistence

See ADR-0003 for the reasoning. Mechanically: `apps/web/lib/auth.ts` owns
password hashing (bcryptjs) and session management (random-token cookie,
looked up against a `Session` table). `packages/db` wraps a Prisma
`PrismaClient` constructed with a `@prisma/adapter-pg` driver adapter
against a real Postgres database, hosted on Supabase (ADR-0005 — this
replaced an initial SQLite-via-libsql setup, ADR-0002, which explains why
not `better-sqlite3` and why not the schema-embedded `datasource.url`
most Prisma docs describe — Prisma 7 changed both, independent of which
database is behind it). Schema changes go through real tracked migrations
(`prisma/migrations/`, applied via `prisma migrate deploy` in
`predev`/`prebuild` — see ADR-0005), not `prisma db push`.

Six models today: `User`, `Session`, `LessonCompletion` (with
`hintsUsed` as of ADR-0007), `RateLimitHit` (one row per login/signup
attempt, backing `apps/web/lib/rate-limit.ts` — see `docs/known-risks.md`
for why an earlier in-memory version wasn't good enough once a
serverless deploy target was concrete rather than theoretical), and —
new, ADR-0008 Phase A — `UserConceptMastery` and `ExerciseAttempt`
(`conceptId` is a plain string, not a foreign key — see
`docs/concept-taxonomy.md`'s correction note on why `Concept` is
content, not a database model). The rest of ADR-0008's proposed schema
(`Game`, `GameAnalysis`, `MoveAnalysis`, `StudyPlan` — Phase B/C) doesn't
exist yet, phased in (`docs/roadmap.md`) rather than one migration —
still additive to this schema, not a redesign, since nothing built so
far assumes a fixed shape beyond these four tables.

`/account` (`app/account/page.tsx`) gives a signed-in user data export and
account deletion. Export is a Route Handler (`app/account/export/route.ts`)
rather than a Server Action, since it needs to return a real file download
with response headers, not a form-state object — it serializes the
account's email, creation date, and every `LessonCompletion` row as JSON.
Deletion (`deleteAccountAction`) re-verifies the password server-side (a
client-side `window.confirm()` is a second, independent guard against an
accidental click, not the security boundary) and does a single
`prisma.user.delete`, which cascades to `Session` and `LessonCompletion`
via `onDelete: Cascade` on both relations — nothing orphaned, no manual
cleanup needed.

## Content validation

Two layers, both automated, both run in every verification pass (there's no
CI yet to enforce this — see `docs/known-risks.md` — but `pnpm
validate:content` runs it on demand):

1. **Structural** — `LessonSchema` (Zod, `packages/exercise-schema`)
   validates every lesson JSON against the 13 exercise-step-type
   discriminated union.
2. **Chess-legality** — `validate-chess.ts` goes further than shape: every
   FEN is checked for legality via `chess-rules.isLegalFen`; every
   expected/alternate move is checked as actually legal from that FEN;
   `find-check`/`find-checkmate` steps have their `correctSquares`
   verified against every square a real check/mate-delivering move
   actually lands on (computed, not hand-picked); `order-steps`'
   `correctOrder` is checked to be a genuine permutation;
   `guided-sequence` is simulated move-by-move with forced replies
   interleaved, so a later move is validated against the position it
   actually occurs in, not a naively-flattened move list.

This is what the brief's Section 19 "every exercise must be automatically
validated for" list asks for, largely satisfied — see `docs/testing-strategy.md`
for exactly which of that list's 10 criteria are and aren't covered.

## Deployment

Live on Vercel (`movewise-app.vercel.app`), backed by the real Postgres
database (Supabase — ADR-0005), via the Session pooler connection —
see `docs/deployment.md` for the one-time setup and the three real
issues the first deploy attempts found and fixed (pooler mode, a
Prisma migration-baseline issue, and a webpack-bundling bug — the last
one covered in full in ADR-0006). CI still runs everything above
against a throwaway `postgres:16` service container, separate from the
real Supabase project.
