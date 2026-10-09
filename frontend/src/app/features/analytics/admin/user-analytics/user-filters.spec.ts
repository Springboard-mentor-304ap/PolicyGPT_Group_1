import { describe, it, expect } from "vitest";

import {
  canonicalUserRole,
  fmtCount,
} from "./user-analytics.component";

/**
 * Filter-mapping unit tests (pure functions only — no TestBed, so they
 * run independently of the pre-existing admin-spec DI issue).
 *
 * Locks the task-required filter vocabulary to the real backend label
 * variants: growth-series names, donut slices and user-table roles.
 */
describe("user analytics filter mapping", () => {
  it("maps every required role option to its canonical key", () => {
    expect(canonicalUserRole("Citizen")).toBe("CITIZEN");
    expect(canonicalUserRole("Government Official")).toBe("GOVERNMENT_OFFICIAL");
    expect(canonicalUserRole("Administrator")).toBe("ADMINISTRATOR");
    expect(canonicalUserRole("Researcher")).toBe("RESEARCHER");
    expect(canonicalUserRole("Organization")).toBe("ORGANIZATION");
    expect(canonicalUserRole("Guest")).toBe("GUEST");
  });

  it("maps growth-series labels to the same role keys", () => {
    expect(canonicalUserRole("Citizens")).toBe("CITIZEN");
    expect(canonicalUserRole("Govt. Officials")).toBe("GOVERNMENT_OFFICIAL");
    expect(canonicalUserRole("Researchers")).toBe("RESEARCHER");
    expect(canonicalUserRole("Admins")).toBe("ADMINISTRATOR");
    expect(canonicalUserRole("Guests")).toBe("GUEST");
    expect(canonicalUserRole("Organizations")).toBe("ORGANIZATION");
  });

  it("maps table/modal role variants (incl. legacy spellings)", () => {
    expect(canonicalUserRole("Govt. Official")).toBe("GOVERNMENT_OFFICIAL");
    expect(canonicalUserRole("Admin")).toBe("ADMINISTRATOR");
    expect(canonicalUserRole("Organisation")).toBe("ORGANIZATION");
    expect(canonicalUserRole("Official")).toBe("GOVERNMENT_OFFICIAL");
    expect(canonicalUserRole("Org")).toBe("ORGANIZATION");
  });

  it("rejects unknown labels instead of matching a real filter", () => {
    expect(canonicalUserRole("")).toBe("");
    expect(canonicalUserRole("Superuser")).toBe("");
  });

  it("formats counts with locale grouping", () => {
    expect(fmtCount(5820)).toBe("5,820");
    expect(fmtCount(0)).toBe("0");
    expect(fmtCount(Number.NaN)).toBe("0");
  });
});
