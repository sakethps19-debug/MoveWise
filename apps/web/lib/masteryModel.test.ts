import { describe, expect, it } from "vitest";
import { computeMasteryStatus } from "./masteryModel";

const correct = { correct: true };
const wrong = { correct: false };

describe("computeMasteryStatus", () => {
  it("is not-started with zero attempts", () => {
    expect(computeMasteryStatus(null, [])).toEqual({ status: "not-started", exerciseConfidence: 0 });
  });

  it("is learning after a small number of mixed attempts", () => {
    const result = computeMasteryStatus(null, [correct, wrong]);
    expect(result.status).toBe("learning");
  });

  it("is proficient after high accuracy", () => {
    const result = computeMasteryStatus(null, [correct, correct, correct, correct, wrong]);
    expect(result.status).toBe("proficient");
    expect(result.exerciseConfidence).toBeCloseTo(0.8);
  });

  it("is struggling after repeated wrong answers with enough attempts", () => {
    const result = computeMasteryStatus(null, [wrong, wrong, wrong, correct]);
    expect(result.status).toBe("struggling");
  });

  it("does not flag struggling from too few attempts, even if all wrong", () => {
    const result = computeMasteryStatus(null, [wrong, wrong]);
    expect(result.status).not.toBe("struggling");
  });

  it("moves struggling -> recovered once recent attempts show strong accuracy", () => {
    const attempts = [wrong, wrong, wrong, wrong, correct, correct, correct, correct, correct];
    const result = computeMasteryStatus("struggling", attempts);
    expect(result.status).toBe("recovered");
  });

  it("does not recover from struggling on a still-weak recent window", () => {
    const attempts = [wrong, wrong, wrong, wrong, correct, wrong, correct, wrong];
    const result = computeMasteryStatus("struggling", attempts);
    expect(result.status).not.toBe("recovered");
  });

  it("recovery only looks at the recent window, not full history", () => {
    // Terrible overall accuracy, but the last 5 are all correct.
    const attempts = [wrong, wrong, wrong, wrong, wrong, wrong, wrong, correct, correct, correct, correct, correct];
    const result = computeMasteryStatus("struggling", attempts);
    expect(result.status).toBe("recovered");
  });
});
