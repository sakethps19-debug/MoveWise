# Stockfish methodology and licence compliance

## Version and build

- **Version**: Stockfish `18.0.8`, pinned in `apps/web/package.json`'s
  `stockfish` npm dependency.
- **Build**: the single-threaded WASM "lite" build
  (`stockfish-18-lite-single.js` / `.wasm`), staged from the npm package
  into `apps/web/public/engine/` at `predev`/`prebuild` time by
  `apps/web/scripts/copy-engine-assets.mjs` — **not committed to git**,
  fully reproducible from the pinned dependency version. Single-threaded
  was chosen (over a multi-threaded build) so it runs without requiring
  `SharedArrayBuffer`/cross-origin-isolation headers, which this app does
  not currently set.
- Current as of this round: `18.0.8` was already the pinned version
  before this round started; checked against the npm registry's latest
  `stockfish` release and found to already be current, so no upgrade was
  performed. Re-check before any future release — this doc doesn't
  self-update.

## Where it runs

Off the main thread, always: `packages/engine/src/index.ts`'s
`createEngine()` loads the WASM build inside a dedicated `Worker`
(`apps/web/lib/useStockfishEngine.ts` owns the shared instance), and all
UCI communication happens via `postMessage`. No component ever runs
Stockfish synchronously on the render thread.

## Analysis depth and MultiPV policy

No MultiPV — every call reads Stockfish's single best line (the UCI
default: `MultiPV 1`, never overridden). Two consequences, both
deliberate for now rather than accidental:

- The `EngineAnalysis.pv` returned is the one principal variation
  Stockfish itself considers strongest, not a ranked list of alternatives.
  A learner's move that ties the engine's own top line but wasn't
  literally it currently reads as suboptimal even when it's objectively
  equal — this is a real limitation, not silently worked around, and is
  listed in the backlog below.
- Depth is set per call site, not globally:
  - Post-game analysis (`apps/web/lib/useGameAnalysisRunner.ts`): depth
    10 for both the position before a played move and the position after
    it — the same depth both sides of the comparison, so an eval-loss
    number is never comparing two different search strengths.
  - Live Play-mode opponent replies (`apps/web/components/PlayRunner.tsx`):
    depth 12, `skill` variable (a UI-exposed difficulty knob, 0–20 UCI
    Skill Level).
  - Lesson mini-games (`apps/web/components/exercises/MiniGameStep.tsx`):
    depth 10, skill 10 — deliberately weaker, matching a beginner-lesson
    context rather than full strength.
- `Hash` defaults to 16 MB (`CreateEngineOptions.hashMb`), matching the
  original prototype's setting.

Depth 10–12 on a single-threaded WASM build is a deliberate speed/quality
trade-off for a browser learner-facing product, not a claim of
grandmaster-strength analysis — see `docs/known-risks.md` for the
existing disclosure of this trade-off, and this round's puzzle importer
(`scripts/import-lichess-puzzles.ts`) explicitly does *not* reanalyze its
candidate pool with the engine at all, for the same reason: batch-analyzing
thousands of positions at real depth is far too slow for this build to do
in one interactive session (see the accompanying content review report's
backlog section).

## Mate-score handling

Documented in full in `packages/engine/src/index.ts` itself
(`MAX_ENCODED_MATE_DISTANCE`, `decodeMateDistance`) — summarized here:
UCI reports a mate score as `score mate N`, a separate case from
`score cp N` (centipawns), but both need to live in one `number` field
(`EngineAnalysis.score`) for every downstream consumer. A mate score is
encoded as `sign * (100000 - min(|N|, 30) * 1000)` — a sentinel range
(100000 down to 70000) chosen to be unreachable by any real centipawn
evaluation (the entire material on the board for one side is worth well
under 4000 centipawns), so decoding back via `decodeMateDistance` can
never collide with a genuine large-but-ordinary evaluation. A prior
version of this encoding used a floor of `1000` instead of `30000`
headroom and produced a real, confirmed bug — a genuine depth-10
evaluation of exactly 1000 centipawns was misread as "mate in 99" — fixed
in an earlier round; this doc exists partly so that fix's reasoning isn't
lost to a future engine change.

