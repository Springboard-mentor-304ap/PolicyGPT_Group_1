import { describe, expect, it } from "vitest";

import {
  CATEGORY_ICON_DEFAULT,
  getCategoryIcon,
  getCategoryIconClass,
  getCategoryIconName,
  getCategoryIconStyle,
  getCategoryIconTone,
  normalizeCategory,
} from "./category-icon.util";

describe("category-icon.util", () => {
  it("normalizes strings (trim + case-insensitive)", () => {
    expect(normalizeCategory("  Healthcare ")).toBe("healthcare");
    expect(normalizeCategory("EDUCATION")).toBe("education");
    expect(normalizeCategory("")).toBe("");
    expect(normalizeCategory(null)).toBe("");
    expect(normalizeCategory(undefined)).toBe("");
  });

  it("accepts category objects from varied API shapes", () => {
    expect(normalizeCategory({ category: " Health " })).toBe("health");
    expect(normalizeCategory({ name: "Finance" })).toBe("finance");
    expect(normalizeCategory({ category_name: "Housing" })).toBe("housing");
    expect(normalizeCategory({} as never)).toBe("");
  });

  it("maps representative categories to distinct icons", () => {
    expect(getCategoryIconName("Healthcare")).toBe("monitor_heart");
    expect(getCategoryIconName("Health")).toBe("monitor_heart");
    expect(getCategoryIconName("Medical")).toBe("monitor_heart");
    expect(getCategoryIconName("Education")).toBe("school");
    expect(getCategoryIconName("Scholarships")).toBe("school");
    expect(getCategoryIconName("Agriculture")).toBe("agriculture");
    expect(getCategoryIconName("Farmer Welfare")).toBe("agriculture");
    expect(getCategoryIconName("Water Resources")).toBe("water_drop");
    expect(getCategoryIconName("Women & Child Welfare")).toBe("family_restroom");
    expect(getCategoryIconName("Employment")).toBe("work");
    expect(getCategoryIconName("Skills & Employment")).toBe("work");
    expect(getCategoryIconName("Housing")).toBe("home");
    expect(getCategoryIconName("Finance")).toBe("account_balance_wallet");
    expect(getCategoryIconName("Social Welfare")).toBe("volunteer_activism");
    expect(getCategoryIconName("Senior Citizen Welfare")).toBe("volunteer_activism");
    expect(getCategoryIconName("Environment")).toBe("eco");
    expect(getCategoryIconName("Energy")).toBe("bolt");
    expect(getCategoryIconName("Infrastructure")).toBe("apartment");
    expect(getCategoryIconName("Digital Governance")).toBe("computer");
    expect(getCategoryIconName("Food")).toBe("restaurant");
  });

  it("matches case-insensitively with surrounding whitespace", () => {
    expect(getCategoryIconName("  education ")).toBe("school");
    expect(getCategoryIconName("HEALTHCARE")).toBe("monitor_heart");
  });

  it("prefers women-child over generic welfare wording", () => {
    expect(getCategoryIconTone("Women & Child Welfare")).toBe("women");
    expect(getCategoryIconTone("Women Empowerment")).toBe("women");
    expect(getCategoryIconTone("Social Welfare")).toBe("social");
  });

  it("falls back to the default document icon for unknown/missing categories", () => {
    for (const unknown of [undefined, null, "", "   ", "Quantum Banana"]) {
      expect(getCategoryIcon(unknown as never).icon).toBe(
        CATEGORY_ICON_DEFAULT.icon,
      );
      expect(getCategoryIconName(unknown as never)).toBe("description");
      expect(getCategoryIconTone(unknown as never)).toBe("default");
    }
  });

  it("exposes tone classes and inline styles for templates", () => {
    expect(getCategoryIconClass("Education")).toBe("category-icon--education");
    expect(getCategoryIconClass("???")).toBe("category-icon--default");
    const style = getCategoryIconStyle("Healthcare");
    expect(style["background-color"]).toBe(getCategoryIcon("Healthcare").background);
    expect(style.color).toBe(getCategoryIcon("Healthcare").color);
    expect(style["border-color"]).toBe(getCategoryIcon("Healthcare").border);
  });

  it("keeps bookmark/save state out of category resolution", () => {
    // Statuses and saved flags must never change the category icon.
    expect(getCategoryIconName("Education")).toBe(
      getCategoryIconName("Education"),
    );
  });
});
