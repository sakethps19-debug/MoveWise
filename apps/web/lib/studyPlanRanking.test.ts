import { describe, expect, it } from "vitest";
import { rankConcepts } from "./studyPlanRanking";
import type { MasteryStatus } from "./masteryModel";

describe("rankConcepts", () => {
  it("never exceeds the cap, even from a game with many distinct instructive mistakes", () => {
    const moves = Array.from({ length: 8 }, (_, i) => ({
      conceptIds: [`fake-concept-${i}`],
      classification: "blunder" as const,
    }));
    // Every concept here is "never studied" (no UserConceptMastery row),
    // so every one qualifies — the cap is what should stop this at 4.
    expect(rankConcepts(moves, null).length).toBeLessThanOrEqual(4);
  });

  it("doesn't prescribe a one-time oversight against an already-tracked, non-proficient concept", () => {
    const moves = [{ conceptIds: ["knight-fork"], classification: "blunder" as const }];
    const conceptMastery = new Map<string, MasteryStatus>([["knight-fork", "learning"]]);
    expect(rankConcepts(moves, conceptMastery)).toEqual([]);
  });

  it("prescribes a concept that recurs across multiple instructive moves in this game", () => {
    const moves = [
      { conceptIds: ["knight-fork"], classification: "blunder" as const },
      { conceptIds: ["knight-fork"], classification: "mistake" as const },
    ];
    const conceptMastery = new Map<string, MasteryStatus>([["knight-fork", "learning"]]);
    expect(rankConcepts(moves, conceptMastery)).toEqual(["knight-fork"]);
  });

  it("prescribes a never-studied concept even from a single occurrence", () => {
    const moves = [{ conceptIds: ["knight-fork"], classification: "blunder" as const }];
    expect(rankConcepts(moves, null)).toEqual(["knight-fork"]);
  });

  it("prescribes 'learned but not transferred' even from a single occurrence", () => {
    const moves = [{ conceptIds: ["knight-fork"], classification: "blunder" as const }];
    const conceptMastery = new Map<string, MasteryStatus>([["knight-fork", "proficient"]]);
    expect(rankConcepts(moves, conceptMastery)).toEqual(["knight-fork"]);
  });

  it("ignores inaccuracies entirely — only mistake/blunder feed the study plan", () => {
    const moves = [{ conceptIds: ["knight-fork"], classification: "inaccuracy" as const }];
    expect(rankConcepts(moves, null)).toEqual([]);
  });

  it("ranks never-studied/learned-but-not-transferred above a plain in-game repeat", () => {
    const moves = [
      { conceptIds: ["repeated-concept"], classification: "blunder" as const },
      { conceptIds: ["repeated-concept"], classification: "mistake" as const },
      { conceptIds: ["repeated-concept"], classification: "mistake" as const },
      { conceptIds: ["never-studied-concept"], classification: "blunder" as const },
    ];
    const conceptMastery = new Map<string, MasteryStatus>([["repeated-concept", "learning"]]);
    const ranked = rankConcepts(moves, conceptMastery);
    expect(ranked[0]).toBe("never-studied-concept");
  });
});
