# MoveWise design system

Implements Direction A, "The Study" (`docs/design/visual-directions.md`).
Covers deliverables 6-16 of the redesign request: information
architecture, key user journeys, design tokens, component inventory,
responsive strategy, accessibility strategy, motion strategy, asset and
licensing strategy, performance budget, implementation plan, and exact
visual acceptance criteria. The vertical slice (`docs/roadmap.md`'s
Design Phase 1) implements a subset of this system for real; everything
else here is the target the rest of the app grows into.

## Information architecture

```
MoveWise
├─ Learn & Play          (ADR-0008's structured mode)
│   └─ Course → Unit → Principle → SubLesson → [Puzzle pool] → MasteryChallenge
├─ Play & Learn           (ADR-0008's game-led mode)
│   └─ Game → Analysis → StudyPlan → Retry position
├─ Practice                (aggregates: course puzzles, game-derived positions,
│                            spaced repetition, weak-skill training — not built)
├─ Progress                (course progress / game performance / transfer progress)
└─ Profile                 (account, preferences, theme, data export/deletion)
```

Matches `docs/prd.md`'s primary-navigation table exactly — this doc
doesn't redefine the IA, it gives it a visual system.

## Key user journeys (what the visual system has to carry)

1. **First-time visitor → understands the two modes → starts Learn &
   Play.** Today this fails at step one (`docs/design/audit.md`) — no
   visual distinction between the two modes exists at all. The nav
   redesign (below) is the direct fix.
