import { describe, expect, it } from "vitest";
import { identifyOpening } from "./openingBook";

describe("identifyOpening (P1 honest short-game review)", () => {
  it("identifies a real, exact-match named opening — the reported bug's own game", () => {
    // 1.e4 e5 2.Nc3 Nf6 3.Bc4 — the exact reported production defect.
    // Now backed by the real CC0 lichess-org/chess-openings dataset, which
    // resolves this exact 5-ply line to its specific named variation
    // (more precise than the old hand-authored book's family-only name) —
    // exactly the brief's "display family/variation only when move
    // history supports it".
    const identified = identifyOpening(["e4", "e5", "Nc3", "Nf6", "Bc4"]);
    expect(identified?.name).toBe("Vienna Game: Stanley Variation");
  });

  it("prefers the longest matching entry, not just the first one found", () => {
    // The Italian Game's 5-move line is a strict extension of nothing
    // shorter in the book, but Ruy Lopez and Italian Game share the same
    // first 4 plies (e4 e5 Nf3 Nc6) — the 5th move must disambiguate.
    expect(identifyOpening(["e4", "e5", "Nf3", "Nc6", "Bb5"])?.name).toBe("Ruy Lopez");
    expect(identifyOpening(["e4", "e5", "Nf3", "Nc6", "Bc4"])?.name).toBe("Italian Game");
  });

  // The real CC0 dataset has at least one named entry for every one of the
  // 20 legal first moves, so — unlike the old 15-entry hand-authored book —
  // there's no real opening move sequence left that returns null; the only
  // remaining "nothing to match" case is genuinely no moves at all.
  it("returns null for an empty move list — nothing to match against", () => {
    expect(identifyOpening([])).toBeNull();
  });

  it("even a single played move can resolve to a real, named entry when the CC0 dataset has one", () => {
    // 1.e4 alone is itself a named entry ("King's Pawn Game", ECO B00) in
    // the real dataset — this is more accurate than the old hand-authored
    // book, which had no 1-ply entries at all and would have returned null
    // here.
    expect(identifyOpening(["e4"])?.name).toBe("King's Pawn Game");
  });

  it("a curated opening carries a real, non-empty strategic idea", () => {
    const named = ["e4", "c5"]; // Sicilian — one of the curated entries
    const identified = identifyOpening(named);
    expect(identified?.idea.length).toBeGreaterThan(20);
  });

  it("an opening outside the curated idea set still gets an accurate name, with an empty (not fabricated) idea", () => {
    // A real line from the CC0 dataset with no hand-written MoveWise idea
    // text — must never synthesize a strategic claim for it.
    const identified = identifyOpening(["Nh3"]); // Amar Opening
    expect(identified?.name).toBe("Amar Opening");
    expect(identified?.idea).toBe("");
  });

  it("returns a real ECO code alongside the name", () => {
    const identified = identifyOpening(["e4", "c5"]);
    expect(identified?.eco).toMatch(/^[A-E]\d{2}$/);
  });
});
