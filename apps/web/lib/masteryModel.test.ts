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

  const puzzleCorrect = { correct: true, source: "puzzle" as const };
  const puzzleWrong = { correct: false, source: "puzzle" as const };

  it("is practising once puzzle attempts exist but accuracy isn't high enough yet", () => {
    // Below proficient overall accuracy (would otherwise be "learning"),
    // with a puzzle attempt mixed in — accuracy 0.5 is deliberately not
    // below STRUGGLING_THRESHOLD either, so this exercises the new branch.
    const result = computeMasteryStatus(null, [correct, correct, wrong, puzzleWrong]);
    expect(result.status).toBe("practising");
  });

  it("is ready-for-assessment once puzzle accuracy clears the threshold with enough attempts", () => {
    // Overall accuracy (4/6) stays below PROFICIENT_THRESHOLD so the
    // existing proficient check doesn't fire first; puzzle-only accuracy
    // is a perfect 3/3.
    const result = computeMasteryStatus(null, [
      correct,
      wrong,
      wrong,
      puzzleCorrect,
      puzzleCorrect,
      puzzleCorrect,
    ]);
    expect(result.status).toBe("ready-for-assessment");
  });

  it("does not reach ready-for-assessment from too few puzzle attempts, even at perfect puzzle accuracy", () => {
    const result = computeMasteryStatus(null, [correct, wrong, puzzleCorrect, puzzleCorrect]);
    expect(result.status).toBe("practising");
  });

  it("proficient still fires from overall accuracy regardless of attempt source (unchanged behavior)", () => {
    const result = computeMasteryStatus(null, [correct, correct, correct, correct, puzzleWrong]);
    expect(result.status).toBe("proficient");
  });

  it("repeated game-detected mistakes push a concept to struggling, same as lesson/puzzle evidence", () => {
    const gameWrong = { correct: false, source: "game" as const };
    const result = computeMasteryStatus(null, [gameWrong, gameWrong, gameWrong]);
    expect(result.status).toBe("struggling");
  });

  it("lesson-only attempt histories are completely unaffected by the source field (backward compatible)", () => {
    // Every existing test above passes plain {correct} objects with no
    // `source` at all — this just makes that equivalence explicit.
    const withoutSource = computeMasteryStatus(null, [correct, correct, correct, correct, wrong]);
    const withExplicitLessonSource = computeMasteryStatus(null, [
      { correct: true, source: "lesson" as const },
      { correct: true, source: "lesson" as const },
      { correct: true, source: "lesson" as const },
      { correct: true, source: "lesson" as const },
      { correct: false, source: "lesson" as const },
    ]);
    expect(withoutSource).toEqual(withExplicitLessonSource);
  });
});
