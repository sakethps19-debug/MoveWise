import { describe, expect, it } from "vitest";
import {
  parseProvenanceRecord,
  validateProvenanceRecord,
  validateProvenanceManifest,
  type ProvenanceRecord,
} from "./provenance";

function makeRecord(overrides: Partial<ProvenanceRecord> = {}): ProvenanceRecord {
  return {
    contentId: "tactical-vision.puzzle-lichess-1",
    sourceId: "lichess-puzzle-db-cc0",
    sourceUrl: "https://github.com/FeXd/puzzle-chess/blob/main/puzzles/offline/puzzles.csv",
    sourceVersionOrDate: "cddfa24b1a5a9013b99622d6d5e7093a64b1d55a",
    licence: "CC0-1.0",
    originalRecordId: "08yJ9",
    transformationsPerformed: ["applied setup move b4b7", "re-encoded presented FEN"],
    validationStatus: "passed",
    attributionRequired: false,
    importTimestamp: "2026-09-01T00:00:00.000Z",
    contentHash: "a".repeat(64),
    ...overrides,
  };
}

describe("ProvenanceRecordSchema", () => {
  it("parses a valid CC0 record", () => {
    expect(() => parseProvenanceRecord(makeRecord())).not.toThrow();
  });

  it("rejects an unapproved sourceId", () => {
    expect(() => parseProvenanceRecord(makeRecord({ sourceId: "chess-dot-com" as never }))).toThrow();
  });

  it("rejects a malformed content hash", () => {
    expect(() => parseProvenanceRecord(makeRecord({ contentHash: "not-a-hash" }))).toThrow();
  });

  it("rejects attributionRequired without attributionText", () => {
    expect(() =>
      parseProvenanceRecord(makeRecord({ attributionRequired: true, attributionText: undefined })),
    ).toThrow();
  });
});

describe("validateProvenanceRecord", () => {
  it("passes a correctly licensed CC0 record", () => {
    expect(validateProvenanceRecord(makeRecord())).toEqual([]);
  });

  it("catches CC0-vs-CC-BY-SA licence confusion for the same source id", () => {
    const issues = validateProvenanceRecord(makeRecord({ licence: "CC-BY-SA-4.0", attributionRequired: true, attributionText: "x" }));
    expect(issues.some((i) => i.message.includes("licence confusion"))).toBe(true);
  });

  it("flags a rejected record", () => {
    const issues = validateProvenanceRecord(makeRecord({ validationStatus: "rejected" }));
    expect(issues.some((i) => i.message.includes("rejected"))).toBe(true);
  });

  it("requires attribution text for a CC-BY-SA source", () => {
    const issues = validateProvenanceRecord(
      makeRecord({ sourceId: "lichess-org-chess-openings", licence: "CC-BY-SA-4.0" }),
    );
    // licence doesn't match the registered CC0-1.0 for this source AND attribution is missing
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe("validateProvenanceManifest", () => {
  it("catches duplicate contentIds", () => {
    const issues = validateProvenanceManifest([makeRecord(), makeRecord()]);
    expect(issues.some((i) => i.message.includes("duplicate provenance record"))).toBe(true);
  });

  it("catches a content hash that drifted for the same original record", () => {
    const issues = validateProvenanceManifest([
      makeRecord({ contentId: "a", contentHash: "a".repeat(64) }),
      makeRecord({ contentId: "b", contentHash: "b".repeat(64) }),
    ]);
    expect(issues.some((i) => i.message.includes("content hash"))).toBe(true);
  });

  it("accepts a clean two-record manifest", () => {
    const issues = validateProvenanceManifest([
      makeRecord({ contentId: "a", originalRecordId: "1" }),
      makeRecord({ contentId: "b", originalRecordId: "2" }),
    ]);
    expect(issues).toEqual([]);
  });
});
