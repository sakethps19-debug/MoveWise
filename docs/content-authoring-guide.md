# Content authoring guide

How to write a lesson. There's no authoring portal yet (brief Section 14) —
lessons are hand-written JSON, validated by two layers before they're
trustworthy.

## File location and lesson ID convention

`packages/content/units/<unit-id>/lesson-NN-<slug>.json`. The lesson `id`
field inside the file is `<unit-id>.NN-<slug>` (e.g.
`"meet-the-pieces.03-meet-the-rook"`) — this is what `prerequisites`
arrays and URLs (`/learn/<id>`) reference, so get it right on first write;
changing it later breaks any other lesson's `prerequisites` entry pointing
at it.

## The 13 exercise-step types

See `packages/exercise-schema/src/index.ts` for the authoritative schema.
Each type's renderer lives at `apps/web/components/exercises/<Type>.tsx` —
read the matching component before authoring a step of that type, since
the schema alone doesn't show how a field is used (e.g. `find-check`/
`find-checkmate` steps have no `text`/`prompt` field at all — the
instruction shown to the learner is synthesized from `step.type` in
`ClickSquareStep.tsx`, not authored per-lesson).

`explain` and `review` steps need no answer validation. Every other type
needs a `feedback` map (see below) except `find-check`, `find-checkmate`,
`capture`, and `find-legal-move`, which fall back to a generic "Not quite
— try again." if there's no feedback map — check the schema per type
before assuming one is required.

## Misconception-specific feedback (brief Section 3.2 — do not skip this)

Every wrong-answer feedback string must name the *specific* misconception,
never "Incorrect" or "Try again." Look at any existing lesson's
`feedback` map for the pattern:

```json
"feedback": {
  "default": "A pawn can only capture diagonally, one square ahead — it can't capture something directly in front of it."
}
```

Keys other than `"default"` let you target a *specific wrong square/answer*
with its own explanation (e.g. `select-square`'s `markIncorrect(square)`
call passes the clicked square as the key) — use this when different wrong
answers reflect different misconceptions, not just "wrong."

## Verifying chess positions — do not hand-calculate them

Every FEN in every lesson this session was verified programmatically, not
worked out by eye — hand-calculating chess legality is exactly the kind of
task humans (and models) get subtly wrong. The pattern used throughout:
write a small throwaway script using `chess.js` directly (or
`@movewise/chess-rules`'s functions) to enumerate the real legal moves,
checking squares, or mate-in-one candidates for a candidate position, and
copy the *verified output* into the lesson JSON — never a hand-derived
guess. See any of this session's commit messages for worked examples
(e.g. the "Check and Checkmate Basics" unit's commit describes verifying
a back-rank mate and a block-then-recapture guided-sequence this way).

Two non-obvious position-legality rules that have caused real bugs in this
project already:

- **Every FEN needs both kings.** `chess.js` rejects kingless positions —
  even a single-piece teaching diagram ("here's a rook, no other pieces")
  needs both kings placed somewhere that doesn't interfere with the
  taught piece's lines. See `packages/content/units/meet-the-pieces/`'s
  lessons for the pattern (kings placed at unused corners like `a1`/`h8`).
- **"Side to move" must match who's actually meant to move.** A FEN where
  the side *not* about to move is in check is not a reachable game state
  (their previous move would have had to leave their own king in check,
  which chess disallows) — `chess.js` won't catch this, but it's still
  wrong. Verify with `new Chess(fen).inCheck()` — it reports check status
  for the side to move, not either side unconditionally.

## Running validation

```bash
pnpm validate:content
```

Runs both the Zod structural schema and `validate-chess.ts`'s legality
checks against every lesson file. A lesson that passes Zod but fails
chess-legality still fails the build — both layers are mandatory, not
just the schema. See `docs/testing-strategy.md` for what's and isn't
covered by this validator, and `docs/architecture.md` for how it works.

## Verifying in the browser, not just the validator

The validator catches chess-legality and structural issues; it does not
catch a broken interaction (e.g. a hint arrow that's chess-legal but
confusing given the lesson's framing). Run
`pnpm --filter @movewise/web dev` and click through the new lesson,
including a deliberately *wrong* answer on every answerable step — not
just the happy path (a stuck-state bug in the exercise components existed
undetected for most of this project's history specifically because every
prior test clicked the correct answer directly; see the git log entry
titled "Split LessonRunner into per-type components... fix a real
stuck-state bug" for the full story).
