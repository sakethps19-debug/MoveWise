# MoveWise

Phase 1 scaffolding, generated from the Phase 0 audit of the original
prototype. See `docs/adr/0001-discard-vinext-hosting-harness.md` for the
hosting-platform decision, and `docs/movewise-phase0-plan.md` (from the
planning conversation) for the full architecture rationale.

## What's here

- `apps/web` — the actual Next.js app: a home page listing the "Meet
  the Pieces" unit, and a lesson page/runner that plays through any
  of the 12 lessons end to end (board rendering, move validation via
  `chess-rules`, hints, XP, misconception feedback). Covers exactly
  the step types the 12 lessons use (explain, select-square,
  move-piece, capture, find-legal-move, mcq, true-false, review) —
  order-steps/find-check/guided-sequence/mini-game exist in the
  schema but aren't rendered yet, noted in `LessonRunner.tsx`.
- `packages/chess-rules` — typed chess.js wrapper, ported from the
  prototype's working move-legality/game-status logic, with unit tests
  the prototype never had.
- `packages/engine` — Stockfish Worker/UCI wrapper, ported from the
  prototype's working analysis job-queue pattern, behind a typed
  `evaluate`/`bestMove` interface. UCI line-parsing is pure and unit
  tested independent of a real Worker. Not yet wired into `apps/web`
  (no Play mode UI exists yet — Learn mode doesn't need the engine).
- `packages/exercise-schema` — Zod schema for lesson/exercise content,
  plus a chess-legality validator (`validate-chess.ts`) that checks every
  FEN and expected move in every lesson is actually legal.
- `packages/content/units/meet-the-pieces` — **all 12 lessons authored**,
  matching the original unit outline (Welcome through Unit Mastery
  Challenge). Positions are deliberately minimal (usually one or two
  pieces on an otherwise empty board) specifically so their legality
  is easy to hand-verify by eye — but this has NOT been run through
  the actual validator yet (see limitation below).
- `scripts/validate-content.ts` — CI entry point: parses every lesson
  JSON and fails the build on any structural or chess-legality issue.
  Written but not yet executed against the 12 lessons above.
- `docs/founding-ambition-architecture-notes.md` — maps the "world's
  leading chess platform" requirements (adaptive learning, misconception
  taxonomy, transfer measurement, learner model, i18n, etc.) to concrete
  architectural consequences, so they're designed for now, not retrofitted.

## What's intentionally not here yet

- Board piece art (currently Unicode glyphs, not SVG/image pieces —
  a deliberate simplification to stay dependency-free for this slice).
- Arrow-line hint rendering (hint level 3 currently highlights the
  from/to squares instead of drawing an arrow — visual polish, not a
  logic gap).
- `packages/db` (Prisma schema) and any auth wiring — no persistence
  yet; lesson progress isn't saved anywhere, including localStorage.
- Play mode, Practice mode, Progress/Profile tabs, gamification
  (XP/hearts/streaks) beyond an in-memory per-lesson XP counter.
- The adaptive-learning / learner-model / misconception-analytics
  systems described in the founding-ambition doc — those are Phase 3+
  concerns and are noted as design requirements, not yet implemented.

## Important: this was scaffolded without package-manager access

This code was generated in a sandboxed environment with no network
access (confirmed by a 403 from both npm and pip registries), so
**`pnpm install` has not been run and nothing here has been executed**
— no `tsc`, no `vitest`, no `validate:content`. The TypeScript is
hand-verified for correctness against the chess.js/Zod/Stockfish UCI
APIs as documented, and the 12 lesson positions are deliberately
simple enough to check by eye, but none of it has been machine-
verified. Run the following in a real environment before trusting it
as "working," not just "written":

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm validate:content
pnpm --filter @movewise/web dev   # then open /learn/meet-the-pieces.01-welcome
```

If any of those surface issues, treat this as a first draft to fix
forward from, not a verified deliverable.
