import { describe, expect, it } from "vitest";
import { describeMateTransition, formatEval, formatEvalLoss, isMateScore } from "./evalFormat";

describe("isMateScore", () => {
  it("recognizes a White mate sentinel", () => {
    expect(isMateScore(99000)).toBe(true);
  });
  it("recognizes a Black mate sentinel", () => {
    expect(isMateScore(-98000)).toBe(true);
  });
  it("does not flag an ordinary centipawn score, even a large one", () => {
    expect(isMateScore(1250)).toBe(false);
    expect(isMateScore(-3400)).toBe(false);
  });
});

describe("formatEval", () => {
  it("formats a White mate score as M<n>", () => {
    expect(formatEval(99000)).toBe("M1");
    expect(formatEval(97000)).toBe("M3");
  });
  it("formats a Black mate score as -M<n>", () => {
    expect(formatEval(-98000)).toBe("-M2");
  });
  it("formats an ordinary centipawn score with a sign, never a raw sentinel", () => {
    expect(formatEval(45)).toBe("+45cp");
    expect(formatEval(-120)).toBe("-120cp");
    expect(formatEval(0)).toBe("0cp");
  });
});

describe("describeMateTransition", () => {
  it("reports 'Found checkmate' when the move itself delivers mate, regardless of the eval numbers", () => {
    expect(describeMateTransition(99000, 100000, "w", true)).toBe("Found checkmate");
  });

  it("reports 'Missed mate in 1' when mate-in-1 was available and this move didn't deliver it", () => {
    // White had mate in 1 (evalBefore) but didn't play it (isCheckmateNow=false).
    expect(describeMateTransition(99000, 400, "w", false)).toBe("Missed mate in 1");
  });

  it("reports 'Missed mate in N' for a deeper missed mate that evaporated entirely", () => {
    expect(describeMateTransition(97000, 100, "w", false)).toBe("Missed mate in 3");
  });

  it("reports 'Allowed mate in N' when the move handed the opponent a forced mate that wasn't there before", () => {
    // Black to move; evalAfter shows White (the opponent) now has mate in 2.
    expect(describeMateTransition(-20, 98000, "b", false)).toBe("Allowed mate in 2");
  });

  it("reports 'Escaped a mating threat' when a forced mate against the mover is no longer there afterward", () => {
    // White to move, was facing Black's forced mate in 3 (evalBefore negative
    // from White's perspective), and the position is level afterward.
    expect(describeMateTransition(-97000, 10, "w", false)).toBe("Escaped a mating threat");
  });

  it("returns null for an ordinary, non-mate-related move", () => {
    expect(describeMateTransition(20, 15, "w", false)).toBeNull();
  });

  it("never produces the absurd raw-centipawn-style bug this exists to prevent", () => {
    const result = describeMateTransition(-20, 99000, "b", false);
    expect(result).not.toMatch(/\d{4,}/); // no 4+ digit raw number anywhere in the phrase
    expect(result).toBe("Allowed mate in 1");
  });
});

describe("formatEvalLoss", () => {
  it("shows the mate-transition phrase instead of a raw centipawn delta when either side of the move is a mate score", () => {
    // The exact real-world case this was found from: Black's blunder
    // handing White mate in 1 previously rendered as "-99020cp".
    expect(formatEvalLoss(-20, 99000, "b", false)).toBe("Allowed mate in 1");
  });

  it("falls back to ordinary '-NNcp' formatting when neither side is a mate score", () => {
    expect(formatEvalLoss(50, 20, "w", false)).toBe("-30cp");
  });

  it("shows an em dash for zero loss", () => {
    expect(formatEvalLoss(50, 50, "w", false)).toBe("—");
  });
});
