import { describe, expect, it } from "vitest";
import { nextPlacementItemId, scorePlacement, earlyExitReason, PLACEMENT_ITEM_COUNT, type PlacementAnswer } from "./placement";

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
  it("never extends the cluster-level inference to an untested concept (king-movement) from a single correct answer out of four — a genuinely tested concept (rook-movement, its OWN item) still gets its own deserved direct credit", () => {
    const result = scorePlacement([
      answer("placement.movement-rook", true),
      answer("placement.movement-bishop", false),
      answer("placement.movement-queen", false),
      answer("placement.movement-knight", false),
    ]);
    // rook-movement's own item really was answered correctly — real,
    // narrow, deserved evidence for that one concept specifically, not
    // the "lucky guess grants everything" case this test guards against.
    expect(result.demonstratedConceptIds).toContain("rook-movement");
    // king-movement has no dedicated item at all — it can only ever come
    // from the cluster-level inference, which requires 2 of 4, not 1.
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

  /**
   * P0 "make placement evidence honest" regression coverage: real,
   * reported defect — a single elementary Kf6 escort move used to mark
   * `opposition-key-squares` directly_demonstrated, silently bypassing
   * basic-tactics.05-the-opposition's entire lesson (a real curriculum
   * skip) even though the move never actually tested opposition/key-square
   * theory. Fixed by re-scoping placement.endgame-king-escort's own
   * conceptIds to what the move actually demonstrates.
   */
  it("a correct endgame-king-escort answer never grants opposition-key-squares — that concept has its own dedicated lesson and must be earned there", () => {
    const result = scorePlacement([answer("placement.endgame-king-escort", true)]);
    expect(result.demonstratedConceptIds).not.toContain("opposition-key-squares");
    const oppositionEvidence = result.conceptEvidence.find((e) => e.conceptId === "opposition-key-squares");
    expect(oppositionEvidence).toBeUndefined(); // removed from the placement universe entirely, not just left unverified
  });

  it("a correct endgame-king-escort answer directly demonstrates pawn-escort-technique — real evidence for what the move actually was", () => {
    const result = scorePlacement([answer("placement.endgame-king-escort", true)]);
    const escort = result.conceptEvidence.find((e) => e.conceptId === "pawn-escort-technique")!;
    expect(escort.level).toBe("directly_demonstrated");
    expect(escort.source).toBe("placement.endgame-king-escort");
    expect(result.demonstratedConceptIds).toContain("pawn-escort-technique");
  });

  it("a wrong endgame-king-escort answer does not demonstrate pawn-escort-technique", () => {
    const result = scorePlacement([answer("placement.endgame-king-escort", false)]);
    expect(result.demonstratedConceptIds).not.toContain("pawn-escort-technique");
  });

  /**
   * Regression coverage for a real bug found via e2e testing while
   * building the fix above: an earlier version of this fix also attached
   * king-movement/pawn-movement directly to these advanced-tier items, on
   * the reasoning that a correct answer really does involve moving a king
   * or pawn. That reasoning broke on the *wrong*-answer case — a wrong
   * answer to an advanced judgment item (e.g. escorting the pawn to the
   * wrong square) is very often still a fully legal king/pawn move, but
   * scorePlacement's per-item loop marks every one of a wrong item's own
   * conceptIds "unverified" and permanently excludes them from the
   * cluster-level fallback — silently erasing king-movement/pawn-movement
   * evidence the foundational cluster had already legitimately
   * established, confirmed live via a homepage recommendation regressing
   * from "bypassed" back to "Meet the king" recommended. king-movement and
   * pawn-movement must only ever be earned through the foundational
   * cluster here — never coupled to an unrelated advanced item's pass/fail.
   */
  it("a wrong endgame-king-escort or back-rank-safety answer never touches king-movement/pawn-movement's own evidence — only the foundational cluster does", () => {
    const result = scorePlacement([
      answer("placement.movement-rook", true),
      answer("placement.movement-bishop", true),
      answer("placement.movement-queen", true),
      answer("placement.movement-knight", true),
      answer("placement.endgame-king-escort", false),
      answer("placement.back-rank-safety", false),
    ]);
    const kingMovement = result.conceptEvidence.find((e) => e.conceptId === "king-movement")!;
    const pawnMovement = result.conceptEvidence.find((e) => e.conceptId === "pawn-movement")!;
    // Still demonstrated — via the 4/4 foundational cluster, unaffected by
    // the two unrelated advanced items being answered wrong.
    expect(kingMovement.level).toBe("inferred_high_confidence");
    expect(pawnMovement.level).toBe("inferred_high_confidence");
    expect(result.demonstratedConceptIds).toContain("king-movement");
    expect(result.demonstratedConceptIds).toContain("pawn-movement");
  });
});

