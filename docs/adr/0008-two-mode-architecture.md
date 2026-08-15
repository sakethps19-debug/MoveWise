# ADR-0008: Learn & Play / Play & Learn as the core two-mode architecture

## Status
Accepted as the target architecture and design. **Not implemented** —
this ADR, `docs/concept-taxonomy.md`, and the updated `docs/prd.md` /
`docs/architecture.md` / `docs/learner-model.md` / `docs/roadmap.md` are
the specification; `docs/roadmap.md`'s Phase A/B/C is the build order.
Per the user's own explicit instruction accompanying this spec ("Do not
attempt to implement the entire personalised analysis system at once"),
no application code or database migration in this ADR has been applied
yet — that starts when Phase A work is explicitly kicked off.

## Context
The user supplied a detailed architecture brief restructuring MoveWise
around two complementary modes:

- **Learn & Play** — structured, curriculum-led: course → level → unit →
  principle → sub-lessons → exercises → concept-specific puzzles →
  mastery challenge → revision.
- **Play & Learn** — game-led, diagnostic: play or import a complete
  game, get move-by-move classification and explanation, get a
  personalised study plan that maps mistakes back to the same concept
  taxonomy Learn & Play teaches from.

Both must share one taxonomy, one learner model, and one recommendation
engine — the loop is *learn a concept → practise it → prove mastery →
apply it in a game → analyse performance → prescribe remedial lessons →
practise again*, not two disconnected features.

This is a substantially larger scope than anything built so far.
`docs/learner-model.md` (Phase 3, not built) already anticipated the
concept-taxonomy piece in miniature (`Concept`, `UserConceptMastery`,
`ExerciseAttempt`) — this ADR extends that plan rather than replacing
it, and folds in everything the new spec adds: the content hierarchy
above a single lesson, the game-analysis pipeline, move classification,
and the shared learner model combining both sources of evidence.

## Decision — information architecture

Today's content model is flat: `Unit → Lesson → Step[]`
(`packages/exercise-schema`), with `masteryTags: string[]` on each
lesson as an informal, unqueryable stand-in for a concept taxonomy. The
new hierarchy adds two layers and one new pooled content type, while
keeping as much of the existing, working infrastructure as possible
rather than a rewrite:

```
Course              (new — see "what doesn't need to exist yet" below)
  Level              (new — same caveat)
    Unit             (exists: packages/content/units/<unit-id>/)
      Principle      (new — groups sub-lessons + puzzles + a mastery
                       challenge under one taught idea, e.g. "Develop
                       your pieces")
        SubLesson    (= today's Lesson, unchanged shape — a focused,
                       single-idea, linear step sequence is already
                       exactly what a "sub-lesson" is; see the worked
                       example below)
        Puzzle[]      (new, pooled — concept-tagged, served adaptively
                       rather than fixed into one lesson's step order)
        MasteryChallenge (= a Lesson, distinguished by a new `kind`
                       field — "meet-the-pieces.12-unit-mastery-
                       challenge" already *is* one of these today, just
                       not formally typed as one)
```

**Worked example**, matching the brief's own: Unit `opening-principles`,
Principle `develop-your-pieces`, containing sub-lessons `what-is-
development`, `activate-knights-and-bishops`, `productive-vs-empty-
moves`, `avoid-repeated-piece-moves`, `avoid-premature-queen-
development`, `develop-with-tempo`, `complete-development`, `connect-
the-rooks`, `recognize-neglected-development` — each one today's
`Lesson` shape unchanged (a handful of `explain` steps plus 1-3
exercises), each tagged with the `development` concept plus a narrower
sub-concept (`tempo`, `queen-development-timing`, etc. — see
`docs/concept-taxonomy.md`). After the sub-lessons, a pool of
`development`-tagged puzzles (independent exercises, not fixed to one
sub-lesson), then a `Principle`-level mastery challenge.

