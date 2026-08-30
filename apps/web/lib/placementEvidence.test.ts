import { describe, expect, it } from "vitest";
import {
  conceptIdsAtOrAbove,
  applyContradictingEvidence,
  BYPASS_EVIDENCE_LEVELS,
  NEEDS_CONFIRMATION_LEVELS,
  type ConceptEvidence,
} from "./placementEvidence";

const evidence: ConceptEvidence[] = [
  { conceptId: "rook-movement", level: "directly_demonstrated", source: "placement.movement-rook" },
  { conceptId: "king-movement", level: "inferred_high_confidence", source: "foundational-cluster (2/4 correct)" },
  { conceptId: "opening-principles", level: "needs_confirmation", source: "foundational-cluster (1/4 correct)" },
  { conceptId: "endgame-technique", level: "unverified", source: "not-asked" },
];

describe("conceptIdsAtOrAbove", () => {
  it("includes only directly_demonstrated and inferred_high_confidence when filtering by BYPASS_EVIDENCE_LEVELS", () => {
    const result = conceptIdsAtOrAbove(evidence, BYPASS_EVIDENCE_LEVELS);
    expect(result).toEqual(new Set(["rook-movement", "king-movement"]));
  });

  it("never includes needs_confirmation or unverified concepts in the bypass set", () => {
    const result = conceptIdsAtOrAbove(evidence, BYPASS_EVIDENCE_LEVELS);
    expect(result.has("opening-principles")).toBe(false);
    expect(result.has("endgame-technique")).toBe(false);
  });

  it("NEEDS_CONFIRMATION_LEVELS flags only inference-only evidence, never a direct check", () => {
    const result = conceptIdsAtOrAbove(evidence, NEEDS_CONFIRMATION_LEVELS);
    expect(result).toEqual(new Set(["king-movement"]));
  });
});

describe("applyContradictingEvidence", () => {
  it("downgrades a directly_demonstrated concept that later real evidence contradicts", () => {
    const result = applyContradictingEvidence(evidence, new Set(["rook-movement"]));
    const rook = result.find((e) => e.conceptId === "rook-movement")!;
    expect(rook.level).toBe("later_contradicted");
    expect(rook.source).toBe("contradicted-by-later-practice");
  });

  it("downgrades an inferred_high_confidence concept that later real evidence contradicts", () => {
    const result = applyContradictingEvidence(evidence, new Set(["king-movement"]));
    expect(result.find((e) => e.conceptId === "king-movement")!.level).toBe("later_contradicted");
  });

  it("leaves every other concept's evidence untouched", () => {
    const result = applyContradictingEvidence(evidence, new Set(["rook-movement"]));
    expect(result.find((e) => e.conceptId === "king-movement")!.level).toBe("inferred_high_confidence");
    expect(result.find((e) => e.conceptId === "opening-principles")!.level).toBe("needs_confirmation");
    expect(result.find((e) => e.conceptId === "endgame-technique")!.level).toBe("unverified");
  });

  it("is a no-op when nothing is contradicted", () => {
    expect(applyContradictingEvidence(evidence, new Set())).toEqual(evidence);
  });

  it("never re-downgrades a concept already marked later_contradicted (idempotent)", () => {
    const already: ConceptEvidence[] = [{ conceptId: "x", level: "later_contradicted", source: "prior" }];
    const result = applyContradictingEvidence(already, new Set(["x"]));
    expect(result).toEqual(already);
  });
});
