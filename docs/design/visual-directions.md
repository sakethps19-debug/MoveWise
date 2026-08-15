# Three visual directions — and the recommendation

Prototype: `docs/design/prototypes/directions.html` (also published as an
artifact and sent directly). Five representative screens per direction
— Learn & Play home, an interactive lesson, the Play & Learn game
screen, post-game analysis, and profile/progress — each in light and
dark. Read this doc against that prototype, not in place of it.

## Direction A — "The Study"

A chess academy's reading room. Warm paper background, a serif display
face carrying real editorial weight, a walnut-and-parchment board,
brass/olive accents reserved for achievement.

- **Palette**: paper `#f7f1e4`, ink `#241f16`, moss `#4b5d3a` (primary),
  brass `#b08a3e` (stars/achievement), rosewood `#8b3a3a` (errors,
  muted not alarm-red).
- **Type**: a warm serif (production: Fraunces) for headings, a
  humanist sans (Karla) for body, a monospace (JetBrains Mono) for
  notation/numerals.
- **Board**: walnut dark squares, parchment light squares — warm,
  tactile, unlike either Chess.com's or Lichess's palette.
- **Card language**: quiet rule lines more often than boxed cards;
  cards reserved for genuinely distinct content (the continue-lesson
  callout, feedback banners).
- **Motion personality**: restrained — a settle-in on step transitions,
  no bounce.

**Strengths**: most distinct from every competitor in the benchmark —
nothing in Chess.com, Lichess, Duolingo, or Chessable reads this way.
Directly embodies "warmth" and "intelligence" simultaneously, which is
the hardest pair of attributes to hold at once. Reads as premium
without needing heavy shadows or gradients to signal it. Serif display
type at this quality level is genuinely rare in the category — an
actual point of differentiation, not just a preference.

**Risks**: a serif-forward system needs real typographic discipline
(the design system's type-scale doc, below, exists specifically to
prevent this from drifting into "generic elegant SaaS" through
careless implementation). Slightly more legwork to keep board contrast
crisp at small mobile sizes than a higher-contrast palette would need.

## Direction B — "The Studio"

Confident, current, coach-energy. Cool paper, a geometric-humanist
sans, teal-and-coral accents, card-forward with soft elevation and a
left navigation rail.

- **Palette**: paper `#f4f7f7`, ink `#10181a`, teal `#0e7c7b`
  (primary), coral `#e8734a` (XP/energy), gold (stars).
- **Type**: a geometric-but-warm sans (production: Sora or General
  Sans) for headings, Work Sans for body, IBM Plex Mono for notation.
- **Board**: cool slate dark squares, soft mint-white light squares.
- **Card language**: everything is a card, soft radii, soft shadows —
  the most "app-like" of the three.
- **Motion personality**: more energetic — hover lift on cards, a
  small bounce on XP gain.

**Strengths**: the easiest of the three to build fast, since it's the
closest to conventional card-based product design — lower execution
risk. Teal+coral is a genuinely uncommon pairing in this category
(avoids both "overuse of purple" and the blue-gradient SaaS default).
Reads as energetic and current, strong for the "progress" and
"curiosity" attributes.

**Risks**: of the three, this is the one most likely to drift toward
"generic confident SaaS dashboard" if execution loosens even slightly
— soft-shadow cards with a teal accent is a well-worn pattern outside
chess entirely, so it's carrying the least inherent differentiation of
the three and depends most on illustration/motion polish to feel
distinct rather than default.

## Direction C — "The Strategist"

Bold, architectural, high-contrast. Crisp paper-white ground, thick
structural rules instead of shadows, a condensed geometric display
face, one decisive amber accent.

- **Palette**: paper `#ffffff`, ink `#0c0f13`, amber `#d97706`
  (the one accent, used sparingly).
- **Type**: a bold condensed geometric (production: Archivo or Big
  Shoulders Display) for headings, IBM Plex Sans for body, Roboto Mono
  for notation.
- **Board**: navy dark squares, warm-white light squares, thick board
  border, bold coordinate labels.
- **Card language**: structural — 2px rules as the primary separator,
  boxes rather than soft cards, no shadow system at all.
- **Motion personality**: minimal and snappy — state changes, not
  decoration.

**Strengths**: the most confident, least childish of the three — a
genuinely strong answer to "sophisticated enough that an improving
tournament player doesn't find it childish." The rule-based structure
(rather than shadow/elevation) is unusual in this category and reads
as deliberate, not generic. Best dark mode of the three — the
architecture holds up unusually well inverted.

**Risks**: the attribute this direction is weakest on is explicitly
required — "warmth." High-contrast structural design reads as
confident and serious but risks feeling cold or intimidating to a
true beginner, exactly the audience `docs/prd.md` names as primary
(0-1200 rating). Amber-on-white/black is striking but leaves less room
than A's palette for the "encouraging, never shaming" feedback-copy
requirement (Section 8) to land visually as warm rather than stern.

## Recommendation: Direction A, "The Study"

Every attribute in `docs/design/brand.md` has to be held simultaneously
— not traded off — and A is the only one of the three that doesn't
sacrifice "warmth" to get "intelligence" and "premium quality," or vice
versa. B leans warm/energetic at some cost to gravitas; C leans
serious/confident at real cost to warmth. A's serif-plus-warm-paper
combination is also the one genuinely uncommon choice among the three
relative to the competitive set — Chess.com, Lichess, Chessable, and
Duolingo are all, in their own ways, sans-serif-and-card-based
products; a considered serif system is real differentiation, not a
stylistic accident.

It also has the clearest growth path against the brief's own ambition:
"premium interactive chess academy" is closer to a description of
Direction A than either alternative, and the direction scales
naturally from true-beginner warmth (Meet the Pieces) to serious
analysis (Play & Learn's post-game review) without needing a visual
register change between them — the same serif/moss/brass system reads
as credible at both ends.

**What carries over from B and C, even though they're not selected**:
C's rule-based structural approach (rather than heavy shadow/elevation)
is worth adopting for data-dense surfaces specifically (the move list,
the analysis timeline) even inside Direction A's warmer palette — crisp
rules read as confident there too, without importing C's colder overall
register. This is noted in `docs/design/system.md`'s component
inventory rather than left implicit.
