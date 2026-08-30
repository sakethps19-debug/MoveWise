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

  it("a hint-assisted correct run has lower exerciseConfidence than an identical hint-free run, though status is unaffected", () => {
    // Same accuracy (4/5 -> proficient either way), but every attempt in
    // the hinted version leaned fully on the hint ladder — real, confirmed
    // gap this locks in: schema.prisma's own doc comment on
    // exerciseConfidence promises "accuracy/hint-usage", but until this
    // fix hintLevelUsed was accepted on the type and never once read.
    const noHints = computeMasteryStatus(null, [correct, correct, correct, correct, wrong]);
    const maxHints = computeMasteryStatus(null, [
      { correct: true, hintLevelUsed: 3 },
      { correct: true, hintLevelUsed: 3 },
      { correct: true, hintLevelUsed: 3 },
      { correct: true, hintLevelUsed: 3 },
      { correct: false, hintLevelUsed: 3 },
    ]);
    expect(maxHints.status).toBe(noHints.status);
    expect(maxHints.exerciseConfidence).toBeLessThan(noHints.exerciseConfidence);
    expect(maxHints.exerciseConfidence).toBeCloseTo(0.6); // 0.8 accuracy - the full 0.2 hint penalty
  });

  it("an attempt with no hintLevelUsed at all (every attempt recorded before this field existed) is identical to hintLevelUsed: 0", () => {
    const withField = computeMasteryStatus(null, [
      { correct: true, hintLevelUsed: 0 },
      { correct: true, hintLevelUsed: 0 },
      { correct: true, hintLevelUsed: 0 },
      { correct: true, hintLevelUsed: 0 },
      { correct: false, hintLevelUsed: 0 },
    ]);
    const withoutField = computeMasteryStatus(null, [correct, correct, correct, correct, wrong]);
    expect(withField).toEqual(withoutField);
  });

  it("a partial hint (one attempt out of several, one tier of three) only partially discounts confidence", () => {
    const result = computeMasteryStatus(null, [
      { correct: true, hintLevelUsed: 1 },
      correct,
      correct,
      correct,
      wrong,
    ]);
    // accuracy 0.8, penalty = (1/3)/5 attempts * 0.2 max = 0.013333...
    expect(result.exerciseConfidence).toBeLessThan(0.8);
    expect(result.exerciseConfidence).toBeCloseTo(0.8 - (1 / 3 / 5) * 0.2, 5);
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
