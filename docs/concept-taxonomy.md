# Concept taxonomy — specification

**Status: not built.** Design for ADR-0008's two-mode architecture,
extending the `Concept` entity `docs/learner-model.md` already
speculatively proposed (Phase 3) rather than replacing it. Nothing in
this document is implemented.

## Why a formal taxonomy, not just tags

Every lesson already carries `masteryTags: string[]` (e.g. `["rook-
movement"]`, `["board-orientation", "square-identification"]`) —
free-text strings, unqueryable, no hierarchy, no relationship to
anything outside `packages/exercise-schema`. That's fine for what it's
used for today (nothing — `masteryTags` is required by the schema but
not yet read anywhere at runtime). The two-mode architecture needs a
concept a **move analysis** can reference, a **recommendation** can
target, and a **learner's mastery state** can be tracked per — none of
which a free-text tag on a lesson supports.

## Concept shape

`Concept` is a **content registry** (`packages/content/concepts.ts`),
not a database table — corrected from this document's and ADR-0008's
first drafts, which modeled it as a Prisma model. That broke this
codebase's own established pattern: content (units, lessons, and now
concepts) is authored data validated by a schema, not database rows;
only per-user, per-concept *state* (`UserConceptMastery`,
`ExerciseAttempt`) is dynamic enough to need a real table. A `conceptId`
referenced from the database is a plain string key, the same way
`LessonCompletion.lessonId` today references a JSON file's `id` with no
`Lesson` table backing it.

```ts
// packages/exercise-schema — a Zod schema, validated the same way LessonSchema is
export const ConceptSchema = z.object({
  id: z.string().min(1),          // stable slug, e.g. "knight-fork", "development-tempo"
  name: z.string().min(1),        // "Knight forks", "Developing with tempo"
  description: z.string().min(1),
  parentId: z.string().optional(), // e.g. "development-tempo".parentId = "development"
  unitId: z.string().optional(),   // the unit this concept is primarily introduced in, if any
});
```

Two-level hierarchy is enough to start: a handful of broad concepts
(`piece-movement`, `check-and-checkmate`, `development`, `king-safety`,
`tactics`, `endgames` — roughly the brief's unit list) each with several
narrower child concepts (`development` → `knight-development`,
`bishop-development`, `queen-development-timing`, `tempo`, `rook-
connection`). This mirrors exactly the brief's own worked example
(Principle "Develop your pieces" → 9 sub-lesson topics) — each
sub-lesson topic becomes one child concept, not a separate taxonomy
layer of its own.

**Migrating today's `masteryTags` is the concrete first step**, not a
side effect: every existing tag across the 17 lesson files
(`board-orientation`, `rook-movement`, `bishop-movement`, `blocked-
paths`, `queen-movement`, `king-movement`, `knight-movement`, `pawn-
movement`, `captures`, `piece-values`, `check`, `checkmate`, `decision-
making`, `tactics`, `fork`, `knight`, `preview`) becomes a `Concept` row
— a data migration script, not hand-authored from scratch, since the
raw material already exists and is already correctly scoped (each tag
already names one coherent idea, per the content-authoring guide's
existing convention).

## Who references a concept ID

| Referencing thing | Field | Cardinality |
|---|---|---|
| `SubLesson` (today's `Lesson`) | `conceptIds` | one or more — replaces `masteryTags` |
| `Puzzle` | `conceptIds` | usually one |
| `Principle` | `conceptId` | exactly one — the concept it's built around |
| `MoveAnalysis` (Play & Learn) | `conceptIds` | zero or more — most moves aren't instructive about any specific concept |
| `StudyPlan` item | `conceptId` | exactly one |
| `UserConceptMastery` | `conceptId` | the row's own key, paired with `userId` |
| `RecurringMistakePattern` | `conceptId` | the row's own key |

This is the single join point the whole two-mode loop depends on:
Play & Learn's move classifier tags a blunder with `conceptId =
"hanging-pieces"`; the recommendation engine looks up `SubLesson`s and
`Puzzle`s tagged with that same `conceptId`; `UserConceptMastery` for
that `(userId, "hanging-pieces")` pair is what both modes read and
write.

## Mapping table (from the brief, kept as the working reference)

| Game behaviour | `conceptId` | Recommended content |
|---|---|---|
| Premature queen development | `queen-development-timing` | Opening principles: develop minor pieces first |
| King left in the centre | `king-safety-castling` | King safety and castling |
| Repeatedly missed forks | `knight-fork` | Knight forks |
| Hanging pieces | `hanging-pieces` | Attacked and defended pieces |
| Unnecessary exchanges | `trade-evaluation` | Evaluating trades |
| Weak back rank | `back-rank-safety` | Back-rank safety |
| Failed pawn ending | `opposition-key-squares` | Opposition and key squares |
| Time trouble | `candidate-move-routine` | Candidate moves and decision routine |

Each row here is a concrete `Concept` id to seed once Phase A's schema
migration runs — not aspirational, this is the literal seed data.

## Recommendation ranking (which concepts to prescribe)

Per concept, per learner, the recommendation engine needs to
distinguish (this is `UserConceptMastery` + `RecurringMistakePattern`
territory, see `docs/learner-model.md`):

- **One-time oversight** — a single `ExerciseAttempt`/`MoveAnalysis`
  miss with no pattern; do not prescribe anything.
- **Repeated misconception** — the same `wrongAnswerKey` or
  `conceptId` recurring across multiple attempts/games recently;
  highest-priority prescription.
- **Forgotten concept** — was `mastered`, now `revision-due` or
  `struggling` after a gap; prescribe a revision session, not a full
  lesson replay.
- **Concept never studied** — no `UserConceptMastery` row at all;
  prescribe the `SubLesson`(s), not a puzzle (nothing to practise yet).
- **Learned but not transferred** — `UserConceptMastery.status` is
  `proficient`/`mastered` from exercises, but recent `MoveAnalysis`
  rows tagged with the same concept show repeated real-game errors;
  this is the single most valuable signal the whole architecture exists
  to surface (see `docs/learner-model.md`'s "transfer" framing) —
  prescribe a guided mini-game or a game-position retry, not a lesson
  the learner has already demonstrably completed.
- **Calculation error vs. time-management error** — distinguished by
  whether `MoveAnalysis` shows the better move was found on a later
  ply in similar positions (calculation) vs. a pattern of moves late in
  a time-pressured phase (time management, only available when clock
  data exists) — the narrower of the two content types (candidate-move
  routine vs. a pure tactics puzzle) gets prescribed accordingly.

**Prioritise the smallest high-impact set** — explicitly not "prescribe
a lesson after every minor inaccuracy." A `StudyPlan` should cap at
roughly 3-4 items (matching the brief's own worked example: one lesson
review, one puzzle set, one position retry, one mini-game), ranked by
recency + repetition count + concept never-studied status, not by raw
mistake count.

## What's explicitly out of scope for this taxonomy design

Calculation/board-vision measurement as its own concept dimension
(distinct from "did they play the right move"), and opening-repertoire-
specific concepts (a named opening line is not the same kind of thing
as "knight forks") — both flagged in `docs/learner-model.md` already as
needing Play-mode game data this codebase doesn't persist yet. Design
those once Phase B's `Game`/`MoveAnalysis` tables have real data to
validate against, not speculatively now.
