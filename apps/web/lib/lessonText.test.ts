import { describe, expect, it } from "vitest";
import { formatObjectiveSentence } from "./lessonText";

describe("formatObjectiveSentence", () => {
  it("lowercases the first letter so it reads correctly after 'you'll be able to'", () => {
    expect(formatObjectiveSentence("Identify the board's orientation and the two sides")).toBe(
      "identify the board's orientation and the two sides.",
    );
  });

  it("adds terminal punctuation when the source objective has none", () => {
    expect(formatObjectiveSentence("Capture with a rook")).toBe("capture with a rook.");
  });

  it("does not double up terminal punctuation when the source already ends with one", () => {
    expect(formatObjectiveSentence("Castle to bring the king to safety.")).toBe(
      "castle to bring the king to safety.",
    );
    expect(formatObjectiveSentence("Can you do it?")).toBe("can you do it?");
  });

  it("preserves the rest of the sentence exactly, only touching the first letter", () => {
    expect(formatObjectiveSentence("Understand the King's move")).toBe("understand the King's move.");
  });

  it("handles a single-character objective without throwing", () => {
    expect(formatObjectiveSentence("X")).toBe("x.");
  });
});
