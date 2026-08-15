# MoveWise brand — positioning, attributes, competitive benchmark

## Positioning

**A premium interactive chess academy combined with a personal chess
coach.** Friendly enough for a complete beginner (the product's actual
current audience — see `docs/prd.md`'s "0-1200 online rapid"), credible
enough that an improving tournament player doesn't feel talked down to.
The tension to hold deliberately: warmth without childishness, rigor
without intimidation.

## Brand attributes, and what each one rules in/out

| Attribute | Rules in | Rules out |
|---|---|---|
| Intelligence | Precise language, real move classifications (not vague "good/bad"), data shown with explanation attached | Dumbed-down copy, mascots that talk *at* the learner instead of explaining |
| Progress | Visible, honest progress signals tied to real data (concept mastery, not vanity streaks) | Fabricated metrics — no streak counter until real streak tracking exists (see `docs/design/system.md`'s honesty constraint) |
| Confidence | Generous whitespace, decisive color use, a board that looks like the main event | Busy dashboards, decoration competing with the position on the board |
| Curiosity | Unit motifs that hint at what's ahead, a coach that explains *why* | Gamification for its own sake — the brief's own brief already warns against "manipulative mechanics merely to increase screen time" (ADR-0004) |
| Strategic thinking | Clean geometric forms echoing the board's own grid logic | Organic/whimsical illustration style that reads as unrelated to chess |
| Warmth | A restrained coach presence, encouraging (never shaming) incorrect-answer copy — already true in the copy layer, needs a visual match | Saccharine mascot design, excessive celebration animation |
| Premium quality | Considered type scale, real elevation/shadow system, polish in every state (loading, empty, error) | Cheap neon, glassmorphism, gradient-as-decoration |
| Accessibility | WCAG 2.2 AA as a floor, color-independent feedback, real keyboard/screen-reader support | Treating accessibility as a post-hoc checklist instead of a default-state requirement |

## Competitive benchmark

Reference only — no assets, layouts, characters, or exact wording
copied from any of these.

| Product | What it does well (worth learning from) | What MoveWise should not copy |
|---|---|---|
| **Chess.com** | Board-first layout discipline; move classification is legible at a glance; dense information (clocks, move list, eval) never feels cluttered because of consistent spacing | Its exact green/tan board palette, its specific icon set, its dashboard density (MoveWise's audience starts at true beginner, not intermediate) |
| **Lichess** | Best-in-class accessibility and keyboard/blind-play support — explicitly named in this brief as a minimum benchmark, not optional; utilitarian clarity | Its default board theme (the exact green MoveWise's board already, coincidentally, resembles — a reason to deliberately move away from it) |
| **Duolingo** | Proof that a learning path can be genuinely fun without being juvenile to adults; clear single-next-action framing | Its winding bubble path (this brief explicitly rules it out), its mascot's specific character design, its notification/streak-pressure mechanics |
| **Chessable** | Course structure (course → chapter → line) as a legible hierarchy; spaced-repetition framing taken seriously as a feature, not an afterthought | Its dense, text-heavy course-catalog visual style — not the right register for a beginner-first product |
| **Dr. Wolf (Chess.com)** | A coach *personality* attached to explanations, not just raw engine output — proof the "coach" requirement in Section 13 has real product precedent | Any resemblance to Dr. Wolf's specific character design or name |

## What "beating" these products actually means here

Not out-designing them on decoration — out-*executing* the connection
this product already has and they mostly don't: a real, working link
between "you made this exact mistake in a real game" and "here is the
lesson that teaches the concept you missed" (ADR-0008's whole reason for
existing). The visual system's job is to make that connection legible
and trustworthy, not to compete on animation richness for its own sake.
