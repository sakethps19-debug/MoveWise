# MoveWise — Product Requirements Document

## Vision

"Learn how to think during a chess game." Not a chessboard, not a puzzle
app, not a Stockfish interface. A platform that connects lessons, practice,
games, and analysis around an evolving model of the individual learner:
*learn a concept → practise it → apply it in a guided game → identify
mistakes → get personalised remedial lessons → demonstrate mastery.*

Initial audience: complete beginners through improving casual players
(roughly 0–1200 online rapid). No assumed familiarity with algebraic
notation, files/ranks, or FEN — terminology is introduced gradually and
visually, never assumed.

## What makes MoveWise defensible (not "another chess app")

1. **Adaptive learning** — the path responds to demonstrated strengths,
   weaknesses, and retention, not just lesson completion. *Not built yet —
   see `docs/learner-model.md`.*
2. **Misconception-level feedback** — never "Incorrect." Every wrong-answer
   feedback map in every lesson names the specific misconception ("the
   rook cannot jump over another piece," not "wrong"). *Built and enforced:
   `packages/exercise-schema`'s `FeedbackMapSchema` requires a feedback map
   on every answerable step type that has one; content review should catch
   any that degrade to generic text.*
3. **Transfer from lessons to games** — measuring whether a concept
   taught in a lesson is later recognized/applied in Play mode. *Not built
   — needs the learner model and per-game move analysis, both Phase 3+.*
4. **A personal coach** — a learner model covering piece-movement,
   tactics, calculation, king safety, endgames, blunder patterns.
   *Not built — see `docs/learner-model.md`.*
5. **Original curriculum** — every lesson, position, and exercise is
   authored from scratch and chess-legality-verified programmatically, not
   copied or adapted from any existing course, puzzle database, or video.
   See `docs/content-licensing-register.md`.
6. **Scalable content system** — lessons are data (`packages/content/*.json`
   validated against a Zod schema + a chess-legality validator), not
   hardcoded in components. An authoring portal so non-engineers can create
   lessons is planned (Section 14 of the brief) but not built.

## Primary sections (per the brief's Section 5)

| Section | Status |
|---|---|
| **Learn** | Built. Default home screen: status-aware learning path (locked/available/completed, mastery stars, "Continue learning" callout) — see `apps/web/components/LearningPath.tsx`. |
| **Practice** | Not built. Needs the learner model (weak-concept detection) to generate personalized practice sets rather than a static list. |
| **Play** | Built (Stockfish opponent, adjustable skill 0–20, both colors). Guided mini-games and post-game analysis/remediation are not built — Play mode today is freeform only, no game persistence, no coaching. |
| **Progress** | Not built as a section. Home page shows XP total and lesson count for signed-in users; no streaks, accuracy-by-skill, or weekly-activity views. |
| **Profile** | Partially built. `/account` offers data export and account deletion (see `docs/known-risks.md`); no preference/accessibility settings UI exists beyond that and sign-in/sign-out. |

## Curriculum status

Two of the brief's ~10 planned units exist, both fully built and verified:

- **Meet the Pieces** (Foundation II) — 12 lessons, matches the brief's
  Section 7 spec exactly (lesson titles, 3–5 minute scope, per-lesson
  learning objectives).
- **Check and Checkmate Basics** (draws from Foundation III) — 3 lessons,
  purpose-built to exercise the 5 exercise-step types that had no curated
  content before this: `find-check`, `find-checkmate`, `order-steps` (a
  capture/block/move decision heuristic — directly ties to the "learn how
  to think" promise, not just move drilling), `guided-sequence`, and
  `mini-game`.

Foundation I, IV, V, Tactics, Checkmate Patterns, Strategy, Endgames, and
Openings (Section 6 of the brief) are unbuilt.

## Non-goals for the current build

Not attempted, and shouldn't be inferred as accidentally missing: an
authoring portal, i18n, offline/PWA support, real (legally-reviewed)
COPPA compliance, monetization, analytics infrastructure, CI/CD, and a
production Postgres deployment. All six carry cost, ownership, or legal
implications and are listed as open decisions pending product-owner input
— see `docs/roadmap.md`.

## Success metrics (per the brief's Section 23)

Not instrumented yet — no analytics exist (Section 18 of the brief). Every
metric listed there (lesson completion, concept mastery, retention at 1/7/30
days, misconception recurrence, move-quality improvement) requires the
learner model and an analytics pipeline, neither built.
