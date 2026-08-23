# MoveWise — Product Requirements Document

## Vision

"Learn how to think during a chess game." Not a chessboard, not a puzzle
app, not a Stockfish interface. A platform that connects lessons, practice,
games, and analysis around an evolving model of the individual learner:
*learn a concept → practise it → prove mastery → apply it in a game →
analyse performance → prescribe remedial lessons → practise again.*

Initial audience: complete beginners through improving casual players
(roughly 0–1200 online rapid). No assumed familiarity with algebraic
notation, files/ranks, or FEN — terminology is introduced gradually and
visually, never assumed.

## Core architecture: two complementary modes (ADR-0008, not built yet)

The product is organized around two modes sharing one concept taxonomy,
one learner model, and one recommendation engine — not two separate
features that happen to coexist:

- **Learn & Play** — the structured, curriculum-led mode. "Follow a
  structured course, practise each idea and unlock new chess skills."
  Course → Level → Unit → Principle → Sub-lessons → concept-specific
  puzzles → mastery challenge → revision. See ADR-0008's information-
  architecture decision and `docs/concept-taxonomy.md`.
- **Play & Learn** — the game-led, diagnostic mode. "Play a game,
  understand every important decision and receive your personal
  training plan." A completed game (Stockfish first; PGN/platform
  import and OTB entry later) gets move-by-move classification,
  instructive-moment explanation, and a personalised study plan mapping
  mistakes back to the same concept taxonomy Learn & Play teaches from.
  See ADR-0008's move-classification and analysis-pipeline decisions.

**Today's build is entirely Learn & Play**, and even that mode doesn't
yet have the principle/sub-lesson/puzzle/mastery-challenge hierarchy —
see the "Curriculum status" and "Primary sections" sections below for
exactly what exists vs. what ADR-0008 specifies. Play & Learn doesn't
exist at all yet (Play mode today is freeform Stockfish, no analysis,
no persistence — see below). `docs/roadmap.md`'s Phase A/B/C is the
build order; this PRD describes the target, not the current state,
except where explicitly marked "Built."

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
   taught in a lesson is later recognized/applied in Play & Learn. *Not
   built — needs the learner model and per-game move analysis (ADR-0008
   Phase B/C); this is the specific mechanism `docs/learner-model.md`'s
   `gameApplicationScore` exists to compute, and the whole reason the
   two modes share one taxonomy instead of being separate features.*
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

## Primary navigation (ADR-0008, extends the brief's Section 5)

Home experience should prominently offer the two modes, plus secondary
navigation:

| Section | Status |
|---|---|
| **Learn & Play** | Partially built under the old flat name ("Learn"). Default home screen: status-aware learning path (locked/available/completed, mastery stars, "Continue learning" callout) — see `apps/web/components/LearningPath.tsx`. What's missing against ADR-0008: the principle/sub-lesson grouping (today it's `Unit → Lesson`, no `Principle` layer), concept-specific puzzle pools (no `Puzzle` content type exists), concept-level mastery/unlocking (unlocking today is pure `LessonCompletion` presence — ADR-0008 requires puzzle accuracy, hint usage, and mastery-challenge result, not lesson completion alone), and a placement assessment. |
| **Play & Learn** | Partially built (ADR-0008 Phase B, first slice). A signed-in learner's completed game is now persisted (`Game`, PGN + result), and "Analyze this game" runs a real, engine-driven move-by-move review (the full 8-value classification scale, 3 of 8 concept-taxonomy mistake detectors, a single-game-scoped study plan capped at 4 lessons, and a retry-this-position panel). Guests still see the labeled demo only — analysis needs a signed-in session to own the persisted game. Deliberately not built: a background analysis job (this runs client-side against the same Stockfish Worker Play mode already uses, not a server queue), cross-game recurring-mistake tracking, PGN import, and 5 of the taxonomy's 8 mistake detectors (queen-development-timing, trade-evaluation, back-rank-safety, opposition-key-squares, and time-trouble/candidate-move-routine — the last needs clock data this app doesn't track). See `docs/roadmap.md`'s Phase B entry and `docs/known-risks.md` for the full honest-scope writeup. |
| **Practice** | Partially built. `/practice` aggregates every unit's puzzle pool into one page (unlocked pools linking to `/practice/[principleId]`, locked ones showing why) plus a "Review needed" section for struggling concepts (linking to `/review/[principleId]`) — real course-puzzle and mastery-review sources, both server-tracked. Still missing, per ADR-0008: game-derived positions, spaced-repetition exercises, weak-skill training, and saved positions — those need Phase B's game analysis and Phase C's spaced repetition first. |
| **Progress** | Not built as a section. Home page shows XP total and lesson count for signed-in users; no streaks, accuracy-by-skill, or weekly-activity views. ADR-0008 specifies three separate-but-connected views (course progress, game performance, transfer progress) — none exist. |
| **Profile** | Partially built. `/account` offers data export and account deletion (see `docs/known-risks.md`); no preference/accessibility settings UI exists beyond that and sign-in/sign-out. |

## Curriculum status

Three of the brief's ~10 planned units exist, all fully built and verified:

- **Meet the Pieces** (Foundation II) — 12 lessons, matches the brief's
  Section 7 spec exactly (lesson titles, 3–5 minute scope, per-lesson
  learning objectives).
- **Check and Checkmate Basics** (draws from Foundation III) — 3 lessons,
  purpose-built to exercise the 5 exercise-step types that had no curated
  content before this: `find-check`, `find-checkmate`, `order-steps` (a
  capture/block/move decision heuristic — directly ties to the "learn how
  to think" promise, not just move drilling), `guided-sequence`, and
  `mini-game`.
- **Basic Tactics** (draws from the brief's Tactics section) — 1 lesson so
  far ("The knight fork"), the first step into pattern recognition rather
  than piece movement or check/checkmate mechanics. Every position was
  found and verified programmatically (a small throwaway script computing
  real knight-attack geometry and confirming legality/check status via
  chess.js), never hand-derived — including a deliberately plausible trap
  move (a legal check that isn't also a fork) used as real, verified
  misconception-specific feedback rather than an invented wrong answer.

Foundation I, IV, and V, the rest of Tactics, Checkmate Patterns,
Strategy, Endgames, and Openings (Section 6 of the brief) are unbuilt.

## Non-goals for the current build

Not attempted, and shouldn't be inferred as accidentally missing: an
authoring portal, i18n, offline/PWA support, real (legally-reviewed)
COPPA compliance, and monetization. These carry cost, ownership, or legal
implications and are listed as open decisions pending product-owner input
— see `docs/roadmap.md`. (CI/CD and a real Postgres database are *not*
on this list anymore — both exist now; see ADR-0005 and
`.github/workflows/ci.yml`. `apps/web` is deployed now too, on Vercel —
see `docs/deployment.md`.)

## Success metrics (per the brief's Section 23)

Not instrumented yet — no analytics exist (Section 18 of the brief). Every
metric listed there (lesson completion, concept mastery, retention at 1/7/30
days, misconception recurrence, move-quality improvement) requires the
learner model and an analytics pipeline, neither built.