**What doesn't need to exist as real rows yet**: `Course` and `Level`.
At today's content volume (3 units, 17 lessons, one implicit "course"),
both collapse to a single implicit value — adding real tables for them
now would be exactly the kind of premature abstraction this codebase's
own conventions warn against (see `docs/prd.md`'s "Non-goals" framing).
The schema below still reserves the columns (`Unit.levelId`,
nullable) so a later multi-course/multi-level catalog is additive, not
a migration that reshapes existing data — but Phase A does not create
`Course`/`Level` tables or backfill them.

## Decision — concept taxonomy

See `docs/concept-taxonomy.md` for the full design. Summary: `Concept`
formalizes what `masteryTags` already informally represents. **Correction
from this ADR's first draft**: `Concept` is a *content* registry
(`packages/content/concepts.ts` — like `Unit`/`Lesson`, not a database
table), not a Prisma model as originally written here — a `conceptId` is
just a string, the same way `LessonCompletion.lessonId` today is a
string referencing a JSON file's `id` with no `Lesson` database table
backing it at all. Only genuinely dynamic per-user *state* about a
concept (`UserConceptMastery`, `ExerciseAttempt`) belongs in Postgres;
the concept's own name/description/hierarchy is authored content, same
as everything else in `packages/content`. Every `SubLesson`, `Puzzle`,
`MasteryChallenge`, and — new — every instructive move from Play & Learn
analysis references one or more `conceptId` strings. This is the single
join point the whole two-mode loop depends on: a game mistake maps to a
`conceptId`, which is exactly what a `SubLesson`/`Puzzle` was authored
to teach.

## Decision — content-hierarchy schema (Zod, `packages/exercise-schema` — not a database model)

**Correction from this ADR's first draft**: `Unit`, `Principle`, and
`Puzzle` were originally written below as Prisma models. That's wrong,
for the same reason `Concept` above was wrong — this codebase's
established pattern (ADR-0002 onward) is content-as-data-files
validated by Zod, not database rows, and nothing about this ADR's own
reasoning (`SubLesson` = today's `Lesson`, unchanged) argued for
breaking that pattern one layer up. Corrected:

```ts
// packages/exercise-schema — additive to the existing LessonSchema
const PrincipleSchema = z.object({
  id: z.string().min(1),          // "<unit-id>.<principle-slug>"
  unitId: z.string().min(1),
  title: z.string().min(1),
  conceptId: z.string().min(1),   // the concept this principle primarily teaches
  order: z.number().int().min(0),
  subLessonIds: z.array(z.string().min(1)).min(1), // Lesson ids, existing LessonSchema unchanged
  puzzleIds: z.array(z.string().min(1)).default([]),
  masteryChallengeLessonId: z.string().min(1).optional(), // a Lesson with kind = "mastery-challenge"
});

// LessonSchema gains two additive, optional fields — every existing
// lesson JSON stays valid unchanged:
//   principleId?: string   (which Principle this sub-lesson belongs to)
//   kind?: "sub-lesson" | "mastery-challenge"   (default "sub-lesson")

const PuzzleSchema = z.object({
  id: z.string().min(1),
  conceptIds: z.array(z.string().min(1)).min(1),
  fen: z.string().min(1),
  prompt: z.string().min(1),      // same non-negotiable requirement ADR-0007 added to every board exercise
  correctMoves: z.array(z.string().min(1)).min(1),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  feedback: FeedbackMapSchema,
  sourceGameId: z.string().optional(), // set when generated from a Play & Learn game, absent for authored puzzles
});
```

`Course`/`Level` (the two layers above `Unit`) stay exactly what they
are today — nothing (a hardcoded `UNITS` array in `apps/web/app/
page.tsx`, one implicit course/level). Not modeled at all yet, content
or database, at today's volume — see "what doesn't need to exist yet"
above; this is unchanged from the first draft.

## Decision — proposed database model (additive; not migrated yet)

Building on the 4 tables that exist today (`User`, `Session`,
`LessonCompletion`, `RateLimitHit`) and the 3 `docs/learner-model.md`
already speculatively designed, corrected to drop the standalone
`Concept` table per the correction above (`UserConceptMastery`,
`ExerciseAttempt`, `RecurringMistakePattern` — `conceptId` on each is a
plain string, not a foreign key):

```prisma
// Play & Learn additions
model Game {
  id          String   @id @default(cuid())
  userId      String
  source      String   // "stockfish" | "training-bot" | "pgn-import" | "otb-manual" | "platform-import"
  pgn         String
  result      String
  playedAt    DateTime
  analysis    GameAnalysis?
}

model GameAnalysis {
  id        String   @id @default(cuid())
  gameId    String   @unique
  status    String   // "pending" | "running" | "complete" | "failed" — see async pipeline below
  summary   Json      // opening/middlegame/endgame assessment, strong-move %, recurring patterns
  moves     MoveAnalysis[]
}

model MoveAnalysis {
  id             String  @id @default(cuid())
  gameAnalysisId String
  ply            Int
  move           String
  evalBefore     Float
  evalAfter      Float
  classification String   // "brilliant" | "best" | "excellent" | "good" | "inaccuracy" | "mistake" | "blunder" | "forced"
  conceptIds     String[] // concepts this move is instructive about, if any
  bestAlternative String?
  explanation    String?  // populated only for instructive moments — see "prioritise instructive moments"
}

model StudyPlan {
  id        String   @id @default(cuid())
  userId    String
  gameId    String?             // null for a plan generated purely from Learn&Play weak-concept detection
  items     Json                // ordered list: {type: "lesson"|"puzzle-set"|"retry-position"|"mini-game", refId, conceptId}
  createdAt DateTime @default(now())
  startedAt DateTime?
}
```

`UserConceptMastery` (already proposed in `docs/learner-model.md`) gets
one addition: a `gameApplicationScore` alongside the existing exercise-
derived confidence — see "Decision — shared learner model" below and
the updated `docs/learner-model.md`.

## Decision — mastery states (per-concept, not per-lesson)

Supersedes `docs/learner-model.md`'s original 7-state list with the
9-state model the new spec asks for — a strict superset covering the
same ground with clearer beginner/struggling framing:

`not-started → learning → practising → ready-for-assessment →
proficient → mastered → revision-due`, with `struggling` and
`recovered` as side-states reachable from `learning`/`practising`
(see `docs/learner-model.md` for the full transition table and how each
transition is evidenced).

## Decision — move classification

A fixed 8-value enum (`brilliant | best | excellent | good | inaccuracy
| mistake | blunder | forced`), never raw centipawn-loss buckets alone
and never vague unlabeled tiers. `MoveAnalysis.classification` stores
this; centipawn loss is one input among several (forced sequences,
already-lost positions, opening theory, sacrifice detection, multiple
equivalent moves) — the classification function is a real decision
procedure to design and test in Phase B, not a lookup table.

## Decision — fair play

Non-negotiable, enforced at the pipeline level, not just a UI
convention: `GameAnalysis` may only begin running for a `Game` with
`source` implying a completed or human-exited game, or a
`stockfish`/`training-bot` source (where live coaching during play is
explicitly allowed). A human-vs-human game (not built yet — no such mode
exists) would need an explicit `analysisAllowedDuringPlay: boolean`
flag defaulting false, set only for a session both participants opted
into as non-competitive. This is a fixed invariant to test directly
(Phase B acceptance criteria), not something to trust to code review.

## Decision — analysis pipeline (async, cached)

Matches the request's 12-step pipeline. Two implementation
non-negotiables worth calling out now, before any of Phase B is built:
(1) analysis must run as background work with visible progress and
graceful resume after interruption — a multi-minute Stockfish pass on a
40-move game blocking a request is not acceptable, especially against
this environment's existing Stockfish-Worker infrastructure
(`packages/engine`, already async by construction); (2) `GameAnalysis`
is cached and keyed by `gameId` — re-viewing an already-analysed game
must never re-run the engine.

## Decision — phased build order

See `docs/roadmap.md`'s Phase A/B/C (rewritten to match this ADR). Not
repeated here beyond the one-line summary: **A** — fix the existing
lesson engine (done, ADR-0007) and build the principle → sub-lesson →
puzzle → mastery-challenge hierarchy with concept-level mastery and
controlled unlocking, on the existing 3 units before any new content is
authored. **B** — analyse completed Stockfish games only (no PGN import,
no platform import yet), classify every move, surface the 3 most
instructive moments, map to concepts, recommend lessons, allow retry.
**C** — combine both evidence sources, add spaced repetition and
game-derived puzzles, add safe PGN import.

## Consequences
- This is a genuinely large scope increase — 4 new *database* models
  (`Game`, `GameAnalysis`, `MoveAnalysis`, `StudyPlan`, on top of the 2
  `docs/learner-model.md` already planned: `UserConceptMastery`,
  `ExerciseAttempt`) and 3 new *content* schema types (`Principle`,
  `Puzzle`, plus the `Concept` registry). Nothing in Phase A requires
  the 4 Play & Learn database models; nothing needs `Course`/`Level` at
  all yet, content or database. Building incrementally, phase-by-phase,
  is deliberate — a single "add everything now" migration would create
  tables Phase A/B don't use yet and can't verify are shaped correctly
  until real Phase C work exercises them.
- `SubLesson` reusing today's `Lesson` shape (rather than a new content
  type) means ADR-0007's fixes (required prompts, hearts recovery, real
  stars) automatically apply to every sub-lesson without rework —
  intentional, not incidental.
- `Puzzle` as a new, lighter content type (not a single-step `Lesson`) is
  the one real new authoring surface Phase A needs — puzzles must be
  poolable and servable outside a fixed lesson sequence for both the
  "concept-specific puzzles" requirement and the future `Practice`
  aggregation (course puzzles + game-derived positions + weak-skill
  training + spaced repetition, all from one pool).
- The existing single beginner unit (`meet-the-pieces`, 12 lessons) is
  the natural pilot for restructuring into `Principle`s — its lessons
  already read as principle-shaped groupings (piece-by-piece), just not
  yet grouped, tagged with concept IDs, or given a puzzle pool. Phase A
  should restructure this one unit fully before touching the other two,
  per the request's own "complete one polished beginner unit" priority.
