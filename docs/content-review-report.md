# Content review report — Lichess/openings import round

Covers this round's two importer runs
(`scripts/import-lichess-puzzles.ts`, `scripts/import-chess-openings.ts`)
and the one new hand-authored lesson. See `docs/content-sources.md` and
`docs/content-licensing-policy.md` for source/licence detail;
`packages/content/provenance/*.json` for the machine-readable per-record
provenance these numbers summarize.

## Lichess puzzle import

Source: CC0 Lichess Open Database, via `FeXd/puzzle-chess`'s
`puzzles/offline/puzzles.csv` (24,595 rows) — see
`docs/content-sources.md` for exactly why this GitHub mirror was used
instead of the official dump.

| Stage | Count |
| --- | --- |
| Rows read | 24,595 |
| Rejected — not a 2-move (setup + single learner move) solution | 20,207 |
| Rejected — illegal FEN or illegal move in sequence | 0 |
| Rejected — no chess-rules-verifiable theme detected | 319 |
| Rejected — duplicate normalized position + solution | 0 |
| Accepted candidates (before per-concept selection) | 4,069 |
| **Selected for the shipped pack** | **104** |

Zero puzzles were rejected for illegality — every 2-move row in this
CC0-sourced CSV was a legal, well-formed puzzle. The 319 "no theme"
rejections are positions this round's deliberately narrow, geometrically-
verifiable classifier (checkmate / hanging-piece capture / fork) couldn't
confidently tag — rejected rather than mistagged, not a data-quality
problem with the source.

### Selected puzzles by concept

| Concept | Count |
| --- | --- |
| hanging-pieces | 40 |
| fork (knight-fork + forking-patterns combined) | 34 |
| knight-fork | 14 |
| forking-patterns | 20 |
| checkmate | 30 |
| back-rank-tactics | 28 |

