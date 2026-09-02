# Content licensing policy

The rules governing how MoveWise imports third-party chess content, and
how those rules are enforced in code rather than left as an honor system.
Pairs with `docs/content-sources.md` (the catalog of what's actually
approved and at what version) and
`packages/exercise-schema/src/provenance.ts` (the schema and validators
this policy is encoded as).

## Principle

Every unit of imported content — a puzzle, an opening entry, a historical
position — must be traceable to exactly one approved source, under a
licence MoveWise's use actually satisfies, with a record of what
mechanical transformation (if any) was applied. "We think this came from
Lichess" is not provenance. A `ProvenanceRecord` naming the exact source,
version, licence, and original id is.

## What "approved" means

A source is approved only if it is listed in both
`docs/content-sources.md` and `APPROVED_SOURCE_IDS` in
`packages/exercise-schema/src/provenance.ts`. Adding a new source means
editing both, deliberately, as its own change — never adding a new source
inline inside an importer script. This is a closed enum, not a free-text
field, specifically so a new dataset can't slip into an import path
without that decision being made and reviewed.

## Validation failure conditions

`validateProvenanceRecord` / `validateProvenanceManifest` in
`packages/exercise-schema/src/provenance.ts` fail content validation
(`pnpm validate:content`) when any of the following hold. Each maps to a
named case from the founding brief:

| Failure | How it's enforced |
| --- | --- |
| Licence missing | `licence` is a required schema field — a record without one fails Zod parsing before any semantic check runs. |
| Source unapproved | `sourceId` is `z.enum(APPROVED_SOURCE_IDS)` — an unlisted source fails schema parsing. |
| Attribution required but absent | `LICENCE_REQUIRES_ATTRIBUTION[licence]` is checked against `attributionRequired`/`attributionText`; CC BY-SA and GPL licences without an attribution string fail. |
| Duplicate provenance id | `validateProvenanceManifest` tracks every `contentId` seen across the manifest; a second record for the same id fails. |
| Content hash unexpectedly changes | `validateProvenanceManifest` tracks the hash last recorded per `(sourceId, originalRecordId)`; a re-import that hashes the same original record differently fails, flagging that the upstream source mutated. |
| CC0 source actually belongs to the CC BY-SA broadcast collection | `SOURCE_LICENCE` maps each approved `sourceId` to exactly one licence; a record claiming CC0 under a source registered as something else fails. Structurally, this file's allowlist also never lists "Lichess broadcast games" as a source at all — nothing derived from that collection can be represented, let alone pass, under this scheme. |

A `validationStatus: "rejected"` record additionally fails outright if it
is referenced by any shipped puzzle — a rejected record documents *why*
a candidate was declined, not permission to ship it anyway.

## Transformation logging

`transformationsPerformed` must list every mechanical change between the
source record's raw bytes and the MoveWise content derived from it — e.g.
"applied Lichess setup move b4b7 to obtain the presented position",
"re-encoded FEN", "converted ECO opening name to title case". This is what
lets a reviewer (or a future importer re-run) distinguish "this is the
source content, verbatim" from "this was mechanically derived from it" —
neither of which is "this was rewritten/authored," which instead gets
`sourceId: "movewise-original"` and no transformation list at all.

## What "original" content requires

Lesson prose, explanations, hints, and feedback text inspired by
Capablanca's or Lasker's public-domain principles must be newly written —
not a paraphrase close enough to be a derivative of the specific
sentences in those books. The test applied in this repo: could two
independent authors, both told "explain why premature attacks fail before
development is complete," plausibly produce different wording? If a
sentence is close enough that they couldn't, rewrite it. Historical
positions (an actual position from a Capablanca/Lasker game or example)
are facts, not expression, and may be reproduced exactly — but every one
still gets a `ProvenanceRecord` under the relevant book's `sourceId`, and
is chess-rules/Stockfish validated the same as an imported puzzle.

## Do not commit large source dumps

Raw source datasets (the FeXd `puzzles.csv`, the `chess-openings` TSVs)
are pinned by commit hash and SHA-256 in `docs/content-sources.md` and
read from a local clone at import time — they are not committed to this
repository. Only the importer's curated *output* (a small, provenance-
tagged JSON puzzle/opening pack) and the manifest of `ProvenanceRecord`s
describing it are committed. Re-running an import requires cloning the
pinned source commit locally first; `scripts/import-lichess-puzzles.ts`
documents the exact command in its own header.

## Proposing a new source

1. Confirm the licence firsthand (read the actual licence file/statement
   at the source, don't trust a third party's summary of it).
2. Add it to `docs/content-sources.md` with the source, exact pinned
   version, licence, and what it will be used for.
3. Add its id to `APPROVED_SOURCE_IDS` and `SOURCE_LICENCE` in
   `packages/exercise-schema/src/provenance.ts`.
4. Only then write or extend an importer against it.
