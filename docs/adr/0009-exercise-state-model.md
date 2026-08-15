# ADR-0009: Exercise-step state model

## Status
Accepted.

## Context
The product review (Comprehensive Learning Clarity, Visual Redesign and UX
Correction, Section 4) asks for an explicit, deterministic exercise-state
architecture with these states:

1. Introduction
2. Demonstration
3. Awaiting answer
4. Piece selected
5. Answer submitted
6. Incorrect
7. Hint displayed
8. Correct
9. Explanation
10. Recovery
11. Complete

— and requires that specific contradictory combinations never be
representable: a correct answer next to stale error feedback, a success
message next to stale hint text, an empty board with no instruction, a
Continue button appearing before the learner understands the result, hearts
at zero while ordinary interaction continues, and a disabled control with no
explanation of why it's disabled.

## Decision
Rather than collapsing lesson-step state into one 11-value enum, keep state
distributed across three existing, narrower pieces of state that together
cover the same 11 conceptual states, and verify by construction that the six
listed contradictions are unrepresentable. A single enum was considered and
rejected: it would touch every exercise component for a refactor that
doesn't remove any real defect (all six contradictions are already
structurally prevented — see verification below), and a wide mechanical
refactor is exactly the kind of change most likely to introduce a *new*
regression for no behavioral gain.

### State mapping

| Conceptual state | Concrete representation |
|---|---|
| Introduction / Demonstration | `step.type === "explain"` — a distinct step, rendered by `ExplainStep`, never combined with an assessable step |
| Awaiting answer | `status === "active"`, `selected === null` (move-piece/capture) |
| Piece selected | `status === "active"`, `selected !== null` — component-local state in `MoveStep` |
| Answer submitted → Correct | `status === "correct"` |
| Answer submitted → Incorrect | `status === "incorrect"`, `feedback !== null` |
| Hint displayed | `hintLevel > 0` — component-local state in `MoveStep`/`ClickSquareStep`, independent of `status` so a hint can be open while awaiting an answer without touching correctness state |
| Explanation | rendered inside the `status === "correct"` branch of `StepFooter` (`successExplanation` field, ADR-0009 ships alongside the schema field added for this) |
| Recovery | `LessonRunner`'s `recovering` boolean — when true it *replaces* the entire step UI, not a flag layered on top of it |
| Complete | `LessonRunner`'s `finished` object — replaces the entire runner UI once set |

`StepStatus` (`"active" | "correct" | "incorrect"`) is intentionally not
widened to carry hint/selection/recovery information — those are genuinely
orthogonal axes (a hint can be open in the "active" state; recovery replaces
"active" wholesale) and folding them into one enum would just move the
combinatorial complexity into a bigger enum instead of removing it.

### Verification against the six disallowed contradictions

- **Correct answer with stale error feedback**: `handleClick`/`handleCorrect`
  always calls `setFeedback(null)` in the same update that sets
  `status = "correct"` (`LessonRunner.handleCorrect`). `StepFooter` branches
  on `status`, so only one of the error/success blocks can ever render.
- **Success message with stale hint text**: `activeHint` is computed as
  `status !== "correct" ? step.hints?.find(...) : undefined` in both
  `MoveStep` and `ClickSquareStep` — the hint text is unconditionally
  suppressed the instant `status` becomes `"correct"`, not just hidden by
  CSS.
- **Empty board with no instruction**: `prompt` is a non-optional field on
  every interactive step schema (`SelectSquareStepSchema`,
  `MovePieceStepSchema`, etc. — see `packages/exercise-schema`), and every
  exercise component renders it above the board unconditionally. A step
  cannot be authored without one; `parseLesson` throws if it's missing.
- **Continue button before the learner understands the result**: the
  Continue/Finish button only exists inside `StepFooter`'s
  `status === "correct"` branch, rendered together with (not before) the
  explanation.
- **Hearts at zero while normal interaction continues**: `handleIncorrect`
  checks `START_HEARTS - newMistakes <= 0` and, when true, sets
  `recovering = true` and returns *before* setting `status = "incorrect"`
  on the live step. `LessonRunner`'s render is `recovering ? <recovery> :
  <normal step>` — an exclusive branch, not an overlay, so the original
  exercise cannot receive further input while recovering.
- **Disabled controls without explanation**: the hint button's `disabled`
  state (`hintLevel >= 4`) always pairs with its label switching to
  "Solution shown", so a disabled hint button never reads as an unexplained
  dead control.

## Consequences
- No code changes required by this ADR alone — it documents and verifies
  an invariant the existing implementation already holds, so the record
  exists for future contributors and for reviewers of the Section 4
  requirement, and to make the six invariants explicit as *properties to
  preserve* in review, not just an accident of the current code shape.
- Because the invariants aren't enforced by a single type, they rely on each
  component maintaining them individually. `docs/testing-strategy.md`
  should grow a regression test per invariant above (e.g. "hint text is
  gone one render after a correct answer") rather than relying on this
  ADR's prose alone — tracked as follow-up work, not done here.
- If a future exercise type needs genuinely different state shape (e.g. a
  multi-piece drag sequence), extend this table rather than introducing a
  parallel ad hoc state variable undocumented here.
