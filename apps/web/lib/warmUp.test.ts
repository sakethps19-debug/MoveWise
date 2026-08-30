import { describe, expect, it } from "vitest";
import { easierDifficulty, harderDifficulty } from "./warmUp";

describe("easierDifficulty / harderDifficulty", () => {
  it("clamp at the 1-3 bounds instead of going out of range", () => {
    expect(easierDifficulty(1)).toBe(1);
    expect(harderDifficulty(3)).toBe(3);
    expect(easierDifficulty(2)).toBe(1);
    expect(harderDifficulty(2)).toBe(3);
  });
});
