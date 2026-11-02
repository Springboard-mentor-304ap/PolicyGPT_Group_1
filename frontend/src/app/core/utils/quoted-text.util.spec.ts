import { describe, it, expect } from "vitest";
import { splitQuotedSegments } from "./quoted-text.util";

describe("splitQuotedSegments", () => {
  it("should bold a single quoted record name without the quotes", () => {
    expect(splitQuotedSegments('Policy "River Plan" approved successfully.')).toEqual([
      { text: "Policy ", bold: false },
      { text: "River Plan", bold: true },
      { text: " approved successfully.", bold: false },
    ]);
  });

  it("should bold every quoted name when several appear", () => {
    expect(splitQuotedSegments('Move "Alpha" before "Beta".')).toEqual([
      { text: "Move ", bold: false },
      { text: "Alpha", bold: true },
      { text: " before ", bold: false },
      { text: "Beta", bold: true },
      { text: ".", bold: false },
    ]);
  });

  it("should leave plain text as one untouched segment", () => {
    expect(splitQuotedSegments("Policy approved successfully.")).toEqual([
      { text: "Policy approved successfully.", bold: false },
    ]);
  });

  it("should leave apostrophes, lone quotes, and empty quotes literal", () => {
    expect(splitQuotedSegments("Official's request received.")).toEqual([
      { text: "Official's request received.", bold: false },
    ]);
    expect(splitQuotedSegments('Say "hi')).toEqual([{ text: 'Say "hi', bold: false }]);
    expect(splitQuotedSegments('Empty "" quotes.')).toEqual([
      { text: 'Empty "" quotes.', bold: false },
    ]);
  });

  it("should preserve every original character across segments", () => {
    const input = 'Policy "A" and Scheme "B" failed: "oops".';
    const joined = splitQuotedSegments(input)
      .map((s) => (s.bold ? `"${s.text}"` : s.text))
      .join("");
    expect(joined).toBe(input);
  });
});
