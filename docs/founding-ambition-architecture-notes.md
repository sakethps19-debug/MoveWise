# Founding ambition — architectural implications

This records how the "world's leading chess-learning platform" requirements
map onto the architecture already in progress, so they're designed for from
Phase 1 onward rather than retrofitted later. None of this is built yet —
it's the design contract for `packages/learner-model`, `packages/analytics`,
and future exercise-engine work.

## 1. Adaptive learning path
Requires `user_skill_mastery` (already in the Section 4 data model) to drive
*which lesson is served next*, not just gate unit progression. Concretely:
the Learn path's "next lesson" decision should query mastery-per-concept and
insert remedial nodes, not just walk a fixed linear list. This is a Phase 3
feature but the data model must support it now — `lesson_attempts` and
`exercise_attempts` need per-concept tagging (via `masteryTags` on each
lesson, already in the schema) from lesson 1 onward, or there's no history
to adapt from later.

## 2. Misconception-level feedback
Already designed into `exercise-schema`'s `FeedbackMap` (wrong-answer-key →
specific explanation, not generic "try again"). The open work is making the
*wrong-answer key* meaningful — right now it's authored per-lesson
(`"default"`, or a specific square/move string); a richer version would key
off *why* the move was wrong (blocked path vs. wrong piece type vs. ignored
a check) so the same misconception gets the same explanation across lessons.
Worth a dedicated misconception taxonomy before Practice-mode content scales.

## 3. Transfer from puzzles to games
Needs `analysed_moves` (already in the data model) to tag each in-game move
with any `masteryTags` it exercised, so Progress/analytics can answer "did
concepts learned in Lesson 5 show up correctly in the next 10 games?" This
depends on Play mode's post-game analysis pipeline reusing the same
`masteryTags` vocabulary as lesson content — one shared tag taxonomy across
`packages/content` and the analysis layer, not two separate ones.

## 4. Personal coach / learner model
A `packages/learner-model` service, separate from `user_skill_mastery` (which
is lesson-level), aggregating: tactical vision (puzzle/lesson accuracy),
calculation depth (proxy: engine-agreement rate at increasing depths),
opening habits (move-1-10 pattern frequency), positional understanding
(non-tactical lesson mastery), time management (Play-mode clock data, once
timed play exists), and recurring blunder themes (from `analysed_moves`
grouped by theme, similar to the prototype's `signals` map). This is a
Phase 3+ system; the prerequisite is that every other system already tags
data with a consistent concept/theme vocabulary.

## 5. Curriculum quality and review
`content_reviewer` role (already in the RBAC list) plus a `content_sources`
table entry per lesson are necessary but not sufficient — the brief asks for
qualified-chess-educator review specifically. That's a content-ops process
decision (who reviews, what the review checklist covers) more than a code
change; worth a `docs/content-review-checklist.md` before non-founder authors
write lessons.

## 6. Scalable content platform
Already the core design choice (`exercise-schema` + data-driven
`packages/content`, admin authoring portal in the original Phase 5 plan). No
change needed, just confirming it stays the north star as content volume
grows — the risk to actively guard against is any future engineer
special-casing a "hard" lesson as a hand-coded component instead of a new
JSON file.

## 7. Global accessibility
i18n: lesson `text`/`prompt`/`feedback` strings should move to a
locale-keyed structure (e.g. `text: { en: "...", ... }` or a separate
translation table keyed by lesson+step+field) before content volume makes
retrofitting expensive — worth deciding the exact shape in an ADR before
lesson 13 is authored, not after. Low-bandwidth: the PWA offline-lesson-
download requirement already in Phase 0 covers this; keep lesson JSON small
(no embedded images/audio blobs — reference assets by URL) so bundles stay
downloadable on slow connections.

## 8. Trustworthy instruction
Engine evaluation (`packages/engine`) should never be the *only* source of
an explanation shown to a learner — `buildLesson`-style heuristics (ported
conceptually from the prototype) that translate eval + tactical pattern
into plain-English, position-specific text are required for anything
learner-facing. Raw centipawn numbers are fine in Play-mode analysis UI for
advanced users, not in Learn-mode lesson content.

## Success-metric to analytics-event mapping
Every metric in the founding brief maps to an event already in the original
analytics requirements list (lesson started/completed, hint requested,
incorrect-answer category, etc.) plus two not yet specified: a "concept
applied correctly in game" event (needs #3 above) and a "repeated
misconception" event (needs the misconception taxonomy from #2). Screen time
is deliberately not tracked as a headline metric — retention and mastery
events are.
