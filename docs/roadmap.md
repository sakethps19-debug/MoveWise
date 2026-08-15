# Roadmap

Status against the brief's own phase structure (Section 22) for Phases
0-2 below, which are done history. **Phases 3-5 as originally numbered
are superseded by ADR-0008's Phase A/B/C**, reorganized around the
Learn & Play / Play & Learn two-mode architecture rather than the
brief's original linear phase list — the work those old phase
descriptions pointed at (learner model, practice personalization, game
coaching, content ops) is the same work, just regrouped around the
two-mode structure and given a concrete, shared data model
(`docs/concept-taxonomy.md`, ADR-0008) instead of three separately-
evolving feature areas.

## Phase 0 — Audit and foundation

Done. Repository audit, architecture proposal, curriculum architecture
(`docs/prd.md`), learner-model specification (`docs/learner-model.md`),
database design (`docs/architecture.md`), exercise schema
(`packages/exercise-schema`), UX structure (`docs/prd.md`'s section
mapping table) all exist. No formal "migration plan" or "prioritized
backlog" document beyond this roadmap and `docs/known-risks.md` — those
two together serve the same purpose.

## Phase 1 — Learning MVP

Done, including the gap-filling pass that added hearts, mastery stars, the
visual learning-path home screen, split `LessonRunner` into per-type
components, and — closing the last Phase 1 item the brief specified —
local guest progress: guests get the same locking/stars as signed-in
users via `localStorage` (`lib/guestProgress.ts`), migrated into an
account on signup or login. Three units live (16 lessons + a non-curated
preview unit — the third, "Basic Tactics," is the first step past pure
piece-movement/check-mechanics content into pattern recognition), all 13
exercise-step types have real content exercising at least one of them,
Play mode works, accounts persist progress.

## Phase 2 — Accounts and cloud progress

Mostly done, out of order relative to the brief's own phasing (accounts
and persistence were built during Phase 1 gap-filling, not as a separate
phase after it). Done: authentication, persistence, guest-progress
migration, profiles (data export + account deletion, plus email +
sign-out), security controls (partial — see `docs/security-checklist.md`),
and — resolving the top item in the open-decisions list below — a real
Postgres database, hosted on Supabase (ADR-0005), deployed on Vercel
(`docs/deployment.md`). Not done: streaks, real cloud sync semantics
beyond "every signed-in action is already server-persisted."

## Phase A — Learn & Play foundation (ADR-0008)

Not started, except the first bullet.

- ~~Correct the existing lesson-engine defects.~~ **Done** — ADR-0007
  (required prompts on every board exercise, stale-hint clearing,
  hint-aware stars, server-side prerequisite enforcement, zero-heart
  guided recovery). This was a prerequisite for everything else in this
  phase, per the review's own instruction not to build a taxonomy and
  mastery system on top of a lesson engine with known defects.
- Create the `Principle → SubLesson → Puzzle → MasteryChallenge`
  hierarchy (ADR-0008) and migrate `masteryTags` into real `Concept`
  rows (`docs/concept-taxonomy.md`) — schema and data migration, not a
  content rewrite (`SubLesson` = today's `Lesson`, unchanged).
- Restructure the one existing beginner unit (`meet-the-pieces`) into
  this hierarchy fully before touching the other two units or authoring
  new content, per the request's own priority.
- Implement concept-level mastery (`UserConceptMastery`, the 9-state
  model in `docs/learner-model.md`) and controlled unlocking — puzzle
  accuracy, hint usage, and mastery-challenge result, not lesson
  completion alone.
- Implement the struggling-learner remediation flow
  (`docs/learner-model.md`) and a per-unit placement assessment.

## Phase B — Play & Learn foundation (ADR-0008)

Not started. Blocked on Phase A's `Concept` taxonomy existing (move
analysis needs concept IDs to tag instructive moments with).

- Persist completed Stockfish games (`Game`, ADR-0008) — Play mode is
  currently freeform/stateless, this is the first real change to it.
- Classify every move with the fixed 8-value scale (ADR-0008) —
  async, cached (`GameAnalysis`), never blocking the request.
- Identify the 3 most instructive moments per game, map to `Concept`
  IDs, generate a `StudyPlan` (capped at ~3-4 items, ranked by
  recency/repetition, not raw mistake count — `docs/concept-
  taxonomy.md`'s recommendation-ranking section).
- Allow retrying a critical position (retry move, progressive hint,
  show best move, link to the relevant `SubLesson`).
- Fair-play invariant (ADR-0008) implemented and tested before any
  human-vs-human mode is even scaffolded, not after.

## Phase C — Unified adaptation (ADR-0008)

Not started. Blocked on both A and B having real usage data —
`gameApplicationScore` (`docs/learner-model.md`) needs real
`MoveAnalysis` rows to weight against real `ExerciseAttempt` rows, not
just a designed formula.

- Combine `exerciseConfidence` and `gameApplicationScore` into one
  `mastered` determination — the concrete mechanism behind "a concept
  isn't mastered from controlled exercises alone."
- Detect learned-but-not-applied concepts and surface them (the
  Progress dashboard's "transfer progress" view, ADR-0008/PRD).
- Spaced repetition scheduling (`nextRevisionDueAt`), game-derived
  `Puzzle`s (`sourceGameId`), safe PGN import (with the same
  fair-play/legal-permission checks as any other game source).

## Decisions open, pending product-owner input

Carried forward from the initial repository assessment — nothing below
blocks continued low-stakes work (more content, more docs), but real
progress on Phase 3, Phase 4's persistence work, or Phase 5 needs at
least one of these resolved. (Hosting/infra for Postgres — originally
item 1 here — is resolved: ADR-0005, Supabase, free tier. Choosing an
actual deploy platform/process for the Next.js app itself is still open,
but wasn't one of the original six and isn't blocking anything yet.)

1. **Analytics vendor** (self-hosted vs. a SaaS product — cost and
   data-handling implications either way).
2. **Scope and timing of the admin/authoring portal** (Section 14) — a
   second full application.
3. **Real COPPA compliance work** — legal, not engineering.
4. **Monetization stance** — architecture (account tiers, payment
   provider) shouldn't get guessed at.
5. **i18n scope for Phase 1** — retrofitting full localization later is
   expensive; worth deciding whether new content should be authored with
   i18n keys from now on, or English-only until Phase 5.
