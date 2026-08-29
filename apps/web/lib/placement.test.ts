import { describe, expect, it } from "vitest";
import { nextPlacementItemId, scorePlacement, PLACEMENT_ITEM_COUNT, type PlacementAnswer } from "./placement";

function answer(itemId: string, correct: boolean): PlacementAnswer {
  return { itemId, correct };
}

describe("nextPlacementItemId", () => {
  it("asks all 4 foundational items before anything else", () => {
    let answers: PlacementAnswer[] = [];
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      const next = nextPlacementItemId(answers);
      expect(next).not.toBeNull();
      seen.push(next!);
      answers = [...answers, answer(next!, true)];
    }
    expect(seen).toEqual([
      "placement.movement-rook",
      "placement.movement-bishop",
      "placement.movement-queen",
      "placement.movement-knight",
    ]);
  });

  it("ends the assessment early after 3 consecutive wrong core-tier answers, never reaching the advanced tier", () => {
    let answers: PlacementAnswer[] = [
      answer("placement.movement-rook", true),
      answer("placement.movement-bishop", true),
      answer("placement.movement-queen", true),
      answer("placement.movement-knight", true),
    ];
    const asked: string[] = [];
    for (let i = 0; i < 20; i++) {
      const next = nextPlacementItemId(answers);
      if (next === null) break;
      asked.push(next);
      answers = [...answers, answer(next, false)];
    }
    expect(asked.length).toBeLessThan(6);
    expect(asked.some((id) => id.startsWith("placement.trade-evaluation"))).toBe(false);
    expect(nextPlacementItemId(answers)).toBeNull();
  });

  it("reaches the advanced tier when core answers are strong, and terminates after all 14 items", () => {
    let answers: PlacementAnswer[] = [];
    const asked: string[] = [];
    for (let i = 0; i < 20; i++) {
      const next = nextPlacementItemId(answers);
      if (next === null) break;
      asked.push(next);
      answers = [...answers, answer(next, true)];
    }
    expect(asked).toHaveLength(PLACEMENT_ITEM_COUNT);
    expect(asked).toContain("placement.endgame-king-escort");
    expect(nextPlacementItemId(answers)).toBeNull();
  });
});

describe("scorePlacement", () => {
  it("never grants the foundational cluster from a single correct answer out of four", () => {
    const result = scorePlacement([
      answer("placement.movement-rook", true),
      answer("placement.movement-bishop", false),
      answer("placement.movement-queen", false),
      answer("placement.movement-knight", false),
    ]);
    expect(result.demonstratedConceptIds).not.toContain("rook-movement");
    expect(result.demonstratedConceptIds).not.toContain("king-movement");
    expect(result.level).toBe("new");
    expect(result.recommendedStartUnitId).toBeNull();
  });

  it("grants the whole foundational cluster, including untested king/pawn movement, from 2 of 4 correct", () => {
    const result = scorePlacement([
      answer("placement.movement-rook", true),
      answer("placement.movement-bishop", true),
      answer("placement.movement-queen", false),
      answer("placement.movement-knight", false),
    ]);
    expect(result.demonstratedConceptIds).toEqual(
      expect.arrayContaining(["rook-movement", "bishop-movement", "king-movement", "pawn-movement", "board-orientation"]),
    );
  });

  it("marks a rated learner's demonstrated concepts precisely from real answers, unlocking tactics practice without touching piece-movement lessons", () => {
    const answers: PlacementAnswer[] = [
      answer("placement.movement-rook", true),
      answer("placement.movement-bishop", true),
      answer("placement.movement-queen", true),
      answer("placement.movement-knight", true),
      answer("placement.recognize-check", true),
      answer("placement.recognize-checkmate", true),
      answer("placement.hanging-piece", true),
      answer("placement.knight-fork", true),
      answer("placement.king-safety-castling", true),
      answer("placement.decision-capture-checker", true),
      answer("placement.trade-evaluation", true),
      answer("placement.opening-development", true),
      answer("placement.back-rank-safety", true),
      answer("placement.endgame-king-escort", true),
    ];
    const result = scorePlacement(answers);
    expect(result.level).toBe("advanced");
    expect(result.recommendedStartUnitId).toBe("basic-tactics");
    expect(result.demonstratedConceptIds).toEqual(
      expect.arrayContaining(["knight-fork", "hanging-pieces", "checkmate", "trade-evaluation"]),
    );
    expect(result.confidence).toBe(1);
    // Reviewing fundamentals is still explicitly offered even at the top level.
    expect(result.recommendedReviewUnitId).toBe("meet-the-pieces");
  });

  it("does not demonstrate a core concept whose item was never answered correctly", () => {
    const result = scorePlacement([
      answer("placement.movement-rook", true),
      answer("placement.movement-bishop", true),
      answer("placement.recognize-check", false),
    ]);
    expect(result.demonstratedConceptIds).not.toContain("check");
  });

  it("returns 0 confidence and 'new' level for an empty answer set", () => {
    const result = scorePlacement([]);
    expect(result.confidence).toBe(0);
    expect(result.level).toBe("new");
    expect(result.demonstratedConceptIds).toHaveLength(0);
  });
});
