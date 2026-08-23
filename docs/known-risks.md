# Known risks

Not a todo list — a register of what's known to be missing or weak, kept
current as things get fixed or new risks are found. Cross-references the
fuller detail in `docs/security-checklist.md` and `docs/testing-strategy.md`
rather than repeating it.

## High priority

- **Real COPPA compliance is not implemented**, only a conservative
  stopgap (block under-13 signup outright). This is a legal question, not
  an engineering one — see `docs/security-checklist.md` and
  `docs/roadmap.md`'s open-decisions list.
## Medium priority

- **No analytics.** None of the brief's Section 18 questions ("where do
  learners struggle," "which misconceptions recur") are answerable yet —
  blocked on both an analytics pipeline and the learner model
  (`docs/learner-model.md`) that would give the analytics something
  meaningful to measure.
- **No role/permission system.** Every account is implicitly a "learner" —
  fine today, blocking for an authoring portal (brief Section 14).

## Lower priority / accepted for now

- **No i18n infrastructure.** English-only throughout, no translation
  keys, no locale routing.
- **No PWA/offline support.**
- **Board orientation is always White-at-bottom** — not configurable,
  not validated as a distinct concept in content validation (see
  `docs/testing-strategy.md`'s coverage table).
- **Star tiers (0/1-2/3+ mistakes) are an initial guess**, not user-tested
  — see ADR-0004.
- **`.github/workflows/ci.yml` still doesn't run `pnpm lint`** — it now
  can (see "Resolved this session" below), but the workflow file itself
  wasn't updated to add a lint step, since that's a CI-configuration
  decision distinct from making the command runnable at all, and
  wasn't asked for.

## Resolved this session, kept here for the record

- **ADR-0008 Phase B (Play & Learn's real post-game analysis), previously
  pure architecture with a clearly-labeled demo, now has a real first
  slice**: a signed-in learner's completed game persists (`Game`, real
  PGN via a new `packages/chess-rules` `buildPgn` helper), and "Analyze
  this game" runs a genuine engine-driven review — `lib/moveClassification.ts`
  (the real 8-value classification scale, corrected from a stale 7-value
  version that had drifted from ADR-0008's own enum), `lib/conceptDetection.ts`
  (3 of `docs/concept-taxonomy.md`'s 8 mistake-mapping rows: hanging
  pieces, missed knight forks, king left in the centre — the ones
  checkable from board state alone), `lib/studyPlanRanking.ts` (a capped,
  ranked recommendation list), and `RetryPositionPanel.tsx` (replay an
  instructive position, attempt the engine's best move, reveal it on
  request). No background-job infrastructure exists in this codebase (no
  queue, no worker process) — analysis runs client-side against the same
  browser Stockfish Worker Play mode already uses, with real per-move
  progress, an honest substitute for ADR-0008's originally-specified
  server-side async pipeline, not a disguised version of it. The fair-
  play invariant (`Game.analysisAllowed`, `canAnalyze`) is real and
  checked server-side before any analysis is persisted, even though only
  one game source (Stockfish) exists today to exercise it. Guests still
  see the labeled demo only — real analysis needs a signed-in session to
  own the persisted `Game` row. Deliberately incomplete, matching
  ADR-0008's own explicit instruction not to build the entire
  personalised-analysis system in one pass: 5 of the taxonomy's 8
  mistake detectors are undetected (need move-history-pattern analysis,
  static-exchange sophistication, a back-rank mate-pattern detector,
  endgame logic, or clock data this app doesn't track — not faked with
  weak heuristics), recommendation ranking is scoped to a single game
  (no cross-game `RecurringMistakePattern` table exists), and there's no
  PGN import or game-history revisit page yet. See `docs/roadmap.md`'s
  Phase B entry for the full breakdown.
- **The `Practice` aggregation page ADR-0008 describes, previously unbuilt
  beyond a single principle's pool (`/practice/[principleId]`), now
  real**: `/practice` (`components/PracticeHub.tsx`) lists every unit's
  puzzle pool in one place — unlocked ones linking to
  `/practice/[principleId]`, locked ones showing why (mirroring
  `LearningPath.tsx`'s own per-principle "Practice puzzles" row, not a
  reimplementation of its logic) — plus a "Review needed" section for any
  concept that's regressed to `struggling`, the same signal
  `LearningPath.tsx`'s home page already surfaces. Built by extracting
  two pieces of `LearningPath.tsx` logic into shared modules rather than
  duplicating them for a second consumer: `statusOf`/`unlockReason`/
  `CoreStatus` into `lib/lessonStatus.ts`, and the guest-progress
  localStorage fallback effect into `lib/useEffectiveCompletions.ts`.
  Both extractions were verified behavior-preserving by rerunning
  `e2e/learning-path.spec.ts` unmodified immediately after each one (all
  8 tests passing both times) before building `PracticeHub` on top of
  them — a refactor is only as trustworthy as the regression check run
  right after it, not assumed safe because the diff looks mechanical.
  `Nav.tsx`'s "Practice" item now links to the real route instead of
  showing a disabled "Soon" badge (Progress is unchanged — still no real
  page). New E2E coverage (`e2e/practice-hub.spec.ts`) uses the
  established login-based `db-helper.mjs` pattern (`create-user` +
  `/login`, `seed-completions`, `set-mastery`) to stay under the shared
  signup rate-limit budget, same reasoning as `remediation.spec.ts`.
  Honest scope cut, unchanged from before this pass: this is course
  puzzles + mastery reviews only — ADR-0008's fuller pool (game-derived
  positions, spaced repetition, weak-skill training, saved positions)
  still needs Phase B's game analysis and Phase C's spaced repetition
  infrastructure, neither of which exists yet.
- **`docs/learner-model.md`'s struggling-learner remediation flow, previously
  unbuilt beyond ADR-0007's per-exercise recovery, now real**:
  `/review/[principleId]` (`components/RemediationRunner.tsx`) — a
  shortened reteach (reusing `ExplainStep`, capped at 2 steps pulled from
  the struggling concept's own sub-lessons) followed by 2-3 easier
  puzzles (reusing `PuzzleRunner`, now with optional
  `heading`/`completionTitle`/`completionMessage`/`completionHref`/
  `completionLinkText` props so a second caller can reframe its
  completion screen without duplicating the component), then a link back
  to retry the principle. Gated server-side on the concept having *any*
  `UserConceptMastery` evidence at all — not, as first built, strictly
  `status === "struggling"`. That stricter gate caused a real, live bug:
  recording a puzzle attempt is a Server Action, and Next.js refreshes
  the current route's Server Components after one resolves, so a learner
  answering the very first easier puzzle correctly could immediately
  flip status struggling → recovered (or, one puzzle later, all the way
  to proficient — `computeMasteryStatus`'s ordinary accuracy-based
  branches, doing exactly what they're supposed to) and get redirected
  to "/" mid-round before ever seeing the second puzzle or the
  completion screen — confirmed live via Playwright (four consecutive
  deterministic reproductions, not a one-off flake) before landing on
  the fix actually shipped: gate on evidence existing at all, then treat
  `/review` the same way `/practice/[principleId]` already treats its
  own pool — reachable once relevant, repeatable afterward, not a
  one-shot gate — since extra reteach-and-practice for a concept already
  engaged with is harmless even once no longer struggling. Required zero
  changes to `lib/masteryModel.ts` itself — `struggling → recovered →
  proficient` was already reachable and unit-tested; this flow is the
  delivery mechanism that helps a learner actually produce the correct
  follow-up attempts those transitions trigger on, not a second
  implementation of them. One adaptation from the doc's literal wording:
  it describes remediation as
  following "failing a Principle's mastery challenge," but no principle
  in this codebase has its own distinct mastery-challenge lesson (only
  whole *units* do, e.g. `meet-the-pieces.12-unit-mastery-challenge`) —
  so this implementation triggers off the already-real, already-tracked
  `struggling` status instead (evidenced by repeated wrong answers, the
  9-state table's other documented entry path for that state), and
  "retry" means the principle's own first sub-lesson, not an
  as-yet-nonexistent per-principle challenge.
- **New db-helper.mjs commands (`create-user`, `set-mastery`) avoid
  spending from the signup rate-limit budget for tests that only need a
  signed-in session**, not the signup flow itself: the E2E suite's total
  signup count across every spec file was already at exactly
  `SIGNUP_LIMIT`'s cap (20/hour) after the puzzle-pool work — confirmed
  by two separate real CI failures this session when new signup-based
  tests pushed a full run over it (see the two prior "Resolved this
  session" entries below). Rather than trim further, `create-user`
  creates an account directly (bcrypt-hashed, matching `hashPassword`)
  and the test logs in via `/login` instead of `/signup`, drawing from
  the separate, much-less-utilized login rate-limit budget instead.
- **ADR-0008's `Puzzle` pool extended to all three curated units**
  (`check-and-checkmate`, `basic-tactics` — `meet-the-pieces` was the
  prior session's pilot): 6 puzzles for `check-and-checkmate` (2 per
  principle: recognizing check, recognizing checkmate, thinking under
  check) and 2 for `basic-tactics` (its one principle, the knight fork —
  reusing the exact two fork positions already proven in
  `lesson-01-the-knight-fork.json`, not new/unverified ones). No app code
  changes were needed — `lib/puzzles.ts`, the `/practice/[principleId]`
  route, and `LearningPath.tsx`'s puzzle-pool row are all unit-agnostic,
  same as `lib/principles.ts` was when the Principle hierarchy itself
  generalized. Beyond the standard chess-legality check (move is legal),
  the check/checkmate/fork claims were independently verified against
  the engine (`inCheck`/`gameStatus` after the move, and the resulting
  knight's attacked-square list for the forks) since `validatePuzzle`
  only confirms a move is *legal*, not that it delivers what the prompt
  claims. New E2E coverage (`puzzle-practice.spec.ts`) proves the pattern
  generalizes across units using DB-seeded lesson completions rather than
  re-driving each unit's real lessons through the UI a second time (their
  own content is already covered by other specs) — one additional
  signup, not three, for the same rate-limit reasons as the pilot's own
  test consolidation.
- **ADR-0008's `Puzzle` pool, previously unbuilt, now real for the pilot
  unit**: `packages/content/puzzles/meet-the-pieces.json` has 14
  chess-legality-validated puzzles (2 per principle), served at
  `/practice/[principleId]` (`components/PuzzleRunner.tsx`), gated
  server-side on the principle's sub-lessons being complete (mirroring
  `app/learn/[lessonId]/page.tsx`'s pattern, not just hidden from the UI
  — confirmed live: direct URL navigation before completing the
  sub-lessons redirects). Each attempt is a real `ExerciseAttempt` row
  (`ExerciseAttempt.lessonId` made nullable, `puzzleId` added — additive
  migration, `packages/db/prisma/migrations/20260818033803_add_puzzle_attempts`)
  feeding the same per-concept mastery recompute lessons use
  (`recomputeMasteryForConcepts` in `app/actions.ts`, extracted from what
  was lesson-only logic). This is also what finally makes
  `practising`/`ready-for-assessment` reachable in
  `lib/masteryModel.ts`'s `computeMasteryStatus` — previously
  structurally unreachable for lack of puzzle evidence, not a bug. The
  extension is additive by construction: an `AttemptEvidence.source` tag
  defaults to "lesson" when absent, `proficient` still fires from overall
  accuracy exactly as before regardless of source, and every one of the
  9 pre-existing unit tests (plus a new one asserting the no-`source` and
  explicit-`source:"lesson"` cases produce identical results) passes
  unmodified. Verified end to end with Playwright against a real
  Postgres row, not just unit-tested in isolation:
  `e2e/puzzle-practice.spec.ts` signs up, completes real lessons, solves
  a puzzle through the actual board UI, and a direct `psql` query
  confirmed the `ExerciseAttempt` row and resulting `proficient` status
  landed correctly. `check-and-checkmate` and `basic-tactics` still have
  empty `puzzleIds` (same "one unit fully before generalizing" order the
  Principle hierarchy itself followed), and the shared `Practice`
  aggregation page ADR-0008 describes is still not built — today's route
  is one principle's pool, not the cross-source aggregate.
- **Two real progression bugs, found via direct Playwright reproduction of a
  user-reported "lesson 3 stays locked after a perfect run" report, not
  assumed from reading code**: the reported scenario didn't reproduce for
  a signed-in account (verified fresh, live, before assuming anything),
  but two related bugs did, both now fixed with regression tests
  (`e2e/progression-guard.spec.ts`):
  - **A guest could never unlock a principle-gated lesson, ever, no
    matter how well they performed.** `LearningPath.tsx`'s `statusOf`
    derived an `effectiveConceptMastery` value that was always exactly
    equal to the raw `conceptMastery` prop (its only "special casing"
    branch produced the same `null` guests already had), so the
    principle-proficiency gate had no actual guest exception despite a
    comment claiming one existed — missing mastery data (guests have
    none, no session to track it against) read as "checked and not
    proficient" instead of "nothing to check." The server-side route
    guard (`app/learn/[lessonId]/page.tsx`) already correctly scoped
    this check to `if (user && ...)`; the client-side display logic
    didn't match it. Fixed by removing the pointless derived variable
    and gating the principle check itself on whether real
    session-backed mastery data exists (`conceptMastery !== null`), in
    both `statusOf` and `unlockReason`.
  - **Signing up after guest play could re-lock a lesson the guest could
    already reach.** `migrateGuestProgress` (`app/actions.ts`) wrote
    `LessonCompletion` rows only, never `UserConceptMastery` — so a
    guest who'd unlocked further content (before the bug above existed,
    or once it's fixed) would find it locked again immediately after
    creating an account, since the signed-in gate *does* check
    proficiency and found nothing. Fixed by running each migrated
    lesson's `masteryTags` through the exact same
    `recordAttemptsAndUpdateMastery` path a live completion uses,
    synthesizing attempts from the one real signal guests do have
    (`mistakes` wrong attempts, then one correct one, per concept) —
    not a separate ad hoc calculation.
- **Replay-XP policy, now explicit**: replaying a completed lesson
  **cannot** farm XP. `completeLessonAction` `upsert`s a single
  `LessonCompletion` row per `(user, lesson)` — a replay *updates* that
  row's `xpEarned` to the new run's value, it never creates a second row
  or adds to the total. Since a lesson's max XP is fixed (same graded
  steps, same per-step award, same completion bonus, every run), no
  sequence of replays can push total XP above what one completion of
  every lesson already grants. Verified directly against the database in
  `cross-unit-progression.spec.ts` (exact row count and total XP,
  unchanged after a replay) — this was a deliberate, existing design
  choice being confirmed and documented, not a new change.
- **9 graded exercise steps across 3 lessons fell back to a bare "+5 XP"**
  on a correct answer instead of an explanation of why it was correct
  (`successExplanation` was simply absent) — `basic-tactics/lesson-01`
  (4 steps), `check-and-checkmate/lesson-01` (2 steps), and the
  non-curated `step-type-preview` demo lesson (3 steps). All 12
  `meet-the-pieces` lessons and `check-and-checkmate/lesson-02` already
  had one on every graded step. Fixed by authoring one for each. Two
  further steps (one real, `check-and-checkmate/lesson-03`'s
  `guided-sequence`; one in the demo lesson) had no schema field to hold
  one at all — `GuidedSequenceStepSchema` gained an optional
  `successExplanation`, and `GuidedSequenceStep.tsx` was wired to
  actually render it (the schema previously silently stripped the field
  even if content had authored it, since `ExerciseStepSchema`'s
  discriminated union has no `.passthrough()`). Lesson `objectives`
  arrays were audited across all 17 files for grammar/punctuation —
  found genuinely clean (one consistent house style throughout, no
  errors), so nothing needed changing there.
- **`pnpm lint` could not run at all** — `next lint` had no committed
  ESLint config anywhere in the repo (confirmed via git history, not
  assumed) and prompted interactively on first run, which can't complete
  in a non-TTY environment. Added `eslint`, `eslint-config-next`, and
  `@eslint/eslintrc` as real devDependencies (pinned to versions matching
  the installed Next.js, `^15.5.23`, not whatever the registry's default
  tag resolved to — an unpinned install pulled in `eslint-config-next@16`
  with unmet peer-dependency warnings against it) and a standard
  `eslint.config.mjs` (`next/core-web-vitals` + `next/typescript`, the
  same setup `next lint`'s own interactive "Strict" option would have
  generated). Running it for the first time surfaced four real,
  previously-invisible issues, all fixed: two unescaped-entity JSX errors
  (`app/account/page.tsx`, `components/LessonRunner.tsx`), one stale
  `eslint-disable` comment suppressing a warning that no longer applied
  (`components/PlayRunner.tsx`), and two `<img>` elements missing the
  same "tiny static vector art" suppression comment `Board.tsx`'s
  identical pattern already carries. `pnpm lint` is now clean.
- **Cross-unit progression had no test coverage** — every progression
  test exercised only `meet-the-pieces`, and the gating code being
  unit-agnostic isn't the same claim as it being verified across a real
  unit boundary. Added `e2e/cross-unit-progression.spec.ts`: real UI
  completion of `meet-the-pieces.12-unit-mastery-challenge` (the unit's
  actual final/mastery-check lesson, all 9 graded steps) unlocking
  `check-and-checkmate.01`; `basic-tactics` verified locked both before
  *and* partway through `check-and-checkmate` (only its own final lesson
  unlocks the third unit, not "some progress" in the second); a locked
  lesson's learning-path row confirmed to render no `<a>` at all (not
  just a redirect on direct URL entry, a separate claim); a hard reload
  re-verified against the server, not a client cache; replaying a
  completed lesson checked against the database directly (exactly one
  `LessonCompletion` row, unchanged total XP), not just the UI's word for
  it; the dev-only reset control checked the same way (zero
  `LessonCompletion`/`UserConceptMastery`/`ExerciseAttempt` rows
  afterward, every unit re-locked). Meet-the-pieces lessons 2–11 are
  seeded directly rather than clicked through — their content is already
  covered elsewhere; what this file adds is boundary behavior, which only
  needs them *completed*. Seeding uses a standalone helper script
  (`e2e/db-helper.mjs`), not a direct `@movewise/db` import in the
  `.spec.ts` file — Playwright's own test transform can't load Prisma
  7's ESM-generated client (confirmed: plain `node` run from `apps/web`
  loads it fine, so this is a Playwright/esbuild interop gap, not a
  product issue), so the seeding calls shell out to a plain Node script
  instead.

- **Board-loading flash, feedback design, lesson-progression states, and
  Play & Learn's information architecture** — a product-review pass
  across six areas:

- **Board-loading flash, feedback design, lesson-progression states, and
  Play & Learn's information architecture** — a product-review pass
  across six areas:
  - **Board stabilization**: preloaded all 12 piece SVGs
    (`app/layout.tsx`'s `<link rel="preload">` tags) so the starting
    position never visibly assembles piece-by-piece on a cold cache — no
    entrance animation exists to begin with, and `prefers-reduced-motion`
    already collapses the feedback/star animations that do (verified,
    not just read from CSS). Added `e2e/board-regression.spec.ts` (12
    tests at the three required device widths: 1440×900, 1024×768,
    390×844) asserting 64 equal 1:1 squares, exactly 32 fully-decoded
    starting pieces sized 82–90% of their square, no page-level
    horizontal overflow, and no piece-count growth between first paint
    and network-idle — on top of the existing `chessboard-geometry.spec.ts`.
  - **Touch targets**: `.mw-btn`, `.mw-order-item`, `.mw-segmented-option`,
    `.mw-icon-btn`, `.mw-nav-item`, and `.mw-lesson-exit` all now have an
    explicit 44px minimum (several were ~32–40px) — real WCAG 2.5.5
    findings, not a redesign. The chessboard's own squares are the one
    accepted exception: an 8-wide board on a 390px phone is inherently
    ~44px/square at best, and enlarging the board to guarantee more would
    break the "board stays within the viewport" requirement instead.
  - **Feedback design**: `StepFooter.tsx` now shows a correct answer's
    explanation *and* its XP together (previously one or the other), plus
    a filled circular icon on both correct/incorrect banners. Fixed a
    real contrast bug: light-mode `--mw-warning-ink` measured 4.05:1
    against its own background, under the 4.5:1 AA floor for text that
    size (`--mw-badge--warning`); now 5.71:1.
  - **Reference lesson**: `meet-the-pieces.01-welcome` rebuilt onto the
    full template (objective → explanation → guided exercise → independent
    exercise → mistake correction → recap → completion/XP) — a second,
    hint-free `select-square` step and a `true-false` step were added
    alongside the original guided one, plus a `review` recap step. Every
    correct/incorrect path has a specific, misconception-level
    explanation (e.g. "That's Black's queen — she stands right next to
    the king, same as on White's side," not "Try again"). Updated every
    E2E spec that drove this lesson's old 3-step shape (`lessons.spec.ts`,
    `accessibility.spec.ts`, `auth.spec.ts`, `account.spec.ts`,
    `learning-path.spec.ts` — 8 call sites) to the new 6-step one and its
    new XP total (15 → 30, since `xpReward` also went 10 → 15).
  - **Progression states**: extended the learning path from 3 states
    (locked/available/completed) to 5 (+ in-progress, + mastered) without
    touching the gating logic those three already correctly drove —
    `LearningPath.tsx` layers "in-progress" (`lib/lessonProgressUI.ts`, a
    client-only "started" signal, never gates anything) and "mastered"
    (a completed lesson's own 3-star performance — a lesson-level
    distinction from `MasteryStatus`'s unrelated concept-level `mastered`
    state, which stays Phase-C-only as before) on top of the existing
    three. Locked rows now show *why* ("Unlocks after 'X'" /
    "Unlocks once 'Y' is proficient"), not just a lock icon. Added a
    development-only progress-reset control (`DevResetControl.tsx`,
    `devResetProgressAction` in `app/actions.ts`) guarded twice — the
    component only renders under a server-side `NODE_ENV === "development"`
    check in `app/page.tsx` (dead-code-eliminated from a production
    build), and the Server Action itself independently re-checks
    `NODE_ENV`, since an action is a real callable endpoint regardless of
    what the client renders.
  - **Learning-path visuals**: added a local (not yet server-tracked)
    daily-goal/streak strip (`lib/streak.ts`, `DailyGoalStrip.tsx`), a
    "Review needed" section surfacing principles whose concept mastery
    has regressed to `"struggling"` (real signal already computed by
    `lib/masteryModel.ts`, not new data), and a "Chapter complete" badge
    once every lesson in a unit is done.
  - **Play & Learn hierarchy**: relabeled the page's own copy and
    structure into the explicit "1. Play a game / 2. Review the game /
    3. Recommended lessons" sequence the brief asked for, replacing a
    bare "Soon" badge. Built the typed data model for real game review
    (`lib/gameAnalysis.ts`'s `MoveAnalysis`/`GameReview`, matching
    `packages/engine`'s existing `EngineAnalysis.score` shape so a real
    implementation can slot in later) and a clearly-labeled demo
    (`GameReviewDemo.tsx`, a "DEMO" badge plus explicit "not a real
    engine review of the game you just played" copy) built from fixed,
    hand-authored sample moves — deliberately *not* derived from the
    game the learner just played, since faking evals from their real
    moves would look more like genuine analysis, not less. Recommended
    lessons in the demo link to real, existing lesson ids. The file's own
    doc comment lists the concrete remaining integration work (persist
    `Game` rows, call `engine.bestMove` before/after each real ply,
    classify from real eval swings, map mistakes via
    `docs/concept-taxonomy.md`) — none of it built this pass.

  Verified: `pnpm typecheck`/`test`/`validate:content`/`build` all pass;
  the full E2E suite (98 tests, including 2 new files —
  `board-regression.spec.ts`, `dev-tools.spec.ts` — and additions to
  `play-mode.spec.ts`) passes against real local Postgres; manually
  driven with Playwright through signup → lesson completion → reload →
  persistence → next-lesson-unlock → locked-lesson block → dark mode →
  Play & Learn's full demo-review flow, with console errors monitored
  live (one real one found and fixed: no `favicon.ico`/app icon existed
  at all, now `app/icon.svg`). Screenshots taken at 1440×900, 1024×768,
  and 390×844 in both themes.

  Not done, and not claimed as done: no visual-design rewrite of the
  learning path beyond the additions above (the existing "clean course
  outline" direction, `docs/design/visual-directions.md`'s Direction A,
  was kept rather than replaced); no unit-specific E2E coverage for the
  `check-and-checkmate`/`basic-tactics` progression states (they share
  the exact same unit-agnostic code path already covered against
  `meet-the-pieces`); `pnpm lint` still can't run in this environment
  (see the entry above — pre-existing, not new).

- **`check-and-checkmate` and `basic-tactics` were still the flat
  `Unit → Lesson` shape** (ADR-0008 Phase A): both units now have a
  `packages/content/principles/{unitId}.json` file — `check-and-checkmate`
  gets 3 principles (`recognizing-check` → `check`,
  `recognizing-checkmate` → `checkmate`, `thinking-under-check` →
  `decision-making`), `basic-tactics` gets 1 (`the-knight-fork` →
  `knight-fork`, the most specific concept in that unit's
  `tactics`/`fork`/`knight-fork` hierarchy, chosen the same way
  `meet-the-pieces`' principles each pick their most specific matching
  concept). Every affected lesson got a matching `principleId` back-
  reference. No `apps/web` code changes were needed — `lib/principles.ts`
  and `LearningPath.tsx` were already written to branch on principle-file
  presence per unit, exactly so this could be a content-only change.
  `pnpm validate:content`, `typecheck`, and `test` all pass; two stale
  code comments (`lib/principles.ts`, `LearningPath.tsx`) and three docs
  (`docs/architecture.md`, `docs/testing-strategy.md`, this roadmap
  reference) that said "meet-the-pieces only" were updated to match.
  Deliberately not done in this pass: no new unit (`check-and-checkmate`,
  `basic-tactics`)-specific E2E tests — the unlock/grouping mechanism
  they'd exercise is unit-agnostic code already covered against
  `meet-the-pieces` in `e2e/learning-path.spec.ts`, and no `Puzzle`
  content exists yet for either unit (unchanged from before this pass).
- **Lesson completion alone unlocked the next principle** (ADR-0008
  Phase A): `meet-the-pieces` is now restructured into 7 principles with
  a real `Concept` taxonomy (`packages/content/concepts.json`,
  `packages/content/principles/meet-the-pieces.json`), and a principle's
  first sub-lesson now requires the *previous* principle's concept to be
  `proficient` in a new `UserConceptMastery` table — not just its lessons
  present in `LessonCompletion` — enforced server-side and mirrored in
  the learning-path UI. Every exercise attempt (not just lesson-level
  aggregates) is now persisted (`ExerciseAttempt`), the concrete first
  step `docs/learner-model.md` had flagged as not yet built. Deliberately
  incomplete, not an oversight: only 5 of the 9 mastery states are
  reachable without a `Puzzle` pool or Play & Learn game data (neither
  exists yet), and `check-and-checkmate`/`basic-tactics` haven't been
  restructured into principles yet. See `docs/roadmap.md`'s Phase A.
- **Interactive exercises had no visible instruction** — every
  board-interaction step type (`select-square`, `move-piece`, `capture`,
  `find-legal-move`, `find-check`/`find-checkmate`, `guided-sequence`)
  lacked a `prompt` field entirely; the learner had to open a hint just
  to find out what they were being asked to do. Affected all 17 lesson
  files. Found via an external product review, verified against the real
  schema/renderer before treating it as fact rather than assumed true.
  Fixed at the schema level (`prompt` now required, `.min(1)`, so a
  future lesson missing one fails `validate:content`/CI), not per-lesson.
  See ADR-0007.
- **Stale hints stayed visible after a correct answer** — `activeHint`
  (and its board highlight/arrow) wasn't gated on step status, so a
  revealed hint sat right below the "Correct!" banner. Fixed by gating on
  `status !== "correct"`. See ADR-0007.
- **Stars ignored hint usage** — a zero-mistake run that used hints, even
  the solution-reveal level, still showed 3 stars, since `hintsUsed`
  wasn't tracked at all. Added `LessonCompletion.hintsUsed` and switched
  to `starsForPerformance(mistakes, hintsUsed)`. See ADR-0007 (supersedes
  ADR-0004 on this point).
- **Locked lessons were reachable by direct URL** — the learning path UI
  hid/disabled locked lessons, but the lesson route itself never checked
  prerequisites, so a signed-in learner could open any lesson id
  directly. Fixed with a server-side prerequisite check + redirect on
  `/learn/[lessonId]`, scoped to authenticated users (guests keep the
  existing client-side localStorage-based lock). See ADR-0007.
- **Zero hearts had no recovery path** — reaching zero just left an
  unbounded floor with no reteach step. Added a guided recovery
  interstitial (reteach pulled from the lesson's own most recent
  explanation, then hearts partially restored to retry the same
  exercise) — still never a hard lockout, still nothing payment-related.
  See ADR-0007.
- **SQLite in production would not work**: migrated to Postgres, hosted
  on Supabase (ADR-0005) — resolving open decision #1 in
  `docs/roadmap.md` once the user chose to (hosting/cost was the genuinely
  open question, not something to pick unilaterally). Along the way,
  Supabase's own tooling flagged Row-Level Security as disabled on the
  new tables — a real exposure via Supabase's auto-provisioned public
  REST API, even though this app doesn't use that API at all. Surfaced to
  the user with the remediation SQL shown, not auto-applied, per the
  tool's own instructions; they chose to enable it. **Still open**: a
  real production `DATABASE_URL` (Supabase never exposes the DB password
  via API — the user needs to get it from their dashboard) and an actual
  deploy of the app itself; ADR-0005 lands the data layer only.
- **No accessibility test automation**: `e2e/accessibility.spec.ts` runs
  `@axe-core/playwright` (scoped to WCAG 2.0/2.1 A and AA rules, not
  axe's full best-practice set) against the home page, login/signup, a
  lesson mid-flow, the completion screen, Play mode, and `/account`.
  Writing it immediately found two real bugs in `Board.tsx` — a
  `role="gridcell"` with no `role="row"` ancestor (ARIA requires one;
  fixed with `display: contents` row wrappers that don't disturb the CSS
  Grid layout they sit inside), and `aria-pressed` used on a gridcell,
  which isn't an ARIA-allowed attribute for that role at all (fixed by
  switching to `aria-selected`, the ARIA-correct selection state for a
  grid cell) — both invisible to the by-eye verification this project
  relied on before, and both fixed properly rather than suppressed via a
  rule exclusion.
- **The chess-legality validator's own logic had no dedicated unit
  tests**: `packages/exercise-schema/src/validate-chess.test.ts` (22
  tests) now exercises `checkStep`'s branches directly — illegal-FEN
  short-circuiting, check/checkmate-delivering-square computation, the
  order-steps permutation check, move-piece/capture/find-legal-move
  legality checks, the guided-sequence forced-reply-application fix (see
  below), and the deliberate move-piece-only scoping of hint-arrow
  legality checks — instead of relying only on real lesson content
  happening to trip them. Several fixtures reuse the exact FEN/move data
  from real, already-validated lessons, so a "this should pass" case is
  checked against data independently known correct, not just internally
  consistent with itself.
- **No account export or deletion**: `/account` (linked from the
  signed-in home page) offers both. Export is a Route Handler
  (`app/account/export/route.ts`, not a Server Action — it needs to hand
  back a real downloadable file with response headers) returning the
  account's email, creation date, and every lesson completion as JSON.
  Deletion (`deleteAccountAction`) requires re-entering the password
  (verified server-side before anything happens) plus a native
  `window.confirm()` on the client as a second, independent guard against
  an accidental click; a single `prisma.user.delete` cascades to Session
  and LessonCompletion (`onDelete: Cascade` on both relations in
  `schema.prisma` already), so nothing is left orphaned. Verified: a new
  E2E spec drives both flows for real, including asserting that
  dismissing the confirm dialog leaves the account intact and that a
  login attempt after deletion fails — not just that the button exists.
- **Guest progress isn't persisted anywhere**: `lib/guestProgress.ts`
  writes completions to `localStorage` for signed-out learners
  (best-effort — silently no-ops if storage is unavailable, e.g. private
  browsing), and `LearningPath` now reads it back so guests get the same
  prerequisite-based locking and star display as signed-in users, instead
  of the old "everything unlocked, nothing remembered" guest view. On
  signup or login, that local progress is sent as a hidden form field and
  folded into the account server-side (`migrateGuestProgress` in
  `app/actions.ts`) in the same request that creates the session — validated
  and range-clamped there, since it's client-controlled input, and merged
  with the same best-mistakes rule as a repeat signed-in completion so it
  can never downgrade progress the account already has. Applies to login
  as well as signup: signing into an *existing* account from a browser
  with local guest progress carries it in too, on the same "this device's
  progress is mine" assumption most products with guest modes make.
  Verified: the E2E suite's guest-locking test needed updating for the
  new (deliberately different, more useful) guest-locking behavior — a
  fresh guest with zero completions now sees the same locked/unlocked
  state as a fresh account, not everything open — plus a new test driving
  the full guest-completes-a-lesson → signs up → sees it migrated flow.
- **No dependency scanning**: `.github/dependabot.yml` now watches both
  the npm ecosystem (root `package.json`/`pnpm-lock.yaml`, which
  Dependabot resolves across the whole pnpm workspace — no per-package
  config needed) and `github-actions` (the workflow file's own pinned
  action versions), weekly. Security-update PRs are never batched;
  routine version bumps are grouped into one PR to keep noise down for
  a small team.
- **No rate limiting on login/signup**: started as an in-memory sliding-
  window limiter — 20 signups/hour per IP, 15 logins/15min per IP, and 8
  logins/15min per email (the last one to catch credential stuffing
  distributed across IPs against a single account); the signup limit
  started at 5/hour and was raised to 20/hour after the full local E2E
  suite itself tripped it (every local test request shares the same
  `"unknown"` IP bucket with no reverse proxy in dev, so a suite doing 7
  signups across its specs is exactly the shared-bucket scenario the
  limiter needs to tolerate, not an edge case to special-case away).
  Documented from the start as a stopgap, for two reasons: per-process
  state doesn't survive a restart or share state across instances, and
  every key can collapse many real, unrelated users into one bucket
  (shared NAT — a school computer lab is exactly this product's
  audience — or any deploy without a reverse proxy setting
  `x-forwarded-for`).
  **Escalated to High priority and then fixed in the same pass**: writing
  `docs/deployment.md` (Vercel, the actual planned target) made the first
  reason concrete rather than theoretical — serverless functions don't
  share memory between invocations at all, so the in-memory version would
  have been close to a no-op in production as actually deployed, not just
  "a stopgap." `apps/web/lib/rate-limit.ts` is now backed by a
  `RateLimitHit` Postgres table (one row per attempt; a key's count is a
  `COUNT(*) WHERE key = ? AND createdAt > window-start`), made possible
  without new infrastructure specifically because ADR-0005 had already
  given the app a real shared database. Still imperfect, on purpose, not
  by oversight: rows for a key that's hit exactly once and never returns
  are cleaned up only opportunistically on that key's *own* next hit, so
  a key that never returns leaves one permanent row — acceptable at this
  app's current scale (each row is a cuid, a short string, and a
  timestamp), not a real cleanup job. Verified: a direct check against
  real local Postgres (blocking at the limit, correct `retryAfterMs`,
  access restored after the window passes, independent keys not sharing
  state, cleanup actually deleting old rows) plus the full 24-test E2E
  suite (real signup/login flows exercising the limiter live) both green.
- **No E2E suite was committed to the repo**: `apps/web/e2e/` now has 8
  real `@playwright/test` specs (14 tests at the time this landed — see
  `docs/testing-strategy.md` for the current count) covering lesson
  flows across all 13 exercise-step types, the retry-bug fix, hearts,
  mastery stars, learning-path locking, auth, and Play mode — promoted
  from this session's scratch verification scripts, and wired into CI as
  a second job (`e2e`, browsers installed fresh each run). Writing this
  suite immediately surfaced a real bug (see below) that ad hoc
  scratch-script testing had never caught, which is exactly the point of
  committing it.
- **Missing lesson-completion feedback**: clicking "Finish lesson" called
  the persistence action but showed nothing and navigated nowhere — a
  real gap against the brief's explicit "completion feedback" and "lesson
  completion screens" requirements (Sections 7–8), not just a missing
  nicety. Found while writing the E2E suite (a test asserting
  `waitForURL("/")` after finishing timed out) — every earlier manual/
  scratch-script check happened to `page.goto("/")` explicitly afterward
  instead of asserting on real navigation, so it went unnoticed. Fixed
  with a real completion screen (star rating, XP earned, a link back to
  the learning path) in `LessonRunner`.
- **No CI**: `.github/workflows/ci.yml` now runs install (frozen lockfile),
  typecheck, unit tests, content validation, and a real production build
  on every push/PR — the exact sequence that was previously only run
  manually. Verified locally first with a true clean-checkout simulation
  (local `.env`/`.env.local` temporarily moved aside) before trusting the
  workflow file, since CI has no local env files to fall back on.
- **Stuck-state bug**: every board-click exercise type could get
  permanently stuck after a wrong answer, including on the *correct*
  answer clicked immediately after. Existed since these exercise types
  were first built; found and fixed during the `LessonRunner` component
  split. See that commit's message for the full root-cause writeup.
- **Prisma 7 + webpack + native bindings**: `better-sqlite3`'s native
  binary lookup broke under webpack bundling; switched to
  `@prisma/adapter-libsql` and added an explicit `webpack.externals`
  override (Next's built-in `serverExternalPackages` doesn't work for
  symlinked pnpm workspace packages). See ADR-0002. **That `externals`
  override itself later caused a real production bug** — see the
  "first real Vercel deploy returned a 500 on every request" entry
  below and ADR-0006; it was removed.
- **First real Vercel deploy returned a 500 on every request**:
  `Error: require() of ES Module` — Vercel's serverless runtime loads
  externalized dependencies via CommonJS `require()`, which can't load
  `@movewise/db` (an ES Module package). The `webpack.externals`
  override that caused this (ADR-0002) only made sense for
  `better-sqlite3`'s native bindings, which `@prisma/adapter-pg` doesn't
  have (ADR-0005) — the override should have been removed then, but
  nothing forced re-examining it, and every local build/dev/CI run kept
  passing regardless, since a plain `next start` never reproduces this
  (confirmed directly). Fixed by removing the override and letting
  webpack bundle `@movewise/db` normally, like every other workspace
  package. See ADR-0006 for the full writeup — including the broader
  lesson that a successful local build and `next start` don't prove a
  Vercel deployment will work. Verified by rebuilding, confirming
  `next start` still serves correctly (as expected — it never showed
  the bug), and running a real Server Action (signup) against that
  production server to exercise the exact import path that broke on
  Vercel, since that's the strongest check available without direct
  access to Vercel itself (blocked by this environment's network
  policy).
- **Guided-sequence validator gap**: the content validator checked
  player-move legality without ever applying the scripted opponent
  replies between them, which could produce false legality results on
  any sequence where a reply changes what's legal next. Fixed when the
  5 previously-unrendered exercise types were built out.
