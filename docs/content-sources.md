# Content sources

The approved-source allowlist for imported (non-hand-authored) MoveWise
content, and the exact, pinned bytes each import in this repo was actually
built from. `packages/exercise-schema/src/provenance.ts` is the
machine-readable mirror of the "approved" half of this list —
`APPROVED_SOURCE_IDS` there must never diverge from this file.

See `docs/content-licensing-policy.md` for the *rules* (what's prohibited,
how validation enforces this, what to do when a new source is proposed).
This file is the *catalog*: which sources are approved, at which exact
version, under which licence.

## Approved primary sources (currently used)

### 1. Lichess Open Database puzzles — CC0-1.0

- **Canonical source**: `database.lichess.org/#puzzles` (the official
  Lichess puzzle export, updated daily, CC0-dedicated).
- **Actual bytes imported**: the official multi-gigabyte dump is
  unreachable from this build environment — every direct request to
  `database.lichess.org` is rejected by the environment's outbound network
  policy (confirmed via repeated `curl` 403s and the proxy's own status
  endpoint, not a transient failure). GitHub-hosted content is reachable,
  so the puzzles were instead pulled from
  [`FeXd/puzzle-chess`](https://github.com/FeXd/puzzle-chess)'s committed
  `puzzles/offline/puzzles.csv` — a ~2.2 MB, 24,595-row CSV subset of the
  same CC0 database, which that repository's own `README.md` attributes
  as *"Puzzles via Lichess Open Database, Creative Commons CC0"*.
  - Repo commit pinned: `cddfa24b1a5a9013b99622d6d5e7093a64b1d55a` (2024-02-10).
  - File SHA-256:
    `ae5a175d444edbec50f79aae420df2ebe2dde475ea540ac3decf44d1d90f14a0`.
  - Columns: `puzzleId, FEN, moves, rating` — **no `Themes` column**, unlike
    the official Lichess export. MoveWise's importer (see below) derives a
    small set of themes itself, by chess-rules analysis of the actual
    position and solution, rather than trusting an absent field or
    inventing one.
- **Licence**: CC0-1.0 (the puzzle *content*; FeXd's own repository code
  is separately GPLv3 — MoveWise imports none of that code, only the CSV
  data file, so the GPLv3 obligation does not attach to the imported
  puzzles).
- **Explicitly distinct from**: Lichess *broadcast games*, which are CC BY
  4.0/BY-SA, a different collection under the same lichess.org domain.
  MoveWise imports no broadcast-game data at all — see
  `docs/content-licensing-policy.md`'s "CC0-vs-broadcast" note for why
  this distinction is enforced structurally, not just documented.
- **Format note (verified, not assumed)**: the CSV follows the standard
  raw Lichess puzzle convention — `FEN`'s side-to-move plays `moves[0]`
  (the puzzle's setup move), and the opposite side then plays
  `moves[1:]`, which is the learner's actual solution. Verified by hand
  against two CSV rows using real board geometry (see the importer's own
  header comment and `scripts/import-lichess-puzzles.test.ts` for the
  worked examples), not assumed from documentation alone.

### 2. lichess-org/chess-openings — CC0-1.0

- **Source**: [`lichess-org/chess-openings`](https://github.com/lichess-org/chess-openings),
  the dataset Lichess itself uses to name openings in its own opening
  explorer and game analysis.
- **Repo commit pinned**: `4b8622759e7ae6f93f011cc6c83a3823401ab45e`.
- **Files used**: `a.tsv`, `b.tsv`, `c.tsv`, `d.tsv`, `e.tsv` (3,815 rows
  total; `eco`, `name`, `pgn` columns).
  - SHA-256: `a.tsv` `41722fa3d44f294357326fe2ca1b956d9e56490b30efcfa68db61114c9df7e10`,
    `b.tsv` `310f0997d5a26ac6c9abfabac028e47e78f24356a6ba322cfffbf8f5a3f88d25`,
    `c.tsv` `b2e64f32e42e6418b327d03a55af65f3a18e762f7cbc0efffc7e9d1ed3aa7343`,
    `d.tsv` `58cad40b886bd499717eabcce281d4bfcf00eeadbdc00552f42042cf4aac50d2`,
    `e.tsv` `f1f8494f488f660e284f23527d5acfbeccdbbc3acc76e74f05d125f39d2f8a74`.
- **Licence**: CC0-1.0 (`COPYING.txt`, verified in full; `README.md`
  additionally states opening names/moves are "a collection of facts" and
  therefore public domain regardless).
- **Used for**: `apps/web/lib/openingBook.ts`'s opening-identification
  data (see `docs/content-licensing-register.md`'s updated entry).

## Approved reference-only sources (not yet imported this round)

Content inspiration only — never copied, closely paraphrased, or
programmatically ingested. Listed here so the allowlist itself is
complete even though this round didn't build an importer for them.

- **Capablanca, *Chess Fundamentals*** — Project Gutenberg #33870, public
  domain in the US. Used, where used, only as an *inspiration* for original
  lesson topics (simple checkmates, king-and-pawn endings, the opposition,
  relative piece values, basic development) — every explanation sentence
  is newly written, never Gutenberg's transcription or its own boilerplate.
- **Lasker, *Common Sense in Chess*** — public domain, via archive.org.
  Same rule: principles as inspiration, prose entirely original.
- **FIDE Laws of Chess** — reference for rules accuracy only; paraphrase
  only, never copy substantial wording.
- **Wikibooks Chess** (CC BY-SA 4.0) / **Chess Programming Wiki**
  (CC BY-SA 3.0) — cross-checking only in this round; not imported or
  closely adapted, since neither obligation (attribution + share-alike)
  has been formally worked through for MoveWise's own licence yet.

## Explicitly prohibited (never imported, referenced, or "inspired by")

Chess.com lessons/articles/puzzles/diagrams; Chessable courses; YouTube
transcripts or proprietary teaching material from any named educator or
channel; any modern copyrighted chess book; random PDFs of unknown
provenance; Lichess user Studies without an explicit, checked compatible
licence; any PGN database without clear redistribution rights; Lichess
*broadcast games* (CC BY-SA 4.0 — separate from, and not to be conflated
with, the CC0 puzzle database); AI-generated text that closely imitates a
protected source. No file in this repository was produced from any of
these.

## Environmental constraint (disclosed, not worked around silently)

This build environment's outbound HTTPS proxy rejects direct requests to
`database.lichess.org`, `lichess.org`, `explorer.lichess.ovh`, and
`huggingface.co` (confirmed via repeated `curl` 403s and the proxy's own
`/__agentproxy/status` endpoint — a policy denial, not a flaky timeout).
GitHub-hosted repositories are reachable and were used instead, per the
pinned sources above. This is a real limitation of the *current* session's
network access, not of the underlying licences — a future import run with
direct access to `database.lichess.org` could re-run against the full
official dump (millions of puzzles, with a genuine `Themes` column) using
the same importer and provenance machinery, superseding this round's
smaller, GitHub-sourced subset without changing any licence conclusion
above.
