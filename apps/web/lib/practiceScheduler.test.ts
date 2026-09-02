import { describe, expect, it } from "vitest";
import type { Puzzle } from "@movewise/exercise-schema";
import {
  buildPracticeQueue,
  computeReviewSchedule,
  rankConceptsForPractice,
  type ConceptPracticeSignal,
} from "./practiceScheduler";
import type { WarmUpCandidate } from "./warmUp";

function puzzle(id: string, conceptId: string, difficulty: 1 | 2 | 3 = 1): Puzzle {
  return {
    id,
    kind: "move",
    conceptIds: [conceptId],
    fen: "8/8/8/8/8/8/8/K6k w - - 0 1",
    prompt: "Move.",
    correctMoves: ["Ka1"],
    difficulty,
    feedback: { default: "Not quite." },
  };
}

function signal(overrides: Partial<ConceptPracticeSignal> & Pick<ConceptPracticeSignal, "conceptId">): ConceptPracticeSignal {
  return {
    status: null,
    exerciseConfidence: 0,
    lastPracticedAt: null,
    nextDueAt: null,
    placementEvidenceLevel: null,
    recentIncorrectCount: 0,
    ...overrides,
  };
}

describe("computeReviewSchedule", () => {
  const day = 24 * 60 * 60 * 1000;

  it("schedules an unpracticed concept due immediately (box 0)", () => {
    const now = new Date("2026-01-10T00:00:00Z");
    const result = computeReviewSchedule([], now);
    expect(result.box).toBe(0);
    expect(result.nextDueAt).toEqual(now);
  });

  it("advances the box (and the interval) on each consecutive correct attempt", () => {
    const base = new Date("2026-01-01T00:00:00Z").getTime();
    const attempts = [
      { correct: true, at: new Date(base) },
      { correct: true, at: new Date(base + day) },
      { correct: true, at: new Date(base + 2 * day) },
    ];
    const result = computeReviewSchedule(attempts);
    expect(result.box).toBe(3);
    expect(result.intervalDays).toBe(7);
  });

  it("resets the box to zero the moment the most recent attempt is incorrect", () => {
    const base = new Date("2026-01-01T00:00:00Z").getTime();
    const attempts = [
      { correct: true, at: new Date(base) },
      { correct: true, at: new Date(base + day) },
      { correct: false, at: new Date(base + 2 * day) },
    ];
    const result = computeReviewSchedule(attempts);
    expect(result.box).toBe(0);
    expect(result.intervalDays).toBe(1);
  });

  it("caps the box at the longest configured interval instead of growing unbounded", () => {
    const base = new Date("2026-01-01T00:00:00Z").getTime();
    const attempts = Array.from({ length: 20 }, (_, i) => ({ correct: true, at: new Date(base + i * day) }));
    const result = computeReviewSchedule(attempts);
    expect(result.intervalDays).toBe(30);
  });

  it("computes nextDueAt as the last attempt's time plus the interval", () => {
    const last = new Date("2026-01-05T00:00:00Z");
    const result = computeReviewSchedule([{ correct: false, at: last }]);
    expect(result.nextDueAt.getTime()).toBe(last.getTime() + day);
  });
});

describe("rankConceptsForPractice", () => {
  const now = new Date("2026-01-10T00:00:00Z");

  it("ranks a struggling, overdue concept above a proficient, not-due one", () => {
    const ranked = rankConceptsForPractice(
      [
        signal({ conceptId: "knight-fork", status: "struggling", recentIncorrectCount: 2 }),
        signal({ conceptId: "king-movement", status: "proficient", exerciseConfidence: 1, nextDueAt: new Date("2026-06-01") }),
      ],
      now,
    );
    expect(ranked[0]!.conceptId).toBe("knight-fork");
    expect(ranked[0]!.reason).toMatch(/struggling/);
  });

  it("ranks an overdue review above one not yet due", () => {
    const ranked = rankConceptsForPractice(
      [
        signal({ conceptId: "a", status: "practising", nextDueAt: new Date("2026-01-01T00:00:00Z") }),
        signal({ conceptId: "b", status: "practising", nextDueAt: new Date("2026-06-01T00:00:00Z") }),
      ],
      now,
    );
    expect(ranked[0]!.conceptId).toBe("a");
    expect(ranked[0]!.reason).toMatch(/overdue/);
  });

  it("gives every ranked concept a non-generic, human-readable reason", () => {
    const ranked = rankConceptsForPractice(
      [
        signal({ conceptId: "a", placementEvidenceLevel: "needs_confirmation" }),
        signal({ conceptId: "b", placementEvidenceLevel: "unverified" }),
        signal({ conceptId: "c", status: "proficient", exerciseConfidence: 1 }),
      ],
      now,
    );
    for (const r of ranked) expect(r.reason.length).toBeGreaterThan(0);
    expect(ranked.find((r) => r.conceptId === "a")!.reason).toMatch(/confirm/);
    expect(ranked.find((r) => r.conceptId === "b")!.reason).toMatch(/never directly tested/);
  });

  it("ranks a later_contradicted concept high, surfacing it again despite an earlier placement pass", () => {
    const ranked = rankConceptsForPractice(
      [
        signal({ conceptId: "rook-movement", placementEvidenceLevel: "later_contradicted" }),
        signal({ conceptId: "queen-movement", placementEvidenceLevel: "directly_demonstrated", exerciseConfidence: 1 }),
      ],
      now,
    );
    expect(ranked[0]!.conceptId).toBe("rook-movement");
  });
});

