import { describe, expect, it } from "vitest";
import { parseEnvNumberOverride } from "./envNumber";

describe("parseEnvNumberOverride", () => {
  it("falls back when the env var is unset (undefined)", () => {
    expect(parseEnvNumberOverride(undefined, 20)).toBe(20);
  });

  it("falls back when the env var is an empty string", () => {
    expect(parseEnvNumberOverride("", 20)).toBe(20);
  });

  it("falls back when the env var is non-numeric", () => {
    expect(parseEnvNumberOverride("not-a-number", 20)).toBe(20);
  });

  it("honors an explicit 0 — a real override, not a missing value", () => {
    expect(parseEnvNumberOverride("0", 20)).toBe(0);
  });

  it("honors a normal positive override", () => {
    expect(parseEnvNumberOverride("200", 20)).toBe(200);
  });
});
