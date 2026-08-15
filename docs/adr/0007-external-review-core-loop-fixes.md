# ADR-0007: Core-loop fixes from an external product review

## Status
Accepted. The user commissioned an external (ChatGPT) review of the
deployed app and forwarded its findings as an 18-section list of
"verified product-review findings." Per this project's own standing
practice (see ADR-0002/0005/0006's empirical, verify-before-trusting
approach), each claim was reproduced against the real code before being
treated as ground truth — the review itself was a claim to check, not an
instruction to execute blindly. This ADR covers the subset confirmed
real and fixed in this pass: the reusable learning-engine defects (review
items 1, 2, 3, 5, 6). Curriculum depth (item 4), XP integrity (item 7),
exit/resume (item 8), guided coaching in Practice mode (item 9), learning
path visual hierarchy (item 10), teaching-language audit (item 11 beyond
the one instance fixed here), and the legal/child-safety review (item
13) are still open — deliberately not started, per both the review's own
stated order and this project's existing practice of not expanding scope
past what's verified necessary (see ADR-0005 Consequences on real deploys
surfacing real gaps).

## Decision

**1. Missing interactive-exercise prompts (confirmed, critical).**
`packages/exercise-schema/src/index.ts`'s board-interaction step types
(`select-square`, `move-piece`, `capture`, `find-legal-move`,
`find-check`/`find-checkmate`, `guided-sequence`) had no `prompt` field
at all — only `mcq`/`true-false` did. `MoveStep.tsx` rendered zero
instruction text for its three step types; `ClickSquareStep.tsx` rendered
a hardcoded generic sentence for find-check/find-checkmate only, nothing
for select-square. Root cause: never added when those step types were
first built, and nothing forced a re-check since every automated test
interacts with the board directly rather than reading the prompt.
Fixed: `prompt: z.string().min(1)` added to all six step schemas (a
schema-validation failure now blocks the build/`validate:content` if any
interactive step lacks one — no separate "publish gate" needed since
`parseLesson` already throws). All 25 affected steps across all 17
lesson files got a real, content-aware prompt (not placeholder text) —
every lesson in the repo had at least one. `Board.tsx` gained a
`describedBy` prop wired to each prompt's `id`, so the board carries a
real `aria-describedby` relationship to its instruction, not just a
static "Chessboard" label. Verified: 21 new schema tests
(`packages/exercise-schema/src/index.test.ts`) covering reject-missing/
reject-empty/accept-real-prompt for every affected type, plus
`validate:content` passing clean across all 17 lessons.

**2. Stale hints after a correct answer (confirmed).**
`activeHint` (and the highlight/arrow/text it drives) was computed from
`hintLevel` alone, with no `status` check — a hint revealed before the
correct answer stayed visible, contradicting the "Correct!" banner right
below it. Fixed by gating `activeHint` on `status !== "correct"` in both
`ClickSquareStep.tsx` and `MoveStep.tsx`. This wasn't the deeper "formal
exercise state machine" (Awaiting/Incorrect/HintDisplayed/.../Recovery)
the review sketched — the existing `"active" | "correct" | "incorrect"`
status plus the new recovery flag (below) already cover every real
transition this app has; a bigger enum wasn't adding a fix, just
renaming. Verified: new E2E test in `retry-and-hearts.spec.ts`.

