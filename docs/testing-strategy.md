# Testing strategy

## What exists

- **Unit tests** (`vitest`) — `packages/chess-rules` (17 tests: move
  legality, game status, `parseUci`, `describeMove`, etc.) and
  `packages/engine` (11 tests: UCI line parsing, score normalization —
  pure functions only, no real Worker/browser needed).
  `packages/exercise-schema` has a test script wired (`--passWithNoTests`
  so an empty suite doesn't fail the build) but no tests written yet —
  its correctness is currently covered entirely by content validation
  (below), not unit tests of the validator logic itself. That's a gap:
  the validator's *own* logic (e.g. the check/checkmate-delivering-square
  computation in `validate-chess.ts`) has no dedicated unit tests, only
  indirect coverage via lesson content passing/failing.
- **Content validation** (`pnpm validate:content`) — see
  `docs/architecture.md` for what the two layers (Zod schema,
  chess-legality) check. This is closest to what the brief's Section 19
  calls "automated exercise validation," and runs against every lesson
  file on every change.
- **Typecheck** (`pnpm typecheck`, all 5 TS packages) and the Next.js
  production build (`pnpm --filter @movewise/web build`, run before
  every commit that touches `apps/web`) — not "tests" exactly, but part
  of the same verification gate.
- **Manual browser verification via Playwright**, every feature, every
  commit — see below.

## What does not exist

- **No CI.** Every check above is run manually, this session, before
  every commit. Nothing enforces it on a PR — see `docs/known-risks.md`.
- **No integration/E2E test suite committed to the repo.** The Playwright
  scripts used for verification throughout this project's history lived
  in a scratch directory outside the repo, not as a maintained test
  suite — they proved specific behaviors worked *at the time*, but
  there's no `pnpm test:e2e` a future change would run automatically.
  This is the single biggest gap between "was verified" and "stays
  verified" — worth promoting a curated subset of those scripts into a
  real `apps/web/e2e/` suite before the app grows much further.
- **No accessibility test automation**, despite `Board.tsx`'s ARIA
  labeling being deliberately built for it (accessible grid roles,
  `aria-pressed`, alt text). Verified by inspection, not by an automated
  axe-core-style check.
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
layers alone would have missed — see `docs/known-risks.md` for what a
promoted E2E suite should prioritize covering first.
