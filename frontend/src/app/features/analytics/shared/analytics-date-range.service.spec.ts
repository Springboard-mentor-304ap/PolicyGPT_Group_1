import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  AnalyticsDateRangeService,
  parseRowDate,
} from "./analytics-date-range.service";

describe("AnalyticsDateRangeService", () => {
  let service: AnalyticsDateRangeService;

  beforeEach(() => {
    sessionStorage.clear();
    service = new AnalyticsDateRangeService();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("should expose the built-in default range on first load", () => {
    // Built-in default is the live trailing "Last 12 Months" window ending
    // today (see defaultSelection), not a fixed historical span.
    const today = new Date();
    const pad = (n: number): string => String(n).padStart(2, "0");
    const todayISO = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    expect(service.label()).toBe("Last 12 Months");
    expect(service.endISO()).toBe(todayISO);
    expect(service.monthsSpan()).toBe(12);
    expect(service.touched()).toBe(false);
  });

  it("should apply a preset label and derive its window", () => {
    service.applyLabel("Last 7 Days");
    expect(service.touched()).toBe(true);
    expect(service.daysSpan()).toBe(7);
    expect(service.windowMs()).not.toBeNull();
  });

  it("should apply an explicit display range", () => {
    service.applyLabel("Jan 1, 2024 - Mar 31, 2024");
    expect(service.label()).toBe("Jan 1, 2024 - Mar 31, 2024");
    expect(service.monthsSpan()).toBe(3);
  });

  it("should apply a custom calendar selection", () => {
    service.applySelection({
      label: "Custom",
      startISO: "2024-02-01",
      endISO: "2024-02-29",
    });
    expect(service.startISO()).toBe("2024-02-01");
    expect(service.endISO()).toBe("2024-02-29");
    expect(service.touched()).toBe(true);
  });

  it("should persist the selection across service instances (refresh)", () => {
    service.applyLabel("Jan 1, 2024 - Mar 31, 2024");
    const restored = new AnalyticsDateRangeService();
    expect(restored.label()).toBe("Jan 1, 2024 - Mar 31, 2024");
    expect(restored.touched()).toBe(true);
  });

  it("should snap the span to supported preset lengths", () => {
    service.applyLabel("Jan 1, 2024 - Sep 30, 2024");
    expect(service.snapMonths([3, 6, 9, 12])).toBe(9);
    service.applyLabel("Jan 1, 2024 - Mar 31, 2024");
    expect(service.snapMonths([3, 6, 12])).toBe(3);
  });

  it("should expose report params for the current range", () => {
    service.applyLabel("Jan 1, 2024 - Mar 31, 2024");
    expect(service.toReportParams()).toEqual({
      start_date: "2024-01-01",
      end_date: "2024-03-31",
      date_range: "Jan 1, 2024 - Mar 31, 2024",
    });
  });

  it("should keep rows without a parseable date when filtering", () => {
    service.applyLabel("Jan 1, 2024 - Mar 31, 2024");
    const rows = [
      { date: "Feb 10, 2024" },
      { date: "Dec 25, 2024" },
      { date: "Recently" },
    ];
    expect(service.filterByDate(rows, (r) => r.date)).toEqual([
      { date: "Feb 10, 2024" },
      { date: "Recently" },
    ]);
  });
});

describe("parseRowDate", () => {
  it("should parse display and ISO dates", () => {
    expect(parseRowDate("Sep 30, 2024")).toBe(new Date(2024, 8, 30).getTime());
    expect(parseRowDate("2024-03-31")).not.toBeNull();
  });

  it("should return null for non-dates", () => {
    expect(parseRowDate("Recently")).toBeNull();
    expect(parseRowDate("—")).toBeNull();
    expect(parseRowDate("")).toBeNull();
    expect(parseRowDate(null)).toBeNull();
  });
});
