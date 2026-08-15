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
Postgres database, hosted on Supabase (ADR-0005). Not done: streaks, real
cloud sync semantics beyond "every signed-in action is already
server-persisted," and an actual deploy of the app itself — ADR-0005
lands the data layer only; no hosting platform is chosen for the Next.js
app, and no production `DATABASE_URL` is wired anywhere yet.

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
