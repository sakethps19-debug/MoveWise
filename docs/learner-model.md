# Learner model — specification

**Status: not built.** This is a specification for Phase 3 work (per the
brief's own phasing), written now so the schema and content built in
Phase 1 don't have to be retrofitted later. Nothing in this document is
implemented.

**Extended by ADR-0008** (the Learn & Play / Play & Learn two-mode
architecture): this model is no longer Learn-&-Play-only. Both modes
read and write the same `UserConceptMastery` rows — see "Two evidence
sources, one mastery score" below, which supersedes this document's
original single-source framing. The status-distinction list right below
is superseded by the 9-state model further down; kept here with a note
rather than deleted, since the reasoning behind the original 7 still
applies to most of the 9.

## Why this matters more than it looks like it does

Every differentiator the brief claims (Sections 3.1–3.4: adaptive
learning, misconception-level feedback, transfer measurement, a personal
coach) depends on this model existing. Right now, "progress" is a
`LessonCompletion` row — first-completion tracking only. There's no
concept of *why* an answer was wrong beyond the per-exercise feedback text
shown once and forgotten, no tracking of whether a concept, once
struggled with, was later retained or re-forgotten. Without this, MoveWise
is a well-built lesson player, not the adaptive system the brief describes.

## Status distinctions to model (brief Section 9)

A concept, for a given learner, should be in exactly one of:

- **First completion** — answered correctly, never attempted before.
- **Repeat practice** — deliberately revisited (not a first attempt).
- **Mastered** — sustained correct performance, not just one clean run.
  (Today's `starsForMistakes()` — see ADR-0004 — is a *single-lesson*
  proxy for this, not a real cross-lesson mastery signal.)
- **Revision due** — mastered previously, enough time has passed that
  retention is uncertain (spaced-repetition scheduling).
- **Struggling** — repeated wrong answers on exercises tagged with this
  concept, recently.
- **Recently recovered** — was struggling, now answering correctly again.
- **Retained after delay** — answered correctly on a revision-due prompt.

## The 9-state mastery model (supersedes the 7 states above)

Per `(userId, conceptId)`, `UserConceptMastery.status` is one of:

`not-started → learning → practising → ready-for-assessment →
proficient → mastered → revision-due`, plus two side-states reachable
from `learning`/`practising`: `struggling` and `recovered`.

| State | Entered when | Evidenced by |
|---|---|---|
| `not-started` | no attempt exists for this concept | — (absence of rows) |
| `learning` | first `SubLesson` attempt for the concept | `ExerciseAttempt` |
| `practising` | sub-lessons done, working through concept-tagged `Puzzle`s | `ExerciseAttempt` on `Puzzle`s |
| `ready-for-assessment` | puzzle accuracy above threshold, hint dependency low | aggregated `ExerciseAttempt` stats |
| `struggling` | repeated wrong answers, or a failed mastery-challenge attempt | `ExerciseAttempt` frequency, `RecurringMistakePattern` |
| `recovered` | struggling, then a remediation cycle (see below) completed successfully | `ExerciseAttempt` post-remediation |
| `proficient` | passed the `Principle`'s mastery challenge | `LessonCompletion` on a `kind: "mastery-challenge"` lesson |
| `mastered` | proficient + sustained correct application, including in real games | `UserConceptMastery.gameApplicationScore` — see below |
| `revision-due` | mastered, `nextRevisionDueAt` has passed | scheduler, not an attempt |

Note what's different from the old 7-state list: `proficient` and
`mastered` are now distinct (passing a mastery challenge is necessary
but not sufficient for `mastered` — see the transfer requirement
below), and `struggling`/`recovered` are explicit states with a defined
remediation flow rather than just adjectives.

## Struggling-learner remediation flow

Failing a `Principle`'s mastery challenge does not reset the principle
or its sub-lessons. Instead:

1. Diagnose which sub-concept the failure clusters around — the
   mastery-challenge steps most often missed, cross-referenced against
   which `SubLesson`/concept they're tagged with (not just "the
   challenge failed," which sub-idea specifically).
2. Present a shortened reteach (the relevant `SubLesson`'s `explain`
   steps, not the whole sub-lesson replayed start to finish — the same
   "reuse existing content, don't author a new remediation type" move
   ADR-0007's zero-heart recovery interstitial already makes for a
   single exercise; this is the same idea one level up, for a whole
   concept).
3. Serve 2-3 easier `Puzzle`s tagged with that specific sub-concept,
   difficulty 1, before returning to the mastery-challenge difficulty.
4. Allow a fresh mastery-challenge attempt.
5. On success: `struggling → recovered → proficient`. On the completion
   screen, explain specifically what improved (mirrors the
   `starsExplanation()` pattern ADR-0007 already established for
   single-lesson completions — apply the same "explain the number, don't
   just show it" principle at the concept level).

## Placement assessment (experienced learners)

A standalone assessment per `Unit` (not per `Principle` — coarser
granularity keeps it short) that, if passed, sets every `Principle` in
that unit's `UserConceptMastery` rows to `proficient` (never
`mastered` directly — see below) and unlocks subsequent units
immediately. Two things this must not do: (1) skip creating the
`UserConceptMastery` rows at all — a learner who placed out still needs
rows to accumulate `gameApplicationScore` against, or their real-game
performance is invisible to the recommendation engine; (2) treat a
placement pass as equivalent to organic mastery — `mastered` is earned
only through the same transfer evidence as anyone else, per the next
section, specifically because a placement test can be gamed or lucky in
a way sustained game performance can't.

## Two evidence sources, one mastery score

Learn & Play answers "what should this learner study next" from
`ExerciseAttempt`/`LessonCompletion` evidence. Play & Learn answers
"what does this learner's actual chess reveal" from `MoveAnalysis`
evidence (see ADR-0008's proposed `Game`/`GameAnalysis`/`MoveAnalysis`
models). `UserConceptMastery` combines both rather than keeping two
separate scores an application has to reconcile itself:

- `exerciseConfidence` — derived from `ExerciseAttempt` accuracy, hint
  usage, and mastery-challenge results. This alone can reach
  `proficient`.
- `gameApplicationScore` — derived from `MoveAnalysis` rows tagged with
  the concept: correct application (the concept's pattern recognized
  and played correctly in a real game) raises it; a repeated error on a
  concept the learner has completed sub-lessons for lowers it, and is
  exactly the "learned but not transferred" signal
  `docs/concept-taxonomy.md`'s recommendation-ranking section treats as
  highest-value.
- **`mastered` requires both** — `exerciseConfidence` at `proficient`
  threshold *and* `gameApplicationScore` showing correct application in
  at least a small number of real games. A concept is not "fully
  mastered merely because the learner solved controlled exercises,"
  per the brief's own explicit instruction — this field is the literal
  mechanism enforcing that, not just a stated principle with nothing
  checking it.
- Evidence is **appropriately weighted, not naively averaged**: a
  single real-game application (harder, more meaningful) should move
  `gameApplicationScore` more than a single puzzle attempt moves
  `exerciseConfidence`; a single game mistake shouldn't erase many
  exercise successes outright (games are noisier — time pressure,
  fatigue, opponent strength vary) — the exact weighting function is a
  Phase C design/tuning task, not fixed here, but the *shape* (multiple
  weighted signals, not a single running average) is decided.

## Proposed data model additions

Additive to the 4 tables that exist today (`User`, `Session`,
`LessonCompletion`, `RateLimitHit`) — see `docs/architecture.md` for why
this is additive, not a redesign. `Game`/`GameAnalysis`/`MoveAnalysis`/
`StudyPlan` (the Play & Learn side) are specified in ADR-0008, not
repeated here.

- **`Concept`** — id, name, description, parentId. See
  `docs/concept-taxonomy.md` for the full design — this promotes
  today's free-text `masteryTags` into a real, queryable, hierarchical
  entity, with a concrete migration path (every existing tag becomes a
  row) rather than starting from nothing.
- **`UserConceptMastery`** — userId, conceptId, a status enum (the 9
  states above), `exerciseConfidence`, `gameApplicationScore`,
  lastPracticedAt, nextRevisionDueAt. See "Two evidence sources, one
  mastery score" above for why there are two scores, not one.
- **`ExerciseAttempt`** — one row per attempt (not just per lesson
  completion): userId, lessonId or puzzleId, stepId, correct,
  wrongAnswerKey (the feedback-map key that was hit, e.g.
  `"knight-jumps-over"` — this is the raw material for "which
  misconceptions recur," brief Section 18), hintLevelUsed, timestamp.
  `LessonCompletion` already aggregates mistake *count* and (as of
  ADR-0007) `hintsUsed` *count*; this is the per-attempt detail those
  counts are currently aggregated from and then thrown away.
- **`RecurringMistakePattern`** — derived/materialized from
  `ExerciseAttempt.wrongAnswerKey` frequency per user, not hand-authored.

## Where the raw material already exists

This isn't starting from nothing. `packages/exercise-schema`'s
`FeedbackMapSchema` already requires every wrong-answer key to map to a
specific misconception string (brief Section 3.2 is already satisfied at
the *content* layer — every lesson names the misconception, not just
"incorrect"). What's missing is capturing *which* key was hit, per
attempt, per user, instead of just showing the text and discarding it.
`LessonRunner`'s `handleIncorrect(key: string)` already receives exactly
this key on every wrong answer — it currently only uses it to look up
display text. Wiring it into an `ExerciseAttempt` write is the concrete
first implementation step when this phase starts.

## Explicitly out of scope for the spec, not just the implementation

Calculation/board-vision measurement, opening-habit tracking, and
time-management analysis (brief Section 3.4's fuller list) need
Play-mode game data that doesn't exist yet (Play mode is freeform, no
game persistence — see `docs/prd.md`). Design those once Play mode
persists games, not before.