## Perspective normalization

Stockfish's own `score` is always relative to the side to move in the
position just analyzed. `normalizeScore(raw, fen)` converts this to a
consistent White-relative number before it ever reaches UI code —
`packages/engine/src/index.ts`'s only place this conversion happens, so
no downstream consumer needs to re-derive "whose perspective is this
score in" from a FEN of its own.

## Alternative-move threshold

Currently **none** — a learner's played move is compared only to the
single best line (see "No MultiPV" above), via
`packages/chess-rules/src/index.ts`'s `staticExchangeEval` for
material-only comparisons and the engine's own eval-loss for general
quality. There is no configured centipawn tolerance under which an
alternative move is treated as "equally good, not a mistake" — an
honest gap, tracked as backlog (see below), distinct from this round's
puzzle importer, which *does* implement an alternative-move widening of
its own (see `docs/content-review-report.md`), but only for the
narrow, structurally-verifiable cases (a capture of the same hanging
piece; another move that also delivers checkmate) it can check without
an engine call at all.

## Cancellation and worker cleanup

`EngineHandle.dispose()` rejects any in-flight job and calls
`worker.terminate()` — the one cleanup path every caller uses (React
`useEffect` cleanup in `useStockfishEngine.ts`). The engine is a strict
one-job-at-a-time queue: a second `evaluate`/`bestMove` call while one is
pending rejects immediately (`"Engine is already analysing"`) rather than
queuing or cancelling the first — callers must await the previous call,
matching the original prototype's behavior. There is no mid-search
cancellation short of disposing the whole worker.

## GPLv3 compliance

Stockfish is GPLv3. MoveWise's own `packages/engine` code is a thin UCI
wire-protocol client — it talks *to* the engine as a subprocess-equivalent
(a Web Worker) over stdin/stdout-style text messages, not by linking
against or embedding Stockfish's own source, so it is not itself a
derivative work requiring GPL licensing. The GPLv3 source-availability
obligation is satisfied by Stockfish's own upstream project being
publicly available under GPLv3 (unmodified — MoveWise ships the
unmodified npm-distributed WASM build, never a patched binary).

**Compliance gap, not yet fixed**: no GPL licence file or notice
currently lives anywhere in this repository pointing at the bundled
engine binaries (`apps/web/public/engine/`, itself gitignored/generated,
so a notice needs to live somewhere that *does* ship — e.g. a footer
credit, or a static `LICENSE-NOTICE.md` alongside the generated engine
directory, regenerated by `copy-engine-assets.mjs` the same way the
binaries themselves are). This was already flagged as an open item in
`docs/content-licensing-register.md` before this round; still open.

## Backlog (disclosed, not silently deferred)

- **MultiPV-aware "equally good move" detection**: without at least
  `MultiPV 2-3`, a learner's objectively-fine alternative to the engine's
  literal top choice currently reads as a mistake. Needs a depth/latency
  budget decision (MultiPV multiplies search cost) before implementing.
- **A real centipawn tolerance threshold** for "this alternative move is
  not meaningfully worse" in live play/lesson feedback, separate from the
  puzzle importer's own narrow structural widening.
- **Bulk Stockfish reanalysis of imported puzzle content**: this round's
  puzzle import (104 puzzles) was validated for legality and for its
  theme claim via chess-rules geometry, not by asking the engine whether
  the advertised move is actually best at depth. A batch reanalysis
  pipeline (queue puzzles, analyze off the interactive path, flag
  disagreements) is real future work, not something this round's
  importer secretly skips without saying so.
- **GPL notice file** for the bundled engine binaries (see above).
