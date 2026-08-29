import { describe, expect, it } from "vitest";
import { frontierUnitId, pickWarmUpPuzzles, easierDifficulty, harderDifficulty, type WarmUpCandidate, type WarmUpUnit } from "./warmUp";
import type { Puzzle } from "@movewise/exercise-schema";

function puzzle(id: string, difficulty: 1 | 2 | 3): Puzzle {
  return {
    id,
    conceptIds: ["x"],
    fen: "4k3/8/8/8/8/8/8/4K3 w - - 0 1",
    prompt: "p",
    correctMoves: ["e1e2"],
    difficulty,
    feedback: { default: "f" },
  };
}

const UNITS: WarmUpUnit[] = [
  { id: "meet-the-pieces", principles: [{ conceptId: "rook-movement" }, { conceptId: "king-movement" }] },
  { id: "check-and-checkmate", principles: [{ conceptId: "check" }, { conceptId: "checkmate" }] },
  { id: "basic-tactics", principles: [{ conceptId: "knight-fork" }, { conceptId: "trade-evaluation" }] },
];

describe("frontierUnitId", () => {
  it("returns the first unit for a learner with no demonstrated concepts at all — the pre-existing default", () => {
    expect(frontierUnitId(UNITS, new Set())).toBe("meet-the-pieces");
  });

  it("skips a fully-demonstrated first unit and lands on the next one still in progress", () => {
    const known = new Set(["rook-movement", "king-movement"]);
    expect(frontierUnitId(UNITS, known)).toBe("check-and-checkmate");
  });

  it("falls through to the last unit once every principle in every unit is demonstrated — the rated-player case", () => {
    const known = new Set(["rook-movement", "king-movement", "check", "checkmate", "knight-fork", "trade-evaluation"]);
    expect(frontierUnitId(UNITS, known)).toBe("basic-tactics");
  });

  it("returns null for an empty unit list", () => {
    expect(frontierUnitId([], new Set())).toBeNull();
  });
});

describe("pickWarmUpPuzzles", () => {
  const candidates: WarmUpCandidate[] = [
    { puzzle: puzzle("a", 1), unitId: "u", conceptId: "c" },
    { puzzle: puzzle("b", 1), unitId: "u", conceptId: "c" },
    { puzzle: puzzle("c", 2), unitId: "u", conceptId: "c" },
    { puzzle: puzzle("d", 3), unitId: "u", conceptId: "c" },
  ];

  it("prefers puzzles exactly matching the requested difficulty", () => {
    const picked = pickWarmUpPuzzles(candidates, 1, 2);
    expect(picked.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("falls back to the full candidate pool when too few match the requested difficulty", () => {
    const picked = pickWarmUpPuzzles(candidates, 3, 2); // only 1 puzzle at difficulty 3
    expect(picked).toHaveLength(2);
  });

  it("is deterministic — the same inputs always return the same puzzles", () => {
    expect(pickWarmUpPuzzles(candidates, 2, 1)).toEqual(pickWarmUpPuzzles(candidates, 2, 1));
  });
});

describe("easierDifficulty / harderDifficulty", () => {
  it("clamp at the 1-3 bounds instead of going out of range", () => {
    expect(easierDifficulty(1)).toBe(1);
    expect(harderDifficulty(3)).toBe(3);
    expect(easierDifficulty(2)).toBe(1);
    expect(harderDifficulty(2)).toBe(3);
  });
});
