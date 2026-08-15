# Learner model — specification

**Status: not built.** This is a specification for Phase 3 work (per the
brief's own phasing), written now so the schema and content built in
Phase 1 don't have to be retrofitted later. Nothing in this document is
implemented.

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

## Proposed data model additions

Additive to the 3 tables that exist today (`User`, `Session`,
`LessonCompletion`) — see `docs/architecture.md` for why this is additive,
not a redesign:

- **`Concept`** — id, name, description. Concepts are what `masteryTags`
  on lesson content already reference informally (e.g. `"check"`,
  `"pawn-movement"`) — this promotes tags into a real, queryable entity.
- **`UserConceptMastery`** — userId, conceptId, a status enum (the 7 states
  above), a running confidence/strength score, lastPracticedAt,
  nextRevisionDueAt.
- **`ExerciseAttempt`** — one row per attempt (not just per lesson
  completion): userId, lessonId, stepId, correct, wrongAnswerKey (the
  feedback-map key that was hit, e.g. `"knight-jumps-over"` — this is the
  raw material for "which misconceptions recur," brief Section 18),
  timestamp. `LessonCompletion` already aggregates mistake *count*; this
  is the per-attempt detail that count is currently thrown away from.
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
