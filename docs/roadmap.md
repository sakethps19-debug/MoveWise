# Roadmap

Status against the brief's own phase structure (Section 22).

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
visual learning-path home screen, and split `LessonRunner` into per-type
components. Two units live (15 lessons + a non-curated preview unit), all
13 exercise-step types have real content exercising at least one of them,
Play mode works, accounts persist progress. Local guest progress
(brief-specified as a Phase 1 item) is **not** built — guests can use
everything, nothing they do is saved anywhere, including localStorage; see
`docs/known-risks.md`.

## Phase 2 — Accounts and cloud progress

Partially done, out of order relative to the brief's own phasing (accounts
and persistence were built during Phase 1 gap-filling, not as a separate
phase after it — a reasonable sequencing given no guest-first architecture
existed to migrate away from). Done: authentication, persistence, profiles
(minimal — email + sign-out only), security controls (partial — see
`docs/security-checklist.md`). Not done: PostgreSQL (still SQLite —
ADR-0002's consequences section covers the migration path), guest-progress
migration (moot until guest-local-progress exists), streaks, real cloud
sync semantics beyond "every signed-in action is already server-persisted."

## Phase 3 — Practice and personalization

Not started. Blocked on the learner model (`docs/learner-model.md`) —
concept-mastery tracking, weak-skill detection, spaced repetition,
personalized practice, and progress analytics all depend on data this
codebase doesn't capture yet (per-attempt outcomes, not just per-lesson
completions).

## Phase 4 — Play and coaching

Partially started. Done: computer games, adjustable strength (skill 0–20),
fair-play separation is inherent (Play mode's engine is explicitly a
computer opponent, never assistance during any human-vs-human context,
because no human-vs-human mode exists at all yet). Not done: guided
mini-games as a standalone Play-mode feature (mini-games exist only
embedded inside lessons, via the `mini-game` exercise-step type — not
exposed as a Play-mode entry point), live coaching, post-game analysis,
mistake retry, remedial-lesson recommendations. All of these need either
game persistence (Play mode is currently stateless/freeform) or the
learner model.

## Phase 5 — Content operations and scale

Not started. No authoring portal, no review/publish workflow, no course
versioning beyond a `version` field on each lesson JSON that nothing
currently enforces meaning for, no translation workflow, no monitoring,
no performance work motivated by real traffic (none exists).

## Decisions open, pending product-owner input

Carried forward from the initial repository assessment — nothing below
blocks continued low-stakes work (more content, more docs), but real
progress on Phase 2's Postgres migration, Phase 3, Phase 4's persistence
work, or Phase 5 needs at least one of these resolved:

1. **Hosting/infra for Postgres, and who pays for it.**
2. **Analytics vendor** (self-hosted vs. a SaaS product — cost and
   data-handling implications either way).
3. **Scope and timing of the admin/authoring portal** (Section 14) — a
   second full application.
4. **Real COPPA compliance work** — legal, not engineering.
5. **Monetization stance** — architecture (account tiers, payment
   provider) shouldn't get guessed at.
6. **i18n scope for Phase 1** — retrofitting full localization later is
   expensive; worth deciding whether new content should be authored with
   i18n keys from now on, or English-only until Phase 5.
