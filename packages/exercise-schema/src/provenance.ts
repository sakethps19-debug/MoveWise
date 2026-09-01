/**
 * @movewise/exercise-schema — content provenance.
 *
 * Every imported (non-hand-authored) puzzle, opening entry, or historical
 * position must carry a ProvenanceRecord traceable back to an approved
 * source. This is the machine-readable half of
 * docs/content-licensing-policy.md — that document explains *why* each
 * source is approved and what's prohibited; this file is what CI actually
 * checks against.
 *
 * The approved-source allowlist is intentionally closed (a plain string
 * enum, not `z.string()`): adding a new source means editing this file,
 * which is the point — a new dataset should never slip into an import
 * script without a deliberate decision about its licence recorded here.
 */
import { z } from "zod";

export const APPROVED_SOURCE_IDS = [
  /**
   * Lichess's puzzle database is CC0. The multi-gigabyte official dump at
   * database.lichess.org is unreachable from this build environment (see
   * docs/content-sources.md's "Environmental constraint" note), so the
   * actual bytes were pulled from FeXd/puzzle-chess's committed
   * puzzles/offline/puzzles.csv, which the FeXd repo's own README
   * attributes as "Puzzles via Lichess Open Database, Creative Commons
   * CC0" — a redistribution of the same CC0 dataset, not a derivative
   * course. The FeXd repository's *code* is GPLv3; that licence governs
   * FeXd's HTML/CSS/JS, never the puzzle data, which MoveWise never
   * imports any of.
   */
  "lichess-puzzle-db-cc0",
  /**
   * lichess-org/chess-openings: CC0-dedicated opening name/ECO/PGN/UCI/EPD
   * dataset, maintained by Lichess itself.
   */
  "lichess-org-chess-openings",
  /** Capablanca, "Chess Fundamentals" — Project Gutenberg #33870, public domain in the US. */
  "capablanca-chess-fundamentals-pg33870",
  /** Lasker, "Common Sense in Chess" — public domain, via archive.org. */
  "lasker-common-sense-in-chess-archiveorg",
  /** Original MoveWise-authored content — no external source, licence is moot. */
  "movewise-original",
] as const;
export type ApprovedSourceId = (typeof APPROVED_SOURCE_IDS)[number];

export const LICENCE_IDS = ["CC0-1.0", "CC-BY-SA-4.0", "CC-BY-SA-3.0", "GPL-3.0", "public-domain", "original"] as const;
export type LicenceId = (typeof LICENCE_IDS)[number];

/**
 * The one licence each approved source is allowed to be recorded under.
 * This is the structural fix for the brief's explicit failure case: "a
 * supposedly-CC0 source actually belongs to the CC BY-SA broadcast
 * collection" — Lichess's puzzle DB (CC0) and Lichess's broadcast games
 * (CC BY-SA 4.0) are two different collections under the same domain, and
 * conflating them is exactly the mistake this map makes structurally
 * impossible: there is no "lichess-broadcast-games" entry in
 * APPROVED_SOURCE_IDS at all, so nothing derived from broadcast games can
 * ever pass validation under this scheme.
 */
export const SOURCE_LICENCE: Record<ApprovedSourceId, LicenceId> = {
  "lichess-puzzle-db-cc0": "CC0-1.0",
  "lichess-org-chess-openings": "CC0-1.0",
  "capablanca-chess-fundamentals-pg33870": "public-domain",
  "lasker-common-sense-in-chess-archiveorg": "public-domain",
  "movewise-original": "original",
};

/** Whether a licence requires attribution to stay compliant. CC0 and public-domain don't; CC-BY-SA and GPL do. */
export const LICENCE_REQUIRES_ATTRIBUTION: Record<LicenceId, boolean> = {
  "CC0-1.0": false,
  "CC-BY-SA-4.0": true,
  "CC-BY-SA-3.0": true,
  "GPL-3.0": true,
  "public-domain": false,
  original: false,
};

