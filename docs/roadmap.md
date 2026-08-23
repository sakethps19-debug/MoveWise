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

Mostly done, now across all three curated units (`meet-the-pieces`,
`check-and-checkmate`, `basic-tactics`) — `meet-the-pieces` was
restructured first per this phase's own stated priority, then the other
two followed the same pattern.

- ~~Correct the existing lesson-engine defects.~~ **Done** — ADR-0007
  (required prompts on every board exercise, stale-hint clearing,
  hint-aware stars, server-side prerequisite enforcement, zero-heart
  guided recovery). This was a prerequisite for everything else in this
  phase, per the review's own instruction not to build a taxonomy and
  mastery system on top of a lesson engine with known defects.
- ~~Create the `Principle → SubLesson → ... → MasteryChallenge`
  hierarchy and migrate `masteryTags` into real `Concept` entries.~~
  **Done for all three curated units** — `packages/content/concepts.json`
  (19 concepts, migrated from the existing tags) plus a
  `packages/content/principles/{unitId}.json` file per unit:
  `meet-the-pieces` (7 principles), `check-and-checkmate` (3), and
  `basic-tactics` (1), all cross-referentially validated by `pnpm
  validate:content`. `meet-the-pieces` was restructured first per this
  phase's own stated priority (finish one unit before generalizing);
  `check-and-checkmate` and `basic-tactics` followed the identical
  pattern once it was proven out — no app code changes were needed,
  `lib/principles.ts` and `LearningPath.tsx` were already data-driven off
  file presence. ~~`Puzzle` is still not built.~~ **Done for all three
  curated units**: `packages/content/puzzles/{unitId}.json` — 14 puzzles
  for `meet-the-pieces` (2 per principle), 6 for `check-and-checkmate`
  (2 per principle), 2 for `basic-tactics` (its one principle) — all
  chess-legality-validated, and the "check"/"checkmate"/"fork" ones
  additionally verified against the engine directly (not just that the
  move is legal, but that it actually delivers check/mate/a fork, since
  the chess-legality validator only checks move legality, not tactical
  claims). `meet-the-pieces` was the pilot; `check-and-checkmate` and
  `basic-tactics` followed once the pattern was proven out — no app code
  changes were needed, same as the Principle hierarchy's own rollout.
  Puzzles are served from `apps/web/lib/puzzles.ts`, played at
  `/practice/[principleId]` (`components/PuzzleRunner.tsx`, reachable
  from `LearningPath.tsx` once a principle's sub-lessons are done, gated
  server-side too — not just hidden from the UI), and each attempt is a
  real `ExerciseAttempt` row feeding the same mastery computation lessons
  do. Puzzle-pool accuracy still isn't part of the *unlock* signal (see
  below and `lib/masteryModel.ts`'s own comment on why that's deliberate).
  ~~The shared `Practice` aggregation page ADR-0008 describes is still
  not built.~~ **Done, for the sources that exist today**: `/practice`
  (`components/PracticeHub.tsx`) gathers every unit's puzzle pool onto
  one page — unlocked pools linking straight to `/practice/[principleId]`,
  locked ones showing why — plus the same "Review needed" section
  `LearningPath.tsx`'s home page already surfaces, so a struggling
  concept is reachable from either page. Built by extracting the unlock
  computation LearningPath already had (`statusOf`/`unlockReason` into
  `lib/lessonStatus.ts`, the guest-completions fallback into
  `lib/useEffectiveCompletions.ts`) into shared modules both surfaces
  consume, rather than duplicating it a second time — verified
  behavior-preserving by rerunning `learning-path.spec.ts` unmodified
  after each extraction (all 8 tests, both times) before building the
  new page on top. `Nav.tsx`'s "Practice" item now links here instead of
  showing a disabled "Soon" badge. Still not the *full* aggregate ADR-0008
  ultimately describes: game-derived positions, spaced-repetition
  exercises, weak-skill training, and saved positions aren't sources yet
  (Phase B/C territory, see below) — today's pool is course puzzles plus
  mastery reviews only.