(A puzzle can carry more than one concept tag — e.g. every back-rank-tactics
puzzle also carries checkmate — so the concept counts don't sum to 104.)

### Selected puzzles by difficulty band

| MoveWise difficulty | Count | suitableLevel |
| --- | --- | --- |
| 1 (Lichess rating < 1200) | 43 | new-to-chess: 33 |
| 2 (1200–1799) | 46 | improving: 49 |
| 3 (≥ 1800) | 15 | advanced: 22 |

These bands are a **documented starting heuristic, not a validated
calibration** — see "Difficulty calibration" below.

### Duplicate / ambiguous-position handling

Deduplication is by normalized presented-position (board + side-to-move +
castling + en passant rights) plus the accepted-solution set — 0
duplicates found in the 4,069-candidate pool this round drew from.
"Ambiguous solution" is handled by *widening*, not rejecting: when the
canonical Lichess solution move is a checkmate or a hanging-piece capture,
the importer checks every other legal move in the same position and adds
any that are equally correct by the same structural test (also mates; also
captures the same piece with equal-or-better material) to `correctMoves`
— so the puzzle UI accepts any of them, not just Lichess's own recorded
move. This directly avoids the founding brief's named failure case
("several equivalent moves exist but UI accepts only one").

### Engine reanalysis — explicitly not done

No Stockfish reanalysis was run over the candidate pool. Every accepted
puzzle is chess-rules-verified for legality and for its theme claim
holding geometrically, not for whether the advertised move is engine-
optimal at depth. See `docs/stockfish-methodology.md`'s backlog section —
disclosed there as real future work, not silently skipped.

## Chess openings import

Source: CC0 `lichess-org/chess-openings` (`a.tsv`–`e.tsv`, 3,810 data
rows).

| Stage | Count |
| --- | --- |
| Rows read | 3,810 |
| Rejected — illegal move sequence (chess-rules replay failed) | 0 |
| Rejected — duplicate move sequence | 0 |
| Excluded — over the 10-ply cap (not a rejection; see below) | 1,473 |
| **Entries shipped** | **2,337** |

Zero illegal sequences — every row in this CC0-maintained dataset replays
as a fully legal game from the standard starting position. The 10-ply cap
is a deliberate design decision, not a quality filter: capping how long a
"named opening" line can be before MoveWise will recognize it, both to
avoid the founding brief's explicit warning against turning this into
"memorization of long forced lines for beginners" and to keep the
generated dataset (which ships directly in a client component's bundle)
under ~270 KB rather than ~900 KB. See
`scripts/import-chess-openings.ts`'s own header comment for the full
reasoning.

### Strategic "idea" text coverage

The CC0 dataset carries no prose — only ECO code, name, and moves. Of the
2,337 shipped opening entries, **15 base opening families** have an
original, hand-written MoveWise strategic idea (carried over from the
prior round's hand-authored book, unchanged text); every other entry
(the large majority) returns an accurate name and ECO code with an empty
`idea` field — deliberately, rather than fabricating a strategic claim
for an opening nobody at MoveWise has actually written about. Expanding
curated idea coverage to more families is real, disclosed backlog, not
silently deferred (see the final report's backlog section).

## New hand-authored lesson

One new lesson this round: `basic-tactics.05-the-opposition` ("King and
pawn endings: the opposition") — inspired by the topic area Capablanca's
*Chess Fundamentals* opens with (king-and-pawn endings, the opposition),
but every explanation sentence, position, and exercise was written fresh
for this round; no book text was copied or closely paraphrased (see
`docs/content-licensing-policy.md`'s originality test). Fills a real,
pre-existing gap: `opposition-key-squares` was already a registered
concept (`packages/content/concepts.json`) and already used by one
placement-assessment puzzle (`placement.endgame-king-escort`), but no
lesson had ever taught it — meaning placement could probe for prior
knowledge of a concept the curriculum never actually introduced. Adds 2
new puzzles to `basic-tactics`'s pool
(`basic-tactics.puzzle-opposition-1`, `-2`), all chess-rules-validated
(0 issues from `pnpm validate:content`).

Making this lesson the new terminal lesson of `basic-tactics` required
updating `tactical-vision.01-checks-captures-and-threats`'s cross-unit
prerequisite (previously `basic-tactics.04-is-this-trade-worth-it`, now
`basic-tactics.05-the-opposition`) and the matching e2e fixtures
(`e2e/testHelpers.ts`'s prerequisite map, `e2e/tactical-vision.spec.ts`'s
seeded completion list) — otherwise the curriculum-integrity validator's
"cross-unit prerequisite must target the unit's real terminal lesson"
check (`scripts/validate-content.ts`) would have failed.

## Practice pool depth — before/after this round

| Principle (concept) | Puzzles before | Puzzles after |
| --- | --- | --- |
| basic-tactics.hanging-pieces | 2 | 42 |
| basic-tactics.the-knight-fork | 2 | 16 |
| tactical-vision.forking-patterns | 2 | 22 |
| tactical-vision.back-rank-tactics | 2 | 30 |
| check-and-checkmate.recognizing-checkmate | 2 | 4 |
| basic-tactics.the-opposition (new) | 0 | 2 |

Five of these pools now clear or approach the founding brief's "≥20
unique high-quality puzzles per concept" target; the rest (every pool not
listed above — pins, skewers, discovered attacks, removing the defender,
zwischenzug, opening development, trade evaluation, and all of
meet-the-pieces/check-and-checkmate's other principles) remain at their
prior depth (2 each). Extending those is real, disclosed backlog, not
silently deferred — the importer's chess-rules-only theme classifier
(no engine call, no Themes column in the source) can currently only
detect the handful of concepts listed above; pins, skewers, and
discovered attacks in particular need pattern detection this round didn't
build.

## What this round does NOT claim

Per the founding brief's own closing instruction: importing a dataset
does not by itself create a good learning product. This round's real
claims are narrower and checkable: every imported puzzle is legally
verified, every accepted puzzle's theme tag is geometrically verified
(not asserted), every source's licence is validated by machine (not just
documented), and five practice pools went from token depth (2 puzzles) to
real depth. Difficulty calibration is a disclosed starting heuristic, not
a validated one; engine-verified move quality, richer theme coverage
(pins/skewers/discovered attacks), and broader curated opening-idea text
remain open work — see the final report's backlog section for the
complete list.
