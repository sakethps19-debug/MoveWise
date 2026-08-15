# Content and licensing register

Every third-party asset, dataset, or dependency with licensing obligations
beyond permissive-and-silent (MIT/ISC/BSD packages aren't listed here —
this tracks anything with an attribution, share-alike, or source-
availability obligation, per the brief's Section 4 and Section 17).

## Stockfish (chess engine)

- **License**: GPLv3.
- **Source**: official `stockfish` npm package (`18.0.8`), the
  single-threaded WASM lite build (`stockfish-18-lite-single.js/.wasm`).
- **How it's used**: staged from the npm package into
  `apps/web/public/engine/` at `predev`/`prebuild` time by
  `scripts/copy-engine-assets.mjs` — **not committed to git**, fully
  reproducible from the pinned dependency version.
- **Obligation status**: GPLv3's source-availability requirement is
  satisfied by linking to the upstream `stockfish` / Stockfish projects,
  which are themselves publicly available under GPLv3. No modifications
  were made to the engine binary itself. `packages/engine`'s own code
  (the UCI wrapper) is original and not GPL-derived — it only *talks to*
  the engine over the UCI text protocol, at arm's length.
- **Action item**: no GPL license file/notice currently lives in this
  repo pointing at this. Should add one (e.g.
  `apps/web/public/engine/LICENSE-NOTICE.md`) before any real deployment.

## Cburnett piece art

- **License**: CC BY-SA 3.0 (Creative Commons Attribution-ShareAlike).
- **Source**: originally created by Colin M.L. Burnett; extracted
  unmodified from the `react-chess-pieces` npm package's bundled SVG
  files (not from Wikimedia directly — this environment couldn't reach
  Wikimedia's servers, but the artwork is unmistakably the standard
  Cburnett set, the same one Lichess uses as its default board theme).
- **How it's used**: 12 SVG files in `apps/web/public/pieces/`, used
  verbatim (one bug fixed — a missing `xmlns` attribute needed for
  standalone `<img>` loading — is not a creative modification).
- **Attribution**: `apps/web/public/pieces/CREDITS.md`.
- **Obligation status**: satisfied — CC BY-SA's core requirement for
  unmodified use is attribution, which is in place. Share-alike would
  apply if the artwork itself were adapted/redrawn; it hasn't been.

## chess.js

- **License**: BSD-2-Clause. Permissive, no ongoing obligation. `chess.js`
  is imported *only* inside `packages/chess-rules` (an enforced convention
  — see that package's own module doc comment), which keeps this
  dependency's API surface from leaking into the rest of the codebase.

## Prisma, Next.js, React, and the rest of the npm dependency tree

MIT or equivalent permissive licenses throughout — no dependency-scanning
tool has been run against the full tree (see `docs/known-risks.md` and
`docs/security-checklist.md`), so this is based on the well-known licenses
of the direct dependencies, not an exhaustive transitive audit.

## Curriculum content

All 15 lessons across the two built units, and the `step-type-preview`
demo lesson, were authored from scratch this session — every explanation,
board position, hint, and feedback string is original text, and every
chess position was verified programmatically (not copied from any puzzle
database, course, or video) — see `docs/content-authoring-guide.md` for
the verification method. No transcript, proprietary course sequence,
puzzle database, video, image, or branded character from any of the
educators/platforms listed in the brief's Section 4 was used, referenced,
or adapted.

## Open item

No dependency-scanning tool (Dependabot, Snyk, `npm audit` as a CI step)
has been run against the full transitive tree — flagged in
`docs/known-risks.md`, not resolved here.
