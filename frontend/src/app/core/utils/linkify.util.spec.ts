import { describe, it, expect } from "vitest";
import { splitLinkSegments } from "./linkify.util";

describe("splitLinkSegments", () => {
  it("returns no segments for nullish or empty input", () => {
    expect(splitLinkSegments(null)).toEqual([]);
    expect(splitLinkSegments(undefined)).toEqual([]);
    expect(splitLinkSegments("")).toEqual([]);
    expect(splitLinkSegments(123 as unknown as string)).toEqual([
      { kind: "text", text: "123", href: "" },
    ]);
  });

  it("keeps plain text without URLs as a single segment", () => {
    expect(splitLinkSegments("Visit the portal soon")).toEqual([
      { kind: "text", text: "Visit the portal soon", href: "" },
    ]);
  });

  it("detects a URL in the middle of text", () => {
    expect(
      splitLinkSegments("Apply at https://pmsuryaghar.gov.in/ today"),
    ).toEqual([
      { kind: "text", text: "Apply at ", href: "" },
      {
        kind: "link",
        text: "https://pmsuryaghar.gov.in/",
        href: "https://pmsuryaghar.gov.in/",
      },
      { kind: "text", text: " today", href: "" },
    ]);
  });

  it("detects URLs at the start and end of text", () => {
    const segments = splitLinkSegments(
      "https://example.gov.in/a then plain then http://example.gov.in/b",
    );
    expect(segments.filter((s) => s.kind === "link")).toEqual([
      {
        kind: "link",
        text: "https://example.gov.in/a",
        href: "https://example.gov.in/a",
      },
      {
        kind: "link",
        text: "http://example.gov.in/b",
        href: "http://example.gov.in/b",
      },
    ]);
    expect(segments.map((s) => s.text).join("")).toBe(
      "https://example.gov.in/a then plain then http://example.gov.in/b",
    );
  });

  it("preserves trailing punctuation outside the link", () => {
    expect(splitLinkSegments("See https://example.gov.in/a, then.")).toEqual([
      { kind: "text", text: "See ", href: "" },
      {
        kind: "link",
        text: "https://example.gov.in/a",
        href: "https://example.gov.in/a",
      },
      { kind: "text", text: ", then.", href: "" },
    ]);
  });

  it("never linkifies unsafe schemes", () => {
    const segments = splitLinkSegments("Click javascript:alert(1) now");
    expect(segments).toEqual([
      { kind: "text", text: "Click javascript:alert(1) now", href: "" },
    ]);
  });

  it("handles long text with mixed content losslessly", () => {
    const long =
      "Step one. Visit https://a.gov.in/x?y=1&z=2 for details (see guide). " +
      "Then open https://b.gov.in/path_(detail)/end! Done.";
    const segments = splitLinkSegments(long);
    expect(segments.map((s) => s.text).join("")).toBe(long);
    expect(segments.filter((s) => s.kind === "link").length).toBe(2);
  });
});
