import { describe, expect, it } from "vitest";
import { heartsAtRiskFor } from "./heartsPolicy";

describe("heartsAtRiskFor", () => {
  it("is false for a regular sub-lesson (kind absent)", () => {
    expect(heartsAtRiskFor({ kind: undefined })).toBe(false);
  });

  it("is true only for a mastery-challenge lesson", () => {
    expect(heartsAtRiskFor({ kind: "mastery-challenge" })).toBe(true);
  });

  it("is false for the explicit 'sub-lesson' kind", () => {
    expect(heartsAtRiskFor({ kind: "sub-lesson" })).toBe(false);
  });
});
