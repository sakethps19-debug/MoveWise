# Visual and UX audit

Grounded in the actual running app (screenshots taken 2026-08-15 against
`pnpm dev`, not assumptions) — home (guest, signed-in, mobile 390px),
login/signup, a lesson's explain/exercise/incorrect/complete states, and
Play mode. Every finding below cites what was actually observed.

## What appears unfinished

- Every screen is Next.js's default system font stack rendered at
  default weights (`font-family` is never set anywhere in
  `globals.css`) — no typographic identity at all, just browser
  defaults doing the work.
- Links are default browser blue-and-underlined (`Sign in`,
  `create an account`, `Play vs. Stockfish →`) — unstyled `<a>`
  appearance, the single most obvious "this wasn't designed" signal on
  the home page.
- The chessboard has no coordinates (no rank/file labels anywhere on
  the visible board) despite `docs/adr/0007` explicitly building a
  lesson that teaches ranks/files — the concept is taught with text and
  never reinforced visually on the board itself.
- Native, unstyled `<select>` dropdowns on the Play screen ("Play as",
  "Difficulty") — visibly OS-default chrome next to a custom-drawn
  board.
- The lesson-completion screen (`docs/adr/0007`'s real, tested
  `starsExplanation()` output) is functionally rich but visually a
  vertical stack of centered black text — no card, no distinct
  background, no motion, nothing that reads as "premium" despite the
  underlying data (stars, XP, an actual sentence explaining the score)
  being genuinely good.

## What creates poor visual hierarchy

- Home page: `<h1>MoveWise</h1>`, body copy, auth links, the Play link,
  and the "Start here" callout are all left-aligned, similar sizes nose
  to tail, competing for attention with no clear entry point. A first-
  time visitor has no obvious "click here first."
  <br>Unit headers (`<h2>`) and lesson rows are nearly the same visual
  weight — bold black text at two adjacent sizes is the entire hierarchy
  system.
- Lesson screen: the exercise instruction (`"Tap the square where
  White's king begins."` — ADR-0007's real fix) sits at the exact same
  font size and weight as the lesson title above it. The single most
  important sentence on the page (the review's own Section 1 defect)
  doesn't visually outrank the breadcrumb-like header around it.
- Hearts render as literal `♥♥♥♥♡` Unicode glyphs in body text size,
  easy to miss next to the step counter.

## What looks generic

- The board's green/cream squares are a close, uncredited echo of
  Lichess's default theme — exactly the "direct imitation" this brief
  now explicitly rules out (Section 2).
- The indigo/purple accent (`#4c3fd6`, the "Start here" callout and
  primary buttons) is the one deliberate color decision in the entire
  app, and it's the single most-warned-against choice in this brief's
  own "avoid" list ("Overuse of purple").
- Piece art (Cburnett SVG set) renders small relative to its square
  (roughly 80% of a ~55px square at this viewport) with no drop shadow
  or contrast treatment — pieces read as thin outlines rather than
  substantial, tactile objects.

## What makes the product difficult to understand

- Nothing on the home page distinguishes "Learn & Play" from
  "Play & Learn" as two modes — today there's a lesson list and a
  single text link reading "Play vs. Stockfish →" beneath the intro
  copy, not two peer entry points. A first-time visitor has no way to
  form the two-mode mental model this whole product is now built
  around (ADR-0008).
- "Freeform practice — no lesson, no hints, just a game." (Play mode's
  actual subtitle, verbatim) undersells the product's own stated
  differentiator — a returning user reads this and correctly concludes
  there's no coaching here at all.

## What reduces trust

- Login/signup are unbranded forms: no logo, no value proposition, no
  password requirements shown before submission, no show/hide-password
  toggle, no Terms/Privacy links — bare `<input>` elements with default
  browser styling and a thin gray border. Nothing distinguishes this
  from a generic scaffold-generated auth page.
- The signup form's birth-year field (real, necessary — it's how the
  under-13 block works) has no inline explanation of why it's being
  asked for, which reads as suspicious data collection rather than a
  safety feature, exactly as the earlier review flagged.

## What causes unnecessary cognitive load

- The home page is one continuous vertical scroll mixing account
  status, a promotional Play link, a callout card, and three units'
  worth of lessons with no visual separation stronger than a thin
  border and a little whitespace — a returning user has to read
  top-to-bottom to find their place instead of the page foregrounding
  "here's where you left off."
- Mobile (390px, screenshotted): the desktop layout simply reflows
  narrower — same font sizes, same link-heavy header, no bottom
  navigation, a unit title ("Check and Checkmate Basics") wraps and
  visually collides with its progress count. This is a compressed
  desktop page, not a considered mobile design — precisely what
  Section 16 rules out.

## What is inconsistent

- Buttons have at least three different visual treatments depending on
  where they appear: the solid-indigo home callout, the white-bordered
  "Hint"/"Sign in" buttons, and native unstyled `<select>`s on Play —
  no shared button component exists (`grep` across `apps/web/components`
  confirms every interactive element is styled inline, ad hoc, per
  file).
- Every component in `apps/web/components/**` uses inline `style={{}}`
  objects with hand-repeated color/spacing literals (`"#4c3fd6"`,
  `"#e5e5ea"`, `padding: "10px 12px"` appear independently in
  `LearningPath.tsx`, `LessonRunner.tsx`, `StepFooter.tsx`, and more) —
  there is no design-token layer at all, so the same "brand purple"
  literal is typed out separately in each file with no guarantee they
  stay in sync.

## What should be retained

- **The underlying interaction logic and content quality are genuinely
  strong** and shouldn't be touched by a visual pass: required, real
  exercise prompts (ADR-0007), the zero-heart guided-recovery flow, the
  hint-aware stars formula with a real explanation sentence, server-side
  prerequisite/proficiency gating (ADR-0008), and the accessibility
  groundwork already in `Board.tsx` (semantic `role="grid"`/`"gridcell"`,
  real `aria-label`s naming every square's contents, `aria-describedby`
  linking the board to its prompt). None of this needs to change — it
  needs a visual system built around it, not replaced.
- The chessboard's underlying accessibility model (real ARIA grid
  semantics, keyboard-operable buttons) is a legitimate foundation to
  build the "premium" board treatment on top of, not a rewrite target.

## What should be redesigned

Everything visual: typography (no type system exists), color (one
literal purple, no palette), the board's color/piece/coordinate
treatment, every button/card/input, the home page's information
architecture, the lesson header, feedback-state presentation, the
completion screen, Play mode's entire layout, and both auth screens.
Covered by the vertical slice in `docs/design/system.md`.

## What should be removed

- The bare, unstyled native `<select>` elements on Play mode (replace
  with a real select/segmented-control component).
- Literal Unicode heart/star glyphs as the entire visual language for
  hearts and stars (keep the *data* — hearts floor at zero with
  recovery, stars reflect real performance — replace the *rendering*).
- Inline `style={{}}` objects scattered per-component in favor of the
  token/component system in `docs/design/system.md` — for the vertical
  slice's screens; the remaining screens are a documented follow-up, not
  silently left as effectively "half-migrated" without a note.