2. **Returning learner → sees exactly where they left off → resumes in
   one tap.** Partially works today (`LearningPath`'s "Continue
   learning" callout); needs the visual weight to actually read as the
   page's primary action, not one link among several.
3. **Mid-lesson → reads the instruction → attempts → gets feedback that
   explains, not just judges → continues.** The interaction logic is
   already correct (ADR-0007); this system's job is making the
   instruction visually unmissable and the feedback states legible
   without relying on color alone.
4. **Finishes a game → understands what happened → starts the exact
   next lesson a mistake points to.** Not built yet (ADR-0008 Phase B) —
   the analysis-card and coach-message components exist here so Phase B
   isn't also inventing visual language from scratch when it lands.

## Design tokens

All values below are the actual light-mode Direction A tokens, to be
implemented as CSS custom properties in `apps/web/app/globals.css`
under `:root`, with a `[data-theme="dark"]` block (plus the
`prefers-color-scheme` media-query mirror) for dark mode — the same
three-state pattern (explicit light / explicit dark / system) used
throughout this codebase's own artifact conventions.

### Brand colors
| Token | Light | Dark | Use |
|---|---|---|---|
| `--mw-moss` | `#4b5d3a` | `#8fb377` | primary accent, links, primary buttons |
| `--mw-moss-ink` | `#3a4a2c` | `#cfe4bf` | text on moss-tinted surfaces |
| `--mw-brass` | `#b08a3e` | `#d8b165` | stars, XP, achievement |
| `--mw-brass-ink` | `#8a6a2b` | `#f1dcaa` | text on brass-tinted surfaces |
| `--mw-rosewood` | `#8b3a3a` | `#d98080` | errors, blunders — muted, not alarm-red |
| `--mw-sky` | `#3e5c76` | `#8fb3d1` | links/info outside the primary accent |

### Neutrals (warm-biased, not pure grey — audit's "choose neutrals, don't default to them")
| Token | Light | Dark |
|---|---|---|
| `--mw-bg` | `#f7f1e4` | `#1c1912` |
| `--mw-surface` | `#fffdf8` | `#262117` |
| `--mw-surface-2` | `#ece2cc` | `#332c1e` |
| `--mw-text` | `#241f16` | `#f1e9d6` |
| `--mw-text-dim` | `#7a6d54` | `#b3a689` |
| `--mw-border` | `#ddceac` | `#453a27` |
| `--mw-border-strong` | `#c4b284` | `#5c4f36` |

### Semantic colors
| Token | Meaning | Light | Dark |
|---|---|---|---|
| `--mw-success` / `-bg` / `-ink` | correct, proficient+ | `#4b5d3a` / `#e4ecd8` / `#38472b` | `#8fb377` / `#26311c` / `#cfe4bf` |
| `--mw-warning` / `-bg` / `-ink` | struggling, revision-due | `#b08a3e` / `#f3e6c4` / `#8a6a2b` | `#d8b165` / `#3a2f18` / `#f1dcaa` |
| `--mw-error` / `-bg` / `-ink` | incorrect, blunder | `#8b3a3a` / `#f2ddd8` / `#6f2e2e` | `#d98080` / `#3a2020` / `#f4c9c9` |
| `--mw-info` / `-bg` / `-ink` | coach messages, neutral callouts | `#3e5c76` / `#dfe7ee` / `#2e4457` | `#8fb3d1` / `#1e2e3a` / `#c7ddec` |

### Chessboard
| Token | Light | Dark | Note |
|---|---|---|---|
| `--mw-sq-light` | `#ede0c8` | `#4a4030` | |
| `--mw-sq-dark` | `#6b4f3b` | `#241d15` | |
| `--mw-sq-last-move` | `#d9c98f` | `#5c4f2a` | |
| `--mw-sq-selected` | `--mw-moss` (outline) | same | outline, not fill — never removes piece legibility |
| `--mw-sq-legal-dot` | `--mw-moss` @ 55% opacity | same | |
| `--mw-sq-check` | `--mw-rosewood` @ 30% fill | same | never relies on color alone — see Accessibility |
| `--mw-piece-white` | `#fffdf8` | `#f1e9d6` | |
| `--mw-piece-black` | `#241f16` | `#0c0a06` | |

### Move classification (ADR-0008's fixed 8-value scale — colors + required non-color glyph, see Accessibility)
| Classification | Color token | Glyph |
|---|---|---|
| Brilliant | `--mw-classification-brilliant` `#2f6f9e` | `!!` |
| Best | `--mw-success` | `★` |
| Excellent | `--mw-success` (lighter tint) | `✓` |
| Good | `--mw-moss` (muted) | `·` |
| Inaccuracy | `--mw-brass` | `?!` |
| Mistake | `--mw-rosewood` (lighter) | `?` |
| Blunder | `--mw-rosewood` | `??` |
| Forced | `--mw-text-dim` | `→` |

### Mastery states (docs/learner-model.md's 9 states — 5 already implemented in `lib/masteryModel.ts`)
| State | Color token |
|---|---|
| not-started | `--mw-text-dim` (no badge shown, per existing `MasteryBadge` behavior) |
| learning, practising, ready-for-assessment | `--mw-text-dim` |
| proficient, mastered, recovered | `--mw-success-ink` |
| struggling | `--mw-error-ink` |
| revision-due | `--mw-warning-ink` |

### Structure
| Token | Value |
|---|---|
| `--mw-radius-sm` | 8px |
| `--mw-radius` | 12px |
| `--mw-radius-lg` | 18px |
| `--mw-shadow` | `0 1px 2px rgba(36,31,22,0.06)` (light) / `0 1px 2px rgba(0,0,0,0.4)` (dark) |
| `--mw-space-*` | 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64px |
| `--mw-container` | 1180px max content width |

### Typography scale
Production faces: **Fraunces** (display/serif, variable — optical size
axis used for headline vs. small-heading weight), **Karla** (body,
humanist grotesque), **JetBrains Mono** (notation/numerals/stats) — all
self-hosted via `next/font/google` at build time (no runtime CDN
dependency, satisfies the performance budget's font-loading requirement
below).

| Role | Face | Size / line-height | Weight |
|---|---|---|---|
| Marketing headline | Fraunces | 40px / 1.15, `clamp(28px,4vw,40px)` | 600 |
| Page title | Fraunces | 26px / 1.25 | 600 |
| Unit title | Fraunces | 20px / 1.3 | 600 |
| Lesson title | Karla | 15px / 1.4 | 700 |
| **Exercise instruction** | Fraunces | 19px / 1.35 | 600 |
| Body | Karla | 15px / 1.6 | 400 |
| Supporting text | Karla | 13.5px / 1.5 | 400, `--mw-text-dim` |
| Button label | Karla | 14px / 1 | 700 |
| Board notation (coordinates) | JetBrains Mono | 10px / 1 | 700, `font-variant-numeric: tabular-nums` |
| Move notation | JetBrains Mono | 13px / 1.7 | 500, tabular-nums |
| Statistics | JetBrains Mono | 26px / 1.1 | 600, tabular-nums |
| Caption | Karla | 11.5px / 1.4, `letter-spacing:0.04em` | 700, uppercase |

The exercise instruction is deliberately set in the **display face at
near-heading size** — a direct, permanent fix for the audit's top
finding (the instruction currently matches body text weight). No text
anywhere goes below 11.5px (audit's "no unexplained tiny text").

### Motion
| Token | Value |
|---|---|
| `--mw-duration-fast` | 120ms |
| `--mw-duration-base` | 200ms |
| `--mw-duration-slow` | 360ms |
| `--mw-ease` | `cubic-bezier(0.2, 0.7, 0.3, 1)` |

### Breakpoints
`320, 375, 390, 430, 768 (tablet portrait), 1024 (tablet landscape /
small laptop), 1280 (desktop), 1536 (large desktop)` — matches Section
16's required test matrix exactly.

## Component inventory

Status column reflects what the vertical slice actually builds vs. what
this system reserves tokens/names for.

| Component | Status |
|---|---|
| Button (primary/ghost/danger, icon-button variant) | **Built** (vertical slice) |
| Card | **Built** |
| ProgressBar | **Built** |
| MasteryBadge | **Built** (extends the existing `LearningPath.tsx` component) |
| Hearts indicator | **Built** (visual redesign of ADR-0007's existing hearts) |
| Stars | **Built** (visual redesign of ADR-0007's existing stars) |
| Nav (desktop rail + mobile bottom bar) | **Built** |
| Chessboard theme (colors/coords/selection) | **Built** (`Board.tsx` re-themed via tokens, ARIA structure untouched) |
| Feedback banner (correct/incorrect/hint) | **Built** |
| Toast, Modal, Bottom sheet | Deferred — nothing in the vertical slice currently needs a dismissable overlay |
| Tabs | Deferred |
| Tooltip | Deferred |
| Skeleton loader | Deferred — see Performance section for interim loading-state approach |
| Empty state, Error state | Deferred, tokens reserved |
| Streak indicator | **Not built anywhere, including tokens** — no real streak data exists (`docs/prd.md`); showing one would be a fabricated metric, which this codebase's own conventions explicitly reject (ADR-0004's "no manipulative mechanics" reasoning) |
| Lesson node (learning-path row) | **Built** (redesign of existing `LearningPath.tsx` rows) |
| Unit header (with motif) | **Built**, motifs are simple code-native SVG/CSS (see Assets), not commissioned illustration |
| Achievement card | Deferred |
| Analysis card, Coach message | Deferred to ADR-0008 Phase B (no analysis data exists yet to design a real component around) |
| Chessboard controls (flip, resign, etc.) | Deferred — Play & Learn entry screen only in this slice, not the full game UI |

**Storybook**: not set up this pass. Given the component count actually
built (8 primitives), a lighter-weight alternative is used instead: each
primitive gets a dedicated Playwright visual-snapshot test
(`docs/design/system.md`'s Visual testing section) covering its states,
which is real regression coverage without adding a second toolchain to
maintain. Revisit Storybook once the component count grows enough that
snapshot-per-component stops scaling.

## Responsive strategy

Mobile gets its own layout, not a reflow (audit's explicit finding):
bottom tab bar (5 items, matching the IA) replaces the desktop left
rail below 768px; the "continue lesson" callout becomes full-width and
sticky-adjacent rather than one card among several; the lesson screen's
board always gets first claim on vertical space, with instruction above
and controls below reflowing to fit rather than compressing the board.
Touch targets minimum 44×44px (board squares already satisfy this at
common viewport widths — verified per breakpoint in Visual testing,
below). No layout may cause horizontal scroll at any tested breakpoint
— enforced by the Playwright responsive checks in the same section.

## Accessibility strategy

Builds on real existing groundwork (`Board.tsx`'s ARIA grid semantics,
`aria-describedby` linking prompts to the board, ADR-0007's server-side
enforcement patterns) rather than starting over:

- Contrast: every text/background pair above is checked against WCAG AA
  (4.5:1 body text, 3:1 large text) in both themes — `--mw-rosewood`
  and `--mw-moss` were specifically chosen light enough on dark paper
  and dark enough on light paper to clear this without a separate
  "accessible variant" palette.
- **Never color-alone**: move classifications carry a glyph (`!!`, `★`,
  `?!`, `??`...) in addition to color; check/checkmate on the board
  gets a filled ring around the king's square in addition to the tint;
  correct/incorrect feedback keeps its existing text explanation
  (already true) alongside the color change.
- Keyboard: every interactive element (board squares already are real
  `<button>`s) reachable and operable by keyboard; visible focus ring
  using `--mw-moss` at 3px, never `outline: none` without a real
  replacement.
- `prefers-reduced-motion`: every animation token-gated — a
  `@media (prefers-reduced-motion: reduce)` block disables the motion
  tokens' transition/animation properties globally, falling back to
  instant state changes, never removing the state change itself.
- Screen-reader board support: retains and extends `Board.tsx`'s
  existing real `aria-label`s per square; a blind/low-vision mode
  (text-move-list-first interaction) is explicitly named in the brief
  as a benchmark against Lichess — scoped as a Phase 2 design item
  (post-vertical-slice), not invented ad hoc here.

## Motion strategy

Transform/opacity only (never layout-triggering properties), per the
brief's own requirement. Named moments: step transition (120ms
cross-fade), correct-answer (a single 200ms scale-and-settle on the
feedback banner, no confetti/particle system), lesson-node unlock (a
360ms fill animation on the progress bar reaching the threshold, not a
separate celebration overlay), star reveal on completion (each star
scales in 80ms apart, capped at 3×80ms so it never feels slow). No
animation ever obscures the board or the exercise instruction.

## Asset and licensing strategy

| Asset | Source | License | Location |
|---|---|---|---|
| Fraunces | Google Fonts (Oswald Type Works / Undercase) | OFL 1.1 | `next/font/google` |
| Karla | Google Fonts (Jonny Pinhorn) | OFL 1.1 | `next/font/google` |
| JetBrains Mono | Google Fonts (JetBrains) | OFL 1.1 | `next/font/google` |
| Chess piece glyphs | Existing Cburnett SVG set | CC BY-SA 3.0 | `apps/web/public/pieces/` — unchanged, already credited in `CREDITS.md` |
| Unit motifs | Original, code-native SVG/CSS (grid patterns, geometric line-art) | Original, MoveWise-owned | `apps/web/components/motifs/` |
| Nav icons (Learn, Play, Practice, Progress, Profile) | Original, hand-authored inline SVG (20px viewBox, 1.6 stroke, `currentColor`) | Original, MoveWise-owned | `apps/web/components/icons/NavIcons.tsx` |
| Sounds | **Not added this pass** | — | Section 10's sound requirements are Play & Learn scope (ADR-0008 Phase B), not this vertical slice; adding unlicensed sound now would violate this same section's own licensing requirement |

No stock imagery, no third-party icon library — icons are a small
original set (line-weight matched to the type system) built as inline
SVG, listed individually in this table's location column once built.

## Performance budget

| Metric | Budget |
|---|---|
| Initial JS (route) | < 180KB gzipped for Learn & Play home |
| LCP | < 2.0s on mid-range mobile (4G) |
| CLS | < 0.1 |
| Font loading | self-hosted via `next/font`, `font-display: swap`, no FOIT |
| Stockfish | unchanged — already lazy-loaded only on Play/mini-game routes (`useStockfishEngine`) |
| Animation | 60fps target, transform/opacity only (Motion strategy, above) |

No decorative asset is allowed to regress these — SVG motifs are
optimized (SVGO) and inlined rather than fetched where small enough;
nothing decorative blocks first paint.

## Implementation plan

1. Tokens + theme provider (`globals.css`, `data-theme` pattern).
2. Core primitives (Button, Card, ProgressBar, MasteryBadge) as real
   components in `apps/web/components/ui/`.
3. Navigation (desktop rail + mobile bottom bar).
4. Learn & Play home redesign, using the new primitives.
5. Lesson experience redesign (board re-theme, instruction prominence,
   feedback states) — `Board.tsx`'s ARIA structure untouched.
6. Lesson completion screen redesign.
7. Play & Learn entry screen redesign.
8. Responsive verification across the full breakpoint matrix.
9. Visual-regression snapshots for every state in the acceptance
   criteria below.
10. Everything not in this list (analysis cards, coach messages, full
    game UI, Practice/Progress pages, Storybook) stays deferred and
    documented, not silently half-done.

## Exact visual acceptance criteria

- [ ] No literal color value appears inline in a component under the
  vertical slice's scope — every color traces to a token.
- [ ] Exercise instruction renders at the display-face/19px scale on
  every board-interaction step type, above the board, every time.
- [ ] Every classification/mastery/feedback state has a non-color
  signal (glyph, icon, or text) in addition to color.
- [ ] Contrast ratio ≥ 4.5:1 for body text, ≥ 3:1 for large text, in
  both themes — spot-checked against the token table above.
- [x] No horizontal scroll at 320/375/390/430/768/1024/1280/1536px —
  `e2e/responsive.spec.ts`, 26/26 passing (default/light theme; caught
  and fixed a real 369px-in-320px overflow on Play & Learn's
  difficulty picker along the way).
- [ ] Board never clips or drops below 280px rendered width at any
  tested breakpoint down to 320px.
- [x] Desktop nav rail and mobile bottom bar both present the same 5
  IA items in the same order — asserted in `e2e/responsive.spec.ts`
  and spot-checked via screenshot.
- [ ] Light and dark themes both pass the same contrast checks — dark
  is a deliberate token set (above), not an inverted filter. (Light
  theme's `--mw-text-dim` was darkened from `#7a6d54` to `#6b5d44`
  after axe-core found it failing 4.5:1 against `--mw-surface-2`/
  `--mw-success-bg`; dark theme's own `--mw-text-dim` was checked by
  hand and clears 5.46:1+ against its own backgrounds, but the a11y
  suite doesn't yet run against `prefers-color-scheme: dark` or
  `data-theme="dark"`, so this isn't machine-verified for dark yet.)
- [ ] `prefers-reduced-motion` disables all transform/opacity
  animation transitions app-wide, verified by a dedicated Playwright
  check. (The global CSS rule exists in `globals.css`; no dedicated
  test asserts it yet.)
- [x] Axe (`@axe-core/playwright`) reports zero new violations on every
  redesigned screen (home, login/signup, lesson steps + completion,
  Play & Learn, account) — `accessibility.spec.ts`, 6/6 passing. Found
  and fixed real pre-existing violations: `--mw-text-dim` contrast
  (above), disabled-nav-item opacity compounding an already-borderline
  color below 2.5:1, and `aria-label` on bare `<span>`/`<div>` elements
  with no ARIA role (Hearts, Stars, Play & Learn's captured-piece
  rows) — fixed with `role="img"`/`role="group"`. Only run against the
  default/light theme; dark-theme axe coverage is the same gap noted
  above.