**3. Stars ignored hint usage entirely (confirmed).**
`starsForMistakes` (ADR-0004) only ever looked at `mistakes` — a
zero-mistake run that used hints, even the solution-reveal level, still
showed 3 stars. `hintsUsed` wasn't tracked anywhere. Fixed: `LessonRunner`
now counts hint reveals (a new `onHintUsed` handler threaded through
`ExerciseHandlers`), `LessonCompletion` gained a `hintsUsed` column
(migration `20260815114917_add_hints_used_to_lesson_completion`, same
"best-run, never downgrade" merge semantics as `mistakes`), and
`starsForPerformance(mistakes, hintsUsed)` (renamed from
`starsForMistakes`, ADR-0004 superseded on this point) requires zero of
both for 3 stars. The completion screen now also shows a one-line
`starsExplanation()` of why that count was earned, per the review's
explicit ask. Guest progress (`localStorage`) and the guest→account
migration path (`migrateGuestProgress`) both carry `hintsUsed` through,
with an old-data fallback (missing `hintsUsed` in a pre-existing
localStorage blob defaults to 0 rather than dropping the whole entry).
Verified: new E2E test asserting a zero-mistake, one-hint run gets 2
stars, not 3.

**4. Locked lessons reachable by direct URL (confirmed).** The learning
path UI hid/disabled locked lessons, but `/learn/[lessonId]` never
checked prerequisites itself — any lesson id loaded regardless. Per the
user's explicit choice (Option A, enforced sequencing, over Option B
preview-mode): the lesson route now checks the signed-in user's real
completions server-side and redirects to `/?locked=<title>&needs=<title>`
with an explanatory banner if a prerequisite is missing. Scoped to
authenticated users only, matching the review's own wording ("enforce
credited completion on the server for authenticated users") — guests
have no server session to check against, and keep the existing
client-side localStorage-based lock, which was already real (not merely
cosmetic) for that case. Verified: new E2E test driving a fresh account
straight to a locked lesson's URL and asserting the redirect + banner.

**5. Zero hearts had no recovery, just an unbounded floor (confirmed
gap, not a bug — ADR-0004's "floor at zero, never lock out" was
deliberate but incomplete against the review's fuller spec).** Per the
user's explicit choice of the recommended MVP behavior: reaching zero
hearts (the 5th wrong answer within a lesson) now triggers a guided
recovery interstitial instead of a 6th ordinary retry — a reteach pulled
from the most recent `explain` step already in the lesson's own content
(no new content type authored per-lesson; this is a deliberate scope
cut, noted honestly rather than overclaiming a dedicated "recovery
exercise" author workflow), then a "Try again" button that restores
hearts to `RECOVERY_HEARTS = 3` (partial, not a full reset — still a
consequence-bearing signal) and returns to the *same* exercise. Never a
hard lockout, never anything payment-related (this app has no payment
concept at all). Mid-lesson state still isn't persisted across a
refresh — a refresh during recovery restarts the lesson from step 1,
identical to a refresh at any other point; that's the pre-existing
"no exit/resume" gap (review item 8), not something this pass changes.
Verified: E2E coverage for reaching zero hearts, the recovery panel's
reteach content, hearts restoring, retrying the same exercise
successfully, a refresh during recovery not crashing, and completing a
lesson normally after going through recovery.

## Consequences
- `LessonCompletion.hintsUsed` is a new column (default 0, backfills
  existing rows to 0 automatically) — applied to local dev and CI's
  throwaway Postgres; **still needs `prisma migrate deploy` against the
  real Supabase database on the next production deploy**, same one-time
  gap ADR-0005 already flagged for `RateLimitHit`.
- `ExerciseHandlers` gained a required `onHintUsed` field — every
  exercise component spreading `{...handlers}` picks it up automatically;
  only `ClickSquareStep`/`MoveStep` (the only components with hints)
  actually call it.
- `starsForMistakes` no longer exists as a name — anything outside this
  repo snapshot referencing it (there shouldn't be any; it was never
  exported beyond `apps/web`) would need `starsForPerformance`.
- What this pass deliberately did *not* touch, and why: curriculum depth
  and lesson-structure variety (item 4) is a content-authoring project,
  not a bug fix, and the review itself says not to expand curriculum
  before the core loop is reliable — this pass *is* that reliability
  work. XP integrity, exit/resume, Practice-mode coaching, and the
  legal/child-safety review are each substantial enough to warrant their
  own pass rather than being squeezed in here superficially.