- ~~Implement concept-level mastery and controlled unlocking.~~ **Done,
  with an honest scope cut**: `UserConceptMastery`/`ExerciseAttempt`
  (real Postgres tables) and `lib/masteryModel.ts`'s
  `computeMasteryStatus` implement 7 of the 9 states reachable from
  exercise-attempt evidence alone (`not-started`, `learning`,
  `practising`, `ready-for-assessment`, `proficient`, `struggling`,
  `recovered`). Unlocking a principle's first sub-lesson now requires the
  *previous* principle's concept to be proficient — not just its lessons
  completed — enforced server-side on the lesson route and mirrored in
  the learning-path UI so a locked lesson never shows as available.
  `practising`/`ready-for-assessment` are evidenced by puzzle-pool
  attempts specifically (docs/learner-model.md), deliberately layered in
  *before* the pre-existing proficient/struggling/learning logic so
  `proficient` still fires from overall accuracy exactly as before,
  regardless of attempt source — every learner who was already proficient
  before this pass stays proficient, unaffected. `mastered`/
  `revision-due` (need Phase B's `gameApplicationScore` and Phase C's
  spaced repetition) are correctly *not* reachable yet — not an
  oversight, see `lib/masteryModel.ts`'s own comment.
- ~~Not done: the struggling-learner remediation flow beyond ADR-0007's
  per-exercise recovery.~~ **Done**: `/review/[principleId]`
  (`components/RemediationRunner.tsx`) implements
  `docs/learner-model.md`'s concept-level cycle — a shortened reteach
  (up to 2 `explain` steps pulled from the struggling concept's own
  sub-lessons, capped rather than the whole lesson replayed, same
  "reuse existing content" move ADR-0007's per-exercise recovery
  interstitial already makes one level down), then 2-3 easier puzzles
  from that principle's own pool (falling back to whatever difficulty
  exists where no difficulty-1 puzzles are authored yet — see the
  Puzzle-pool entry above), then a link back to retry the principle's
  first sub-lesson. Gated server-side on the concept having *any*
  `UserConceptMastery` evidence at all, not on `status` being exactly
  `struggling` — that stricter version caused a real, reproduced-live
  bug (a puzzle attempt is a Server Action, and Next's post-action route
  refresh could flip status straight past `struggling` mid-round and
  bounce the learner home before they finished), fixed by treating
  `/review` the same "reachable once relevant, repeatable after" way
  `/practice/[principleId]` already treats its own pool — see
  `docs/known-risks.md` for the full diagnosis. Not reachable
  speculatively for a principle with zero evidence at all. No changes to
  `lib/masteryModel.ts` were needed: `struggling → recovered` already
  fires correctly once the learner's next few real attempts (from
  retrying the lesson after remediation) show strong recent accuracy;
  this flow is the on-ramp that helps produce those attempts, not a
  second implementation of the transition itself. One honest gap: the
  spec's own "on success, explain specifically what improved" (step 5)
  is only partially done — the completion screen reports the puzzle
  round's own result, not a live-detected mastery-transition narrative,
  since that would need a mastery re-check this component doesn't make;
  the transition surfaces naturally next time the learner sees the
  learning path instead (the "Review needed" section drops the
  principle, `MasteryBadge` shows "Recovered"). Also not done: a
  per-unit placement assessment (`docs/learner-model.md`'s other
  remaining item).

## Phase B — Play & Learn foundation (ADR-0008)

First slice done, deliberately not the full spec — the ADR's own
instruction was explicit ("Do not attempt to implement the entire
personalised analysis system at once"), so this pass builds one real,
working vertical slice and documents the honest gaps rather than a
half-finished attempt at everything.

- ~~Persist completed Stockfish games (`Game`, ADR-0008).~~ **Done** —
  `Game` (PGN via a new `buildPgn` helper in `packages/chess-rules`,
  result, `endReason`, `playerColor`) is persisted once a signed-in
  learner's game ends (`saveCompletedGameAction`). Guests aren't
  persisted — no session to own the row, same reasoning as
  `completeLessonAction`.
- ~~Classify every move with the fixed 8-value scale.~~ **Done**,
  corrected against the ADR along the way: `lib/gameAnalysis.ts`'s
  `MoveClassification` type had drifted from ADR-0008's own enum (a
  `great` value, no `excellent`, no `forced`) since it predated any real
  classifier to test it against — fixed to the real 8 values as part of
  building `lib/moveClassification.ts`, a real centipawn-loss-based
  decision procedure (fixed, documented-as-an-initial-guess thresholds,
  same honesty as star tiers/ADR-0004) with two real decision points
  layered on top: `forced` (no real choice existed) and `brilliant` (a
  zero-loss move that also sacrifices material for a decisive result).
  ~~Async, cached (`GameAnalysis`).~~ **Cached** (a `GameAnalysis`
  already existing for a game is returned as-is, the engine never
  re-runs) **but not async in the originally-specified sense** — this
  codebase has no background-job infrastructure (no queue, no worker
  process) to run it on, so analysis runs client-side against the same
  browser Stockfish Worker Play mode already uses, with real visible
  per-move progress, then persists via `saveGameAnalysisAction` once
  finished. An honest substitute for the ADR's server-side async
  pipeline, not a disguised version of it.
