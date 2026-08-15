# Testing strategy

## What exists

- **Unit tests** (`vitest`) — `packages/chess-rules` (17 tests: move
  legality, game status, `parseUci`, `describeMove`, etc.),
  `packages/engine` (11 tests: UCI line parsing, score normalization —
  pure functions only, no real Worker/browser needed), and
  `packages/exercise-schema` (22 tests, `validate-chess.test.ts`) —
  exercising the chess-legality validator's own branches directly
  (illegal-FEN short-circuiting, check/checkmate-delivering-square
  computation, the guided-sequence forced-reply-application bug this
  validator was specifically built to catch, the move-piece-only scoping
  of hint-arrow legality checks) rather than relying only on real lesson
  content happening to trip them. Several fixtures are the exact FEN/move
  data from real, already-validated lessons in `packages/content`, not
  invented positions, so a "this should pass" assertion is checked
  against data independently known to be correct.
- **Content validation** (`pnpm validate:content`) — see
  `docs/architecture.md` for what the two layers (Zod schema,
  chess-legality) check. This is closest to what the brief's Section 19
  calls "automated exercise validation," and runs against every lesson
  file on every change.
- **Typecheck** (`pnpm typecheck`, all 5 TS packages) and the Next.js
  production build (`pnpm --filter @movewise/web build`, run before
  every commit that touches `apps/web`) — not "tests" exactly, but part
  of the same verification gate.
- **E2E suite** (`@playwright/test`, `apps/web/e2e/`, run via
  `pnpm --filter @movewise/web test:e2e`) — 10 spec files, 24 tests,
  covering lesson flows across all 13 exercise-step types, the
  retry-after-wrong-answer fix, hearts (including flooring at zero
  without lockout), mastery-star tiering, learning-path locking (now
  including guest locking against localStorage, and migration of a
  guest's local progress into a new account on signup), the full auth
  flow (signup, the under-13 gate, duplicate email, wrong password,
  logout, XP persistence across re-login), account data export and
  deletion (including that dismissing the delete-confirmation dialog
  leaves the account intact), automated accessibility checks
  (`accessibility.spec.ts`, see below), and Play mode as both colors.
  Runs in CI as a dedicated job (browsers installed fresh each run —
  this sandbox's pre-installed Chromium is only used for local runs
  here, via a config check that's a no-op on a real CI runner). Uses a
  shared SQLite `dev.db`, so `workers: 1` — tests aren't isolated from
  each other's data, only ordered.
- **Accessibility test automation** (`@axe-core/playwright`,
  `e2e/accessibility.spec.ts`) — runs axe against the home page (guest
  and signed-in), login/signup, a lesson mid-flow (board rendered, both
  with and without a hint arrow), the lesson-completion screen, Play
  mode, and `/account`, scoped to WCAG 2.0/2.1 A and AA rules rather than
  axe's full best-practice rule set (which flags opinions, not defects,
  and would make the suite noisy instead of trustworthy). Writing this
  immediately found two real bugs in `Board.tsx`, both fixed, not
  suppressed — see `docs/known-risks.md`.
- **Manual browser verification via Playwright**, every feature, every
  commit, beyond what's in the committed suite — see below.

## What does not exist

- **No load/performance testing.**

## Section 19's "every exercise must be automatically validated for" — coverage

| Requirement | Covered? |
|---|---|
| Legal FEN | Yes — `isLegalFen` on every step with a `.fen` field |
| Correct side to move | Partially — `isLegalFen` catches structurally impossible states; doesn't verify the FEN's side-to-move matches lesson *intent* (see the content-authoring guide's note on this exact bug class) |
| Expected piece presence | No — not explicitly checked; a move being legal implies the piece exists, so this is implicitly covered for move-type steps but not verified as its own assertion |
| Legal intended move | Yes |
| Valid alternative moves | Yes (`altValid`) |
| Reachable success state | Yes for move-type steps (`no expected moves declared` fails); not modeled for `mini-game` (freeform, no fixed success state to check) |
| Correct board orientation | No — orientation isn't modeled at all; every board assumes White at the bottom |
| Correct hint sequence | Partially — level-3 arrow hints are checked as legal moves (for `move-piece` only, deliberately — see the validator's own comment on why `select-square` is excluded); hint *text* isn't checked against the actual answer |
| Matching explanation and answer | No — feedback text is free-form and not cross-checked against `correctSquares`/`expectedMoves` |
| Unambiguous success criteria | Partially — `find-check`/`find-checkmate`'s `correctSquares` are checked to *all* be real answers, but the validator doesn't flag when a correct answer exists that content *didn't* list (a false-negative risk for the learner, not caught) |

## How verification actually worked, in practice

For every feature built: typecheck → unit tests → content validation →
start the dev server → drive it with Playwright (real clicks, real
network requests, not mocked) → check console/page errors → for anything
visual (piece art, arrow rendering, star tiering), screenshot and look at
it, since none of the automated layers would have caught a broken-image
icon or a wrong star count rendering. This caught real bugs the automated
layers alone would have missed — see `docs/known-risks.md`'s "resolved
this session" section for the full list, including one found by writing
the E2E suite itself (a missing lesson-completion screen) that every
earlier ad hoc Playwright check had missed, because those scripts
navigated away manually instead of asserting on real app behavior.
