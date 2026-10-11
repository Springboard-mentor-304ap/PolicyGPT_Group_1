import { describe, it, expect } from "vitest";
import { visiblePageWindow, fitPageSize } from "./pagination.util";

describe("visiblePageWindow", () => {
  it("should show pages 1-3 on the first pages", () => {
    expect(visiblePageWindow(1, 6)).toEqual([1, 2, 3]);
    expect(visiblePageWindow(2, 6)).toEqual([1, 2, 3]);
    expect(visiblePageWindow(3, 6)).toEqual([1, 2, 3]);
  });

  it("should slide the window forward as the user navigates", () => {
    expect(visiblePageWindow(4, 6)).toEqual([2, 3, 4]);
    expect(visiblePageWindow(5, 6)).toEqual([3, 4, 5]);
    expect(visiblePageWindow(6, 6)).toEqual([4, 5, 6]);
  });

  it("should shift back correctly when navigating backwards", () => {
    // From page 4, clicking < lands on 3 -> [1, 2, 3].
    expect(visiblePageWindow(3, 6)).toEqual([1, 2, 3]);
  });

  it("should show only available pages when fewer than three exist", () => {
    expect(visiblePageWindow(1, 1)).toEqual([1]);
    expect(visiblePageWindow(1, 2)).toEqual([1, 2]);
    expect(visiblePageWindow(2, 2)).toEqual([1, 2]);
  });

  it("should return an empty window when there are no pages", () => {
    expect(visiblePageWindow(1, 0)).toEqual([]);
  });

  it("should clamp out-of-range current pages into the window", () => {
    expect(visiblePageWindow(99, 10)).toEqual([8, 9, 10]);
    expect(visiblePageWindow(0, 10)).toEqual([1, 2, 3]);
  });
});

describe("fitPageSize", () => {
  it("should shrink the page size to the record count when smaller", () => {
    expect(fitPageSize(6, 4)).toBe(4);
    expect(fitPageSize(20, 10)).toBe(10);
  });

  it("should preserve the selected size when the set is larger", () => {
    expect(fitPageSize(6, 25)).toBe(6);
    expect(fitPageSize(6, 6)).toBe(6);
  });

  it("should never return zero for empty result sets", () => {
    expect(fitPageSize(6, 0)).toBe(6);
    expect(fitPageSize(10, -3)).toBe(10);
  });
});