describe("scorePlacement's conceptEvidence (P1 'honest placement evidence')", () => {
  it("never conflates an untested foundational-cluster concept (king/pawn movement) with a concept whose own item was actually answered", () => {
    const result = scorePlacement([
      answer("placement.movement-rook", true),
      answer("placement.movement-bishop", true),
      answer("placement.movement-queen", false),
      answer("placement.movement-knight", false),
    ]);
    const rook = result.conceptEvidence.find((e) => e.conceptId === "rook-movement")!;
    const king = result.conceptEvidence.find((e) => e.conceptId === "king-movement")!;
    // Both end up in the same bypass-eligible bucket today (2/4 grants the
    // cluster), but they must never be reported as the SAME evidence level
    // for the SAME reason — king-movement was never itself asked.
    expect(king.level).toBe("inferred_high_confidence");
    expect(king.source).not.toBe(rook.source);
    expect(king.source).toMatch(/foundational-cluster/);
  });

  it("marks a core-tier concept directly_demonstrated only when its own item was answered correctly", () => {
    const result = scorePlacement([answer("placement.recognize-check", true), answer("placement.recognize-checkmate", false)]);
    const check = result.conceptEvidence.find((e) => e.conceptId === "check")!;
    const checkmate = result.conceptEvidence.find((e) => e.conceptId === "checkmate")!;
    expect(check.level).toBe("directly_demonstrated");
    expect(check.source).toBe("placement.recognize-check");
    expect(checkmate.level).toBe("unverified");
  });

  it("marks the untested cluster concepts needs_confirmation (not unverified, not demonstrated) at exactly 1 of 4 correct", () => {
    const result = scorePlacement([
      answer("placement.movement-rook", true),
      answer("placement.movement-bishop", false),
      answer("placement.movement-queen", false),
      answer("placement.movement-knight", false),
    ]);
    // king-movement has no dedicated item — only the 1-of-4 cluster signal applies to it.
    const king = result.conceptEvidence.find((e) => e.conceptId === "king-movement")!;
    expect(king.level).toBe("needs_confirmation");
    expect(result.demonstratedConceptIds).not.toContain("king-movement");
    // rook-movement's own item WAS answered correctly — real direct evidence, not a cluster inference at all.
    const rook = result.conceptEvidence.find((e) => e.conceptId === "rook-movement")!;
    expect(rook.level).toBe("directly_demonstrated");
  });

  it("reports every concept in the placement universe explicitly, even ones never asked about at all", () => {
    // "checkmate" (a core-tier concept with its own dedicated item,
    // placement.recognize-checkmate) is outside the foundational cluster,
    // so it can never be silently swept up by the cluster-level inference
    // the way an untested cluster concept can — only answering its own
    // item moves it off "unverified". Not opposition-key-squares: P0
    // "honest placement evidence" deliberately removed that concept from
    // the placement universe entirely (see lib/placement.ts's doc comment
    // on placement.endgame-king-escort) rather than ever reporting it
    // — even as "unverified" — as something this assessment covers.
    const result = scorePlacement([answer("placement.movement-rook", true), answer("placement.movement-bishop", true)]);
    const neverAsked = result.conceptEvidence.find((e) => e.conceptId === "checkmate")!;
    expect(neverAsked).toBeDefined();
    expect(neverAsked.level).toBe("unverified");
    expect(neverAsked.source).toBe("not-asked");
  });

  it("demonstratedConceptIds is exactly the set of directly_demonstrated + inferred_high_confidence concepts in conceptEvidence", () => {
    const result = scorePlacement([
      answer("placement.movement-rook", true),
      answer("placement.movement-bishop", true),
      answer("placement.movement-queen", true),
      answer("placement.movement-knight", true),
      answer("placement.recognize-check", true),
    ]);
    const expected = result.conceptEvidence
      .filter((e) => e.level === "directly_demonstrated" || e.level === "inferred_high_confidence")
      .map((e) => e.conceptId)
      .sort();
    expect([...result.demonstratedConceptIds].sort()).toEqual(expected);
  });
});

describe("earlyExitReason", () => {
  it("is null for a full-length run (14 of 14 answered)", () => {
    let answers: PlacementAnswer[] = [];
    for (let i = 0; i < 20; i++) {
      const next = nextPlacementItemId(answers);
      if (next === null) break;
      answers = [...answers, answer(next, true)];
    }
    expect(answers).toHaveLength(PLACEMENT_ITEM_COUNT);
    expect(earlyExitReason(answers)).toBeNull();
  });

  it("names the 3-consecutive-wrong-core-answers reason for that early exit", () => {
    let answers: PlacementAnswer[] = [
      answer("placement.movement-rook", true),
      answer("placement.movement-bishop", true),
      answer("placement.movement-queen", true),
      answer("placement.movement-knight", true),
    ];
    for (let i = 0; i < 10; i++) {
      const next = nextPlacementItemId(answers);
      if (next === null) break;
      answers = [...answers, answer(next, false)];
    }
    expect(nextPlacementItemId(answers)).toBeNull();
    expect(answers.length).toBeLessThan(PLACEMENT_ITEM_COUNT);
    expect(earlyExitReason(answers)).toMatch(/3 consecutive incorrect core-tier answers/);
  });
});
