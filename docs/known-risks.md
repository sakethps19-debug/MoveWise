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
- **Every Vercel Preview deployment (one per open PR) reads and writes
  the real production database.** Confirmed, not suspected — see
  `docs/deployment.md`'s step 3 for the evidence (one Supabase project,
  zero database branches, identical Postgres host in both Preview's and
  Production's build logs). No auth gate was observed on Preview URLs
  either, so anyone with a PR's Preview link — a reviewer clicking
  around, a link shared for feedback — is signing up, completing
  lessons, or deleting accounts against real user data, indistinguishable
  from a genuine visitor. Fix is a Vercel/Supabase configuration change
  (give Preview its own database via Supabase branching, or unset
  Preview's `DATABASE_URL`), not a code change — see `docs/deployment.md`
  for the specific recommendation. This is also why the E2E suite
  deliberately never targets a Preview URL (`docs/e2e-testing.md`).

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

## Resolved this session, kept here for the record

- **A real, live lesson had a chess-illegal position** —
  `meet-the-pieces/lesson-03-meet-the-rook.json`'s step-3 FEN
  (`4k3/8/8/8/3pR3/8/8/4K3 w - - 0 1`) put Black's king on e8, directly on
  the White rook's open e-file, with White to move — meaning Black's king
  was already in check before White's own move, an unreachable game state
  (Black's previous move would have had to leave their own king in
  check, which chess disallows). Not found by inspection or a bug
  report — found by tightening `isLegalFen`
  (`packages/chess-rules`) to actually check for this, a gap
  `docs/content-authoring-guide.md` had documented as real but uncaught
  ("chess.js won't catch this") since chess.js's own strict FEN loader
  only rejects structural impossibilities, not unreachable-but-
  structurally-valid positions. Fixed by moving the black king to a8,
  off the rook's file — the step's actual content (capturing the pawn on
  d4) was entirely unaffected, confirmed by `pnpm validate:content`
  going from 1 issue to 0 and a full local E2E re-run (every spec that
  touches this lesson) staying green.

- **Guests could still open a locked lesson by direct URL** — a real,
  confirmed gap in the fix this file's own earlier entry ("Locked
  lessons were reachable by direct URL") described as already closed
  for guests via "the existing client-side localStorage-based lock."
  That description oversold what actually existed: `LearningPath.tsx`
  only *hid/disabled* a locked row in the UI — nothing on the
  `/learn/[lessonId]` route itself ever checked a guest's real progress.
  The server-side prerequisite check added by that earlier fix is
  explicitly scoped `if (user && ...)`, since a guest has no session to
  check `LessonCompletion` rows against — which meant a guest typing a
  locked lesson's URL directly got the full lesson content immediately,
  no gate at all. `components/LessonGate.tsx` (new) closes this: a
  client-side check, since guest progress only exists in this browser's
  `localStorage`, unreadable from the server — reads real completions
  via the same `lib/guestProgress.ts` a genuine completion already
  writes to, and only reveals the lesson once its prerequisite is
  confirmed met, redirecting to the same `/?locked=...` banner the
  signed-in path already uses otherwise. Hydration-safe by construction:
  the gate always renders a neutral "Checking your progress…" state on
  first paint (matching what the server itself rendered, since neither
  knows yet), only reading `localStorage` after mount.
- **The `move-piece` "any legal move" steps could show a wrong
  explanation** — `MoveStep.tsx` always displayed a step's single
  hand-authored `successExplanation` regardless of which of several
  accepted destinations (`acceptAnyLegalMove` / `altValid`) the learner
  actually played. Real, confirmed instance: `meet-the-pieces.03-meet-
  the-rook`'s step-2 accepts any legal rook move, but its authored text
  ("straight along the e-file") is only true for the author's own
  primary answer (e4-e8) — a learner who instead played the equally
  correct e4-a4 (along the fourth rank, not the e-file) saw a factually
  wrong explanation. `describeMoveOutcome` (new, `packages/chess-rules`)
  generates an accurate sentence from the move actually played — same
  file, same rank (with correct ordinal wording for every rank, not just
  a hardcoded "4th"), diagonal, or a knight's own L-shape, naming the
  captured piece when there is one — used only when the played move
  doesn't match the step's primary `expectedMoves`, so the richer,
  hand-authored text is kept for the common path.
- **The Play & Learn demo review contained an impossible game** — Black
  moves (Nc6, Nge7, Ng6) were listed *after* the demo's own Qxf7#
  checkmate entry, and move numbers skipped and mixed ply/move counts
  (1, 2, 4, 6, 8, 10, 12). `buildDemoGameReview` now uses one
  completely legal, engine-verified line — the classic Scholar's Mate
  (1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7#) — with every ply replayed
  through `packages/chess-rules`' `tryMove`/`gameStatus` before being
  written (SAN taken from chess.js's own output, not hand-typed), real
  sequential move numbers for both colors, and evaluations that chain
  continuously from one move to the next. The game's own move list ends
  exactly where the real game does — nothing is listed after the
  engine-confirmed checkmate. A new `describe("buildDemoGameReview")`
  block in `gameAnalysis.test.ts` replays the whole thing through the
  real engine on every test run rather than trusting the hand-authored
  strings.
- **The Play & Learn board could overflow a shorter viewport** — a real,
  measured defect on a 12.9" iPad in landscape (1363x936 real usable
  height once Safari's own chrome is subtracted from the 1024px device
  profile): the board was sized from available WIDTH only
  (`PlayRunner.tsx` passed a fixed `maxWidth={720}` to `<Board>`), so its
  bottom edge landed around y=1148 — well past the 936px-tall viewport,
  with no way to see the full board without scrolling. `PlayRunner.tsx`
  now measures the real rendered layout (how far down the board starts,
  the real height of the player card below it, the real CSS gap between
  them — not a guessed pixel budget) on mount and on every resize, and
  caps the board at whatever square size actually fits the remaining
  vertical space, alongside the existing 720px width cap. A
  `@media (max-height: 820px)` rule also compacts the page's own fixed
  chrome above the board (hides the explanatory subtitle, tightens
  spacing) so the board has to shrink less in the first place.
- **Three real progress-loss bugs, all the same root cause: a Server
  Action fired without being awaited or having its failure handled.**
  Found by deliberately simulating a dropped connection
  (`page.route(...).abort()`) during an E2E-testing pass, not from a bug
  report — none had been noticed before because nothing exercised a
  real network failure mid-action.
  1. `LessonRunner.tsx`'s `advance()` called `onComplete`
     (`completeLessonAction`) and immediately showed the "Lesson
     complete!" success screen — real star count, real "+N XP" —
     regardless of whether the request actually succeeded. A dropped
     connection meant the learner saw a false success with nothing
     persisted, no error, and no way to know until they later found the
     lesson still locked/incomplete with no explanation. Fixed:
     `advance()` now awaits the request for a signed-in learner and only
     shows success once it's confirmed, with a real "Couldn't save your
     progress" / "Try again" screen otherwise (guests are unaffected —
     their completion is a synchronous localStorage write with nothing
     to await).
  2. `PuzzleRunner.tsx`'s `onAttempt` (`recordPuzzleAttemptAction`) had
     the same unawaited-call pattern. The immediate Correct/Not-quite
     feedback is decided client-side (no network round-trip) and
     correctly doesn't block on this call, so there was no false-success
     screen here — but a failed save silently dropped the
     `ExerciseAttempt` row (and the `UserConceptMastery` signal it
     feeds) with zero indication anything was wrong. Fixed: a real,
     visible notice appears on failure without blocking the puzzle flow.
  3. `PlayRunner.tsx`'s completed-game save (`saveCompletedGameAction`)
     used `.then()` with no `.catch()`. On failure, `gameId` never got
     set and "Analyze this game" stayed silently, permanently disabled
     — no error, no retry. Fixed: a real "This game couldn't be saved" /
     "Try saving again" notice appears, and retrying re-runs the same
     save.

  Each fix has a regression test (`e2e/network-resilience.spec.ts`) that
  was verified to genuinely fail against the pre-fix code before being
  trusted, not just pass trivially against the fix.

- **A 7th concept-taxonomy mapping row, `opposition-key-squares`,
  previously undetected**: `lib/conceptDetection.ts`'s
  `detectPawnEndgame` tags a `mistake`/`blunder` that happened in a
  position with nothing but kings and pawns on the board for both
  sides. Deliberately the narrowest detector in the file: real
  opposition/key-square theory (was this exact king-and-pawn position
  actually winning, drawing, or losing, and did the move throw that
  away) would need a hand-verified or tablebase-backed pawn-endgame
  solver — building and verifying that correctly is a much larger,
  riskier undertaking than this pass takes on, and a subtly wrong
  implementation would violate the one rule that matters most here
  (never teach incorrect chess). Instead of guessing at that theory,
  the detector leans on ground truth that's already Stockfish-verified
  elsewhere — `detectConcepts` only ever calls it for a move already
  classified `mistake`/`blunder` by the real centipawn-loss classifier
  (`lib/moveClassification.ts`) — and only recognizes *where* that
  already-real mistake happened. It doesn't explain *why* the move was
  wrong the way the other detectors' geometric checks do; it also
  doesn't have matching lesson content yet, and deliberately isn't
  paired with any this pass — a real pawn-endgame lesson needs its own
  curriculum-placement decision (this app's documented 19-lesson
  beginner sequence doesn't currently include a pawn-endgame topic at
  all), not something to bolt on unilaterally alongside the detector.
  This leaves exactly 1 of `docs/concept-taxonomy.md`'s 8 mapping-table
  rows undetected: `candidate-move-routine` ("time trouble"), which
  needs clock data this app doesn't track at all.
- **All 6 of `lib/conceptDetection.ts`'s then-6 detected concepts had
  matching lesson content.** `back-rank-safety` and `trade-evaluation`
  were the last 2 gaps (see the two entries below this one) — added
  `check-and-checkmate.04-back-rank-safety` and `basic-tactics.04-is-
  this-trade-worth-it`, each with its own `Principle` (`conceptId`
  matching the detector's tag), 2 puzzles, and a `Concept` entry. Same
  care as the earlier 3 lessons: every interactive position and puzzle
  answer set was verified directly against chess.js before being
  written as content, not just checked for chess-legality — confirming
  the back-rank position's mate-in-1 threat is real and every listed
  "create luft" pawn push actually defuses it, and confirming the
  trade-evaluation position's two captures really are one defended
  (bad) and one undefended (good) target. `back-rank-safety`'s lesson
  sits after the existing 3-lesson `check-and-checkmate` unit;
  `trade-evaluation`'s sits after the existing 3-lesson `basic-tactics`
  unit — neither renumbers or touches an existing lesson id,
  prerequisite chain, or `order`. No app code changes were needed —
  same as the earlier 3 lessons, `lib/principles.ts`/`LearningPath.tsx`
  are already data-driven off file presence.
- **`.github/workflows/ci.yml` didn't run `pnpm lint`.** The command
  itself was already runnable (this was the "resolved this session" —
  now several sessions ago — item this note used to point at), but the
  workflow file was never updated to add the step, so nothing stopped a
  lint regression from merging. Added `pnpm lint` to the `verify` job,
  right after `pnpm typecheck` and before `pnpm test`.
- **A 6th concept-taxonomy mapping row, `trade-evaluation`, previously
  undetected**: `lib/conceptDetection.ts`'s `detectUnfavorableTrade` tags
  a `mistake`/`blunder` capture that actually loses material once the
  full recapture sequence plays out. This is a real static exchange
  evaluation (`staticExchangeEval`, new in `packages/chess-rules`), not
  a "bigger piece took a smaller one" guess: it iteratively simulates
  both sides recapturing with their least-valuable attacker on the
  target square, using chess.js's own `attackers()` (confirmed via a
  direct test to be purely geometric — it ignores pins, the same
  simplification classical SEE implementations use industry-wide) and
  `.remove()`/`.put()`/`.get()` board mutation, recomputing attackers
  fresh after each virtual capture so x-ray attackers revealed by a
  removed blocker are found correctly rather than assumed from a stale
  list. A backward minimax pass (`gain[i-1] = -max(-gain[i-1], gain[i])`)
  makes the sequence stop exactly where continuing would lose more
  material, rather than naively summing every possible recapture. En
  passant is special-cased, since the pawn actually captured isn't on
  the destination square. The king is given an inflated internal value
  (1000) purely so it's never chosen as a recapturer ahead of a real
  piece. 7 unit tests in `packages/chess-rules/src/index.test.ts` cover
  a free capture, a forced even-ish trade, a defended-pawn grab, a
  multi-attacker sequence verified from both possible first-recapture
  orders, x-ray discovery, king-as-last-resort, and en passant. Like
  `back-rank-safety` before it, `trade-evaluation` has no matching
  authored `Concept`/`Principle` content yet — the detector tags the
  row truthfully; `lib/studyPlan.ts`'s lesson lookup just has nothing to
  recommend until that content exists.
- **A 5th concept-taxonomy mapping row, `back-rank-safety`, previously
  undetected**: `lib/conceptDetection.ts`'s `detectBackRankVulnerability`
  tags a `mistake`/`blunder` where the opponent has a real, engine-
  verified back-rank checkmate available in one move — using chess.js's
  own SAN mate notation on its actual legal-move generation, not a
  fabricated "king behind pawns" shape heuristic (a shape-only check
  would misfire on nearly every ordinary castled position, since a
  normal pawn shield is common and not itself a mistake). Deliberately
  conservative: only fires on a genuinely available mate-in-1 along the
  back rank, so it stays truthful rather than over-flagging. Like
  `hanging-pieces`/`king-safety-castling`/`queen-development-timing`
  before their content shipped, `back-rank-safety` has no matching
  authored `Concept`/`Principle` content yet — the detector still tags
  the row truthfully; `lib/studyPlan.ts`'s lesson lookup just has
  nothing to recommend until that content exists.
- **All 4 of `lib/conceptDetection.ts`'s detected concepts now have
  matching lesson content.** `hanging-pieces`, `king-safety-castling`,
  and `queen-development-timing` previously had no authored
  `Concept`/`Principle`, so a real detected mistake had nothing for
  `lib/studyPlan.ts`'s lesson lookup to recommend. Added 3 real lessons
  (`basic-tactics.02-hanging-pieces`, `basic-tactics.03-opening-
  development`, `meet-the-pieces.13-king-safety-and-castling` — the
  last one also the first lesson to teach castling itself, a mechanic
  no earlier lesson covered), each with its own `Principle`
  (`conceptId` matching the detector's tag), 2 puzzles, and `Concept`
  entries in `concepts.json`. No code changes were needed for the
  lookup itself — `findPrincipleByConceptId` already resolves any
  `Principle` whose `conceptId` matches; only the content was missing.
  `king-safety-castling`'s lesson sits after the existing unit mastery
  challenge (`meet-the-pieces.12-...`) rather than renumbering the
  whole unit, so no existing lesson id, prerequisite chain, or `order`
  changed.
- **Real, user-reported defect: `move-piece` steps rejected several of
  their own board's highlighted-as-legal destinations.** Root cause was
  two-fold, both in `components/exercises/MoveStep.tsx`: (1) the step
  schema's `altValid` field (documented since `docs/movewise-phase0-plan.md`,
  chess-legality-checked by `validate-chess.ts`, and listed as covered in
  `docs/testing-strategy.md`'s own coverage table) was never actually read
  by the answer-validation code — only `expectedMoves` was, so every
  alternate correct destination a lesson authored (e.g. "Meet the rook"
  step-2's `a4`/`h4`/`e1`) was silently marked wrong; (2) for steps whose
  own prompt asks for *any* legal destination in a direction (not a
  specific target like a capture), a hand-authored `expectedMoves`/
  `altValid` list can never stay complete — every intermediate square
  along the same rank/file/diagonal was highlighted green as legal but
  had no way to be marked correct. Fixed by (1) actually reading
  `altValid`, and (2) a new `acceptAnyLegalMove` flag on `MovePieceStep`
  (`packages/exercise-schema`) that, when set, accepts any chess-legal
  move of the piece — set on the 8 steps whose prompts are genuinely
  "any direction" (rook/bishop/queen/king/knight/pawn's "meet the piece"
  steps plus the unit mastery challenge's rook/king steps), left unset on
  steps with a specific target (e.g. "capture the pawn blocking its
  path") where a legal-but-wrong move must still be rejected.
  `e2e/move-piece-alt-valid.spec.ts` covers every affected piece type
  (desktop, iPad landscape/portrait, mobile touch) plus a regression
  safeguard asserting every `expectedMoves`/`altValid` destination is
  among the board's own highlighted-legal set. A second, related defect
  in the same report — the board never visually reflected a correct move
  (the piece stayed rendered on its starting square) — is also fixed:
  `MoveStep` now tracks the position actually reached, not just
  `step.fen`, and `Board.tsx` gained a `data-square` identifier per
  square for reliable testing. Also fixed: the Play & Learn demo review's
  `Qxf7#??` was classified `brilliant` while its own SAN annotation used
  `??` (conventionally "blunder") — a real, confusing self-contradiction;
  corrected to `Qxf7#`.
- **A 4th concept-taxonomy mapping row, `queen-development-timing`,
  previously undetected**: `lib/conceptDetection.ts`'s
  `detectPrematureQueenDevelopment` tags a `mistake`/`blunder` where the
  played move is a queen move, early (by move number — a fixed,
  documented-as-a-guess threshold, same honesty as the existing
  `king-safety-castling` detector's own), while at least one minor piece
  is still sitting on its home square. This is now tractable specifically
  because Phase B's own move-number tracking already exists (it wasn't
  when the original 3 detectors were scoped) — still not the fuller
  move-history-pattern analysis the other 4 undetected rows need. No
  matching `Concept`/`Principle` content exists yet, same honest gap
  `hanging-pieces`/`king-safety-castling` already have — the detector
  still tags the row truthfully; `lib/studyPlan.ts`'s lesson lookup just
  has nothing to recommend until that content is authored.
- **A completed game's analysis was only ever visible right after playing
  it, previously unbuilt**: `/play/history` (the `Game`/`GameAnalysis`
  rows below were already persisted, per Phase B, but nothing let a
  learner revisit one after leaving the page) now lists every game a
  signed-in learner has played. `/play/history/[gameId]` either
  reassembles a stored analysis server-side or, for a game left
  unanalyzed, reconstructs it from the stored PGN and runs the same real
  analysis pipeline PlayRunner uses — extracted into
  `lib/useGameAnalysisRunner.ts` (a new shared hook) so the two callers
  don't drift into two copies of the same per-ply engine-calling loop.
  `packages/chess-rules` gained `replayPgn`, the exact inverse of the
  existing `buildPgn`: chess.js's own `history({ verbose: true })`
  already carries `before`/`after` FEN once a PGN is loaded, so no manual
  replay loop was needed. Also refactored `saveGameAnalysisAction` and
  the client hook to share one `GameReview`-assembly function
  (`lib/studyPlan.ts`'s new `buildStoredGameReview`) instead of the
  Action building a narrower ad hoc shape the hook then had to re-wrap —
  a real duplication this pass's own second consumer surfaced. Verified
  end to end (`e2e/game-history.spec.ts`): an unanalyzed game shows in
  the list, gets analyzed from its detail page, and — the actual point of
  this feature — a second visit to that same detail page renders the
  stored review directly with **zero** new `GameAnalysis` rows created
  (queried directly against Postgres, not inferred from the UI), proving
  the "never re-run the engine" cache guarantee ADR-0008 specifies
  against a real return visit, not just within one browser session like
  the prior pass could only exercise.
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
