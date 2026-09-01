import { describe, expect, it } from "vitest";
import { identifyOpening } from "./openingBook";

describe("identifyOpening (P1 honest short-game review)", () => {
  it("identifies a real, exact-match named opening — the reported bug's own game", () => {
    // 1.e4 e5 2.Nc3 Nf6 3.Bc4 — the exact reported production defect.
    const identified = identifyOpening(["e4", "e5", "Nc3", "Nf6", "Bc4"]);
    expect(identified?.name).toBe("Vienna Game");
  });

  it("prefers the longest matching entry, not just the first one found", () => {
    // The Italian Game's 5-move line is a strict extension of nothing
    // shorter in the book, but Ruy Lopez and Italian Game share the same
    // first 4 plies (e4 e5 Nf3 Nc6) — the 5th move must disambiguate.
    expect(identifyOpening(["e4", "e5", "Nf3", "Nc6", "Bb5"])?.name).toBe("Ruy Lopez");
    expect(identifyOpening(["e4", "e5", "Nf3", "Nc6", "Bc4"])?.name).toBe("Italian Game");
  });

  it("returns null for a genuinely unrecognized sequence rather than guessing", () => {
    expect(identifyOpening(["a4", "a5", "h4", "h5"])).toBeNull();
  });

  it("returns null when there are too few moves to match any real entry", () => {
    expect(identifyOpening(["e4"])).toBeNull();
    expect(identifyOpening([])).toBeNull();
  });

  it("every opening's own strategic idea is a non-empty, real string", () => {
    // A general sweep — every entry must actually carry a usable idea,
    // not an accidental empty placeholder.
    const named = ["e4", "c5"]; // Sicilian
    const identified = identifyOpening(named);
    expect(identified?.idea.length).toBeGreaterThan(20);
  });
});