export const ProvenanceRecordSchema = z
  .object({
    /** The MoveWise content id this record documents provenance for (a Puzzle.id, opening entry key, or lesson id). */
    contentId: z.string().min(1),
    sourceId: z.enum(APPROVED_SOURCE_IDS),
    sourceUrl: z.string().min(1),
    /** A commit hash, dataset release date, or edition identifier — whatever pins the exact bytes this was imported from. */
    sourceVersionOrDate: z.string().min(1),
    licence: z.enum(LICENCE_IDS),
    /** The id this record had in the *source* dataset (a Lichess puzzle id, an ECO/PGN key, a Gutenberg chapter) — never a MoveWise-internal id. */
    originalRecordId: z.string().min(1),
    /** Every mechanical change applied between the source record and the MoveWise content, in order — e.g. "applied setup move b4b7", "re-encoded FEN", "translated ECO name to title case". Empty array means byte-identical (only valid for movewise-original text, which needs none). */
    transformationsPerformed: z.array(z.string().min(1)),
    validationStatus: z.enum(["passed", "flagged", "rejected"]),
    attributionRequired: z.boolean(),
    attributionText: z.string().min(1).optional(),
    /** ISO-8601 timestamp of the import run that produced this record. */
    importTimestamp: z.string().min(1),
    /** sha256 hex digest of the *source* record's canonical bytes (before transformation) — a re-import that produces a different hash for the same originalRecordId means the upstream source changed underneath us. */
    contentHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/, "must be a lowercase sha256 hex digest"),
  })
  .refine((r) => !r.attributionRequired || !!r.attributionText, {
    message: "attributionRequired is true but attributionText is missing",
  });
export type ProvenanceRecord = z.infer<typeof ProvenanceRecordSchema>;

export interface ProvenanceIssue {
  contentId: string;
  message: string;
}

/**
 * Structural validation beyond what the Zod schema alone can express —
 * the cross-field / cross-source-registry checks the brief calls out by
 * name: missing licence, unapproved source, missing required attribution,
 * duplicate provenance id, and (via SOURCE_LICENCE) the CC0-vs-broadcast
 * confusion case. Duplicate-id and hash-drift checks need the *set* of
 * records, so they're checked by the caller (scripts/validate-content.ts)
 * across the whole manifest — this function checks one record in
 * isolation.
 */
export function validateProvenanceRecord(record: ProvenanceRecord): ProvenanceIssue[] {
  const issues: ProvenanceIssue[] = [];

  const expectedLicence = SOURCE_LICENCE[record.sourceId];
  if (!expectedLicence) {
    issues.push({ contentId: record.contentId, message: `sourceId "${record.sourceId}" is not in the approved source registry` });
  } else if (record.licence !== expectedLicence) {
    issues.push({
      contentId: record.contentId,
      message: `licence "${record.licence}" doesn't match the registered licence "${expectedLicence}" for source "${record.sourceId}" — possible licence confusion (e.g. CC0 puzzle DB vs. CC BY-SA broadcast collection)`,
    });
  }

  const mustAttribute = LICENCE_REQUIRES_ATTRIBUTION[record.licence];
  if (mustAttribute && !record.attributionRequired) {
    issues.push({ contentId: record.contentId, message: `licence "${record.licence}" requires attribution but attributionRequired is false` });
  }
  if (mustAttribute && !record.attributionText) {
    issues.push({ contentId: record.contentId, message: `licence "${record.licence}" requires attribution but attributionText is missing` });
  }

  if (record.validationStatus === "rejected") {
    issues.push({ contentId: record.contentId, message: "validationStatus is \"rejected\" — this record must not be referenced by any shipped content" });
  }

  return issues;
}

/**
 * Manifest-wide checks: duplicate provenance ids (two records claiming
 * the same contentId) and, per originalRecordId within a single source,
 * a content hash that disagrees between records — meaning either the
 * upstream source mutated between two import runs, or two different
 * source records were mistakenly imported under the same original id.
 */
export function validateProvenanceManifest(records: ProvenanceRecord[]): ProvenanceIssue[] {
  const issues: ProvenanceIssue[] = [];
  const seenContentIds = new Set<string>();
  const hashBySourceRecord = new Map<string, string>();

  for (const record of records) {
    issues.push(...validateProvenanceRecord(record));

    if (seenContentIds.has(record.contentId)) {
      issues.push({ contentId: record.contentId, message: `duplicate provenance record for contentId "${record.contentId}"` });
    }
    seenContentIds.add(record.contentId);

    const key = `${record.sourceId}::${record.originalRecordId}`;
    const seenHash = hashBySourceRecord.get(key);
    if (seenHash && seenHash !== record.contentHash) {
      issues.push({
        contentId: record.contentId,
        message: `content hash for source record "${key}" changed between imports (${seenHash} -> ${record.contentHash}) — the upstream source may have mutated`,
      });
    }
    hashBySourceRecord.set(key, record.contentHash);
  }

  return issues;
}

export function parseProvenanceRecord(data: unknown): ProvenanceRecord {
  return ProvenanceRecordSchema.parse(data);
}