- ~~Identify the 3 most instructive moments per game, map to `Concept`
  IDs, generate a `StudyPlan`.~~ **Done, scoped to 3 of
  `docs/concept-taxonomy.md`'s 8 mapping-table rows**:
  `lib/conceptDetection.ts` detects `hanging-pieces`, `knight-fork`, and
  `king-safety-castling` — the ones checkable from a single move's board
  state alone. The other 5 (`queen-development-timing`,
  `trade-evaluation`, `back-rank-safety`, `opposition-key-squares`,
  `candidate-move-routine`) need move-history-pattern analysis, static-
  exchange sophistication, a real back-rank mate-pattern detector,
  endgame-specific logic, or clock data this app doesn't track at all —
  not fabricated with weak heuristics, left honestly undetected.
  `lib/studyPlanRanking.ts` implements 3 of `docs/concept-taxonomy.md`'s
  5 ranking rules (never-studied, learned-but-not-transferred, repeated-
  within-this-game as the inverse of "one-time oversight") capped at 4
  items; "forgotten concept" (needs `revision-due`, Phase C) and the
  calculation-vs-time-management distinction (needs clock data) are
  deferred. Scoped to a single just-finished game — no
  `RecurringMistakePattern`/cross-game history table exists yet, so
  "repeated misconception" is approximated as "recurred within this one
  game," not across a learner's full history.
- ~~Allow retrying a critical position.~~ **Done, scoped down**:
  `RetryPositionPanel.tsx` lets a learner replay any `mistake`/`blunder`
  move's position and attempt the engine's best move, revealing it on
  request, with a link to the concept's first sub-lesson when one's
  detected. No progressive-hint ladder (a game position has no authored
  hints the way a lesson/puzzle does) — "show best move" only, a smaller
  honest scope than the lesson/puzzle hint system.
- ~~Fair-play invariant (ADR-0008) implemented and tested before any
  human-vs-human mode is even scaffolded, not after.~~ **Done**:
  `Game.analysisAllowed` (defaults `true`) and `lib/gameAnalysis.ts`'s
  `canAnalyze` are real, and `saveGameAnalysisAction` checks it server-
  side before ever persisting an analysis — not just trusted to the
  client. Trivially true for every game this codebase can produce today
  (Stockfish is the only source), but the field and check exist now, not
  bolted on once a PvP mode arrives.

~~Any UI to revisit a *previously*-analyzed game later.~~ **Done**:
`/play/history` lists every game a signed-in learner has played
(analyzed or not); `/play/history/[gameId]` either reassembles a stored
analysis server-side (`lib/studyPlan.ts`'s `buildStoredGameReview` —
recommendations are recomputed at read time, not stored, so improved
lesson content later surfaces without a backfill) or, for a game left
unanalyzed, reconstructs it client-side from the stored PGN
(`packages/chess-rules`' new `replayPgn`, the inverse of `buildPgn`) and
runs the identical analysis pipeline PlayRunner uses right after a game
— extracted into `lib/useGameAnalysisRunner.ts` specifically so both
callers share one implementation instead of two drifting copies. This is
also what finally proves the "never re-run the engine" cache guarantee
against a real return visit, not just within one browser session — an
E2E test (`e2e/game-history.spec.ts`) confirms revisiting an analyzed
game's detail page renders the stored review with no second
`GameAnalysis` row created.

**Not done, on purpose**: PGN import (still only real Stockfish games —
ADR-0008 explicitly scopes Phase B to "no PGN import yet"), and a
persisted `StudyPlan` table for recommendations generated without a
specific game (ADR-0008 speculates this for a broader system this pass
doesn't need — `/play/history`'s recommendations are still always
computed per-game, on demand).

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
