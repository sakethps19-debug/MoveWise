# Puzzle difficulty calibration

The founding brief is explicit: **never equate a Lichess puzzle rating
directly with a player's standard-game rating.** This document is the
honest state of MoveWise's calibration layer — what exists, what it
actually is (a starting heuristic), and what a real evidence-based
calibration would require that this round did not have the data to build.

## What exists today

`scripts/import-lichess-puzzles.ts` maps each imported puzzle's Lichess
puzzle rating to two MoveWise fields via a static, documented band
function:

```
ratingToDifficulty(rating):  < 1200 → 1   1200–1799 → 2   ≥ 1800 → 3
ratingToLevel(rating):       < 1000 → "new-to-chess"
                              1000–1599 → "improving"
                              ≥ 1600 → "advanced"
```

This is a **linear passthrough with named bands**, not a calibration —
it does not correct for the well-known fact that a Lichess puzzle
rating and a player's standard-game rating measure different things
(tactical pattern-recognition speed under a "there is definitely a tactic
here" prior, versus general play strength). It exists so every imported
puzzle has *some* principled, reproducible difficulty/level value rather
than an arbitrary or hand-picked one — not because the band thresholds
themselves have been validated against real MoveWise learner outcomes.

## Why a real calibration wasn't built this round

An evidence-based calibration layer — the founding brief's actual ask —
needs completion data: for a meaningful sample of real learners at known
skill levels, which imported puzzles do they solve easily, struggle with,
or fail? That data does not exist yet. This is a genuine, structural
limitation, not a shortcut: MoveWise's puzzle content from this import is
being shipped for the first time in this same round, so there is no prior
usage history to calibrate against. Building the *heuristic* first, and
building the *learning layer that would refine it* second, is the correct
order — not a corner cut.

## What the real calibration layer needs, once usage data exists

1. **Outcome capture**: for every attempt at an imported puzzle, record
   the learner's current MoveWise-internal skill estimate (already
   collected for placement/warm-up personalization —
   `apps/web/lib/placement.ts` and friends), whether the attempt was
   correct, and how many hints were used before solving.
2. **A per-puzzle empirical difficulty**, derived from aggregated
   completion evidence (first-try success rate at a given skill level),
   not from the imported Lichess rating alone.
3. **A reconciliation step**: compare the empirical difficulty against
   this document's static band assignment for each puzzle. A puzzle
   whose real-world difficulty disagrees sharply with its Lichess-rating
   band is a signal either that the band thresholds need adjusting, or
   that this specific puzzle's rating doesn't transfer well to MoveWise's
   audience (a real, expected outcome — Lichess puzzle ratings are
   themselves derived from a different population).
4. **Feed the existing "Too easy"/"Too hard" feedback mechanism** (see
   `apps/web/lib` — the practice scheduler already collects this signal
   for hand-authored puzzles) into the same reconciliation, since it's a
   more direct, learner-reported signal than inferred difficulty.

None of this is built yet. This document exists so that work has a
concrete starting point and a named gap, rather than the calibration
question being silently left unaddressed.