describe("buildPracticeQueue: a rated learner does not repeatedly get elementary king-movement puzzles", () => {
  const candidates: WarmUpCandidate[] = [
    { puzzle: puzzle("king-1", "king-movement", 1), unitId: "meet-the-pieces", conceptId: "king-movement" },
    { puzzle: puzzle("fork-1", "knight-fork", 2), unitId: "basic-tactics", conceptId: "knight-fork" },
    { puzzle: puzzle("hanging-1", "hanging-pieces", 2), unitId: "basic-tactics", conceptId: "hanging-pieces" },
  ];

  it("fills the queue from the learner's real weak spots, not king-movement, when king-movement is solid", () => {
    const ranked = rankConceptsForPractice(
      [
        signal({ conceptId: "king-movement", status: "proficient", exerciseConfidence: 1, nextDueAt: new Date("2027-01-01") }),
        signal({ conceptId: "knight-fork", status: "struggling", recentIncorrectCount: 3 }),
        signal({ conceptId: "hanging-pieces", status: "practising", recentIncorrectCount: 1 }),
      ],
      new Date("2026-01-10"),
    );
    const queue = buildPracticeQueue(candidates, ranked, { count: 2, preferredDifficulty: 2 });
    expect(queue.map((q) => q.conceptId)).toEqual(["knight-fork", "hanging-pieces"]);
    expect(queue.some((q) => q.conceptId === "king-movement")).toBe(false);
  });

  it("brings king-movement back into the queue once later performance shows it's actually needed", () => {
    const ranked = rankConceptsForPractice(
      [
        signal({ conceptId: "king-movement", status: "struggling", recentIncorrectCount: 2 }),
        signal({ conceptId: "knight-fork", status: "proficient", exerciseConfidence: 1, nextDueAt: new Date("2027-01-01") }),
        signal({ conceptId: "hanging-pieces", status: "proficient", exerciseConfidence: 1, nextDueAt: new Date("2027-01-01") }),
      ],
      new Date("2026-01-10"),
    );
    const queue = buildPracticeQueue(candidates, ranked, { count: 2, preferredDifficulty: 2 });
    expect(queue[0]!.conceptId).toBe("king-movement");
    expect(queue[0]!.reason).toMatch(/struggling|missed/);
  });

  it("every queued item carries a human-readable reason", () => {
    const ranked = rankConceptsForPractice(
      [signal({ conceptId: "knight-fork", status: "learning" }), signal({ conceptId: "hanging-pieces", status: "learning" })],
      new Date("2026-01-10"),
    );
    const queue = buildPracticeQueue(candidates, ranked, { count: 2, preferredDifficulty: 2 });
    for (const item of queue) expect(item.reason.length).toBeGreaterThan(0);
  });

  it("avoids a puzzle just seen when an alternative for the same concept exists", () => {
    const twoForkPuzzles: WarmUpCandidate[] = [
      { puzzle: puzzle("fork-1", "knight-fork", 2), unitId: "basic-tactics", conceptId: "knight-fork" },
      { puzzle: puzzle("fork-2", "knight-fork", 2), unitId: "basic-tactics", conceptId: "knight-fork" },
    ];
    const ranked = rankConceptsForPractice([signal({ conceptId: "knight-fork", status: "learning" })], new Date("2026-01-10"));
    const queue = buildPracticeQueue(twoForkPuzzles, ranked, {
      count: 1,
      preferredDifficulty: 2,
      recentlySeenPuzzleIds: new Set(["fork-1"]),
    });
    expect(queue[0]!.puzzle.id).toBe("fork-2");
  });

  it("prefers the requested difficulty but still queues something when no exact match exists", () => {
    const ranked = rankConceptsForPractice([signal({ conceptId: "king-movement", status: "learning" })], new Date("2026-01-10"));
    const queue = buildPracticeQueue(candidates, ranked, { count: 1, preferredDifficulty: 3 });
    expect(queue).toHaveLength(1);
    expect(queue[0]!.conceptId).toBe("king-movement");
  });

  it("a fully-demonstrated advanced guest (every concept scores identically 'trusted') still gets a Hard-difficulty pick, not king-movement's elementary puzzle, via the difficulty-fit tiebreak", () => {
    // The exact regression this scenario guards against: once nothing
    // distinguishes concepts by mistakes or due dates (a guest who aced
    // every placement item), a naive tie falls back to array/insertion
    // order, which happens to put the curriculum's first, easiest concept
    // (king-movement) ahead of a genuinely advanced one.
    const signals = [
      signal({ conceptId: "king-movement", placementEvidenceLevel: "inferred_high_confidence", exerciseConfidence: 1 }),
      signal({ conceptId: "knight-fork", placementEvidenceLevel: "directly_demonstrated", exerciseConfidence: 1 }),
      signal({ conceptId: "hanging-pieces", placementEvidenceLevel: "directly_demonstrated", exerciseConfidence: 1 }),
    ];
    const ranked = rankConceptsForPractice(signals, new Date("2026-01-10"));
    // Confirms the fix at the ranking level too: no evidence-level bonus
    // lets an inferred concept outscore a directly-demonstrated one.
    expect(ranked.every((r) => r.score === ranked[0]!.score)).toBe(true);

    const queue = buildPracticeQueue(candidates, ranked, { count: 2, preferredDifficulty: 3 });
    expect(queue.map((q) => q.conceptId)).toEqual(["knight-fork", "hanging-pieces"]);
    expect(queue.some((q) => q.conceptId === "king-movement")).toBe(false);
  });
});
