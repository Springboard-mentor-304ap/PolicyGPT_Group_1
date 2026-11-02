/**
 * Centralized category → icon mapping for policies and schemes.
 *
 * Single source of truth for every policy/scheme icon displayed anywhere
 * on the website (dashboards, search results, detail pages, manage tables,
 * saved items, compare views and analytics lists).
 *
 * - Category strings are normalized before matching (trimmed, lowercased,
 *   common synonyms supported).
 * - Accepts categories as plain strings OR objects carrying a category
 *   field (e.g. `{ category: "Health" }`, `{ name: "Health" }`), matching
 *   the various API response shapes.
 * - Missing / unrecognized categories fall back to a consistent default
 *   document icon (`description`).
 * - Never infers a category from titles or descriptions: only the actual
 *   category field is used. No status, approval or saved/bookmark state
 *   influences the result.
 *
 * Icons are Material Icons ligature names (the project's icon font, loaded
 * globally via index.html). Colors are paired soft background + foreground
 * values so icons stay accessible on a rounded container.
 */

export type CategoryIconTone =
  | "health"
  | "education"
  | "agriculture"
  | "water"
  | "women"
  | "employment"
  | "housing"
  | "finance"
  | "social"
  | "environment"
  | "energy"
  | "infrastructure"
  | "digital"
  | "food"
  | "default";

/** Category value accepted from API models, filters or analytics payloads. */
export type CategoryInput =
  | string
  | { category?: unknown; name?: unknown; category_name?: unknown; title?: unknown }
  | null
  | undefined;

export interface CategoryIcon {
  /** Material Icons ligature name, e.g. "school". */
  icon: string;
  /** Stable tone key used for CSS hooks (`category-icon--health`, …). */
  tone: CategoryIconTone;
  /** Soft container background color. */
  background: string;
  /** Glyph color (meets contrast on `background`). */
  color: string;
  /** Soft container border color. */
  border: string;
}

interface CategoryRule {
  tone: CategoryIconTone;
  icon: string;
  background: string;
  color: string;
  border: string;
  /** Lowercase substring keywords matched against the normalized category. */
  keywords: string[];
}

/**
 * Ordered mapping table: first rule with a matching keyword wins.
 * Order matters for overlapping terms (e.g. "Women & Child Welfare"
 * must match `women` before the generic `welfare` → `social` rule).
 */
const CATEGORY_RULES: CategoryRule[] = [
  {
    tone: "health",
    icon: "monitor_heart",
    background: "#ccfbf1",
    color: "#0f766e",
    border: "#99f6e4",
    keywords: [
      "health",
      "medical",
      "hospital",
      "clinic",
      "doctor",
      "pharma",
      "ayush",
      "disease",
      "wellness",
      "immun",
      "vaccin",
      "nrhm",
      "healthcare",
    ],
  },
  {
    tone: "education",
    icon: "school",
    background: "#dbeafe",
    color: "#1d4ed8",
    border: "#bfdbfe",
    keywords: [
      "educat",
      "school",
      "scholar",
      "literacy",
      "student",
      "universit",
      "college",
      "teacher",
      "padhai",
      "shiksha",
    ],
  },
  {
    tone: "agriculture",
    icon: "agriculture",
    background: "#dcfce7",
    color: "#15803d",
    border: "#bbf7d0",
    keywords: [
      "agricultur",
      "farm",
      "crop",
      "kisan",
      "harvest",
      "soil",
      "fertil",
      "fisher",
      "dairy",
      "pashu",
      "fasal",
    ],
  },
  {
    tone: "water",
    icon: "water_drop",
    background: "#cffafe",
    color: "#0e7490",
    border: "#a5f3fc",
    keywords: [
      "water",
      "jal",
      "drink",
      "river",
      "irrigat",
      "dam",
      "groundwater",
      "swachh",
      "sanita",
      "swajal",
      "nal se",
    ],
  },
  {
    tone: "women",
    icon: "family_restroom",
    background: "#fce7f3",
    color: "#be185d",
    border: "#fbcfe8",
    keywords: [
      "women",
      "woman",
      "child",
      "girl",
      "mother",
      "maternal",
      "anganwadi",
      "beti",
      "ladli",
      "mission shakti",
      "mahila",
    ],
  },
  {
    tone: "employment",
    icon: "work",
    background: "#ffedd5",
    color: "#c2410c",
    border: "#fed7aa",
    keywords: [
      "employ",
      "job",
      "skill",
      "labour",
      "labor",
      "livelihood",
      "msme",
      "enterprise",
      "startup",
      "career",
      "training",
      "apprentice",
      "mgnrega",
      "nrega",
      "rozgar",
      "rojgar",
      "kaushal",
      "business",
    ],
  },
  {
    tone: "housing",
    icon: "home",
    background: "#fef3c7",
    color: "#92400e",
    border: "#fde68a",
    keywords: [
      "hous",
      "shelter",
      "awas",
      "rural",
      "village",
      "gramin",
      "gram panchayat",
      "urban",
      "habitat",
      "slum",
      "pmay",
    ],
  },
  {
    tone: "finance",
    icon: "account_balance_wallet",
    background: "#ede9fe",
    color: "#6d28d9",
    border: "#ddd6fe",
    keywords: [
      "financ",
      "bank",
      "insurance",
      "loan",
      "credit",
      "jan dhan",
      "subsidy",
      "income",
      "tax",
      "economic",
      "money",
    ],
  },
  {
    tone: "social",
    icon: "volunteer_activism",
    background: "#ffe4e6",
    color: "#be123c",
    border: "#fecdd3",
    keywords: [
      "social",
      "welfare",
      "pension",
      "senior",
      "old age",
      "disab",
      "divyang",
      "backward",
      "minorit",
      "tribal",
      "vulnerable",
      "weaker",
      "samaj",
      "widow",
      "destitute",
      "security",
      "sahay",
      "viklang",
    ],
  },
  {
    tone: "environment",
    icon: "eco",
    background: "#d1fae5",
    color: "#047857",
    border: "#a7f3d0",
    keywords: [
      "environ",
      "climate",
      "forest",
      "pollution",
      "wildlife",
      "nature",
      "eco",
      "tree",
      "green",
      "tiger",
      "air quality",
      "van ",
      "paryavaran",
    ],
  },
  {
    tone: "energy",
    icon: "bolt",
    background: "#fef9c3",
    color: "#a16207",
    border: "#fde047",
    keywords: [
      "energy",
      "electri",
      "power",
      "solar",
      "renew",
      "fuel",
      "lpg",
      "ujjwala",
      "bijli",
      "saur",
      "wind",
      "coal",
      "nuclear",
      "urja",
    ],
  },
  {
    tone: "infrastructure",
    icon: "apartment",
    background: "#e2e8f0",
    color: "#475569",
    border: "#cbd5e1",
    keywords: [
      "infra",
      "transport",
      "road",
      "highway",
      "railway",
      "metro",
      "bridge",
      "construct",
      "bharatmala",
      "sagarmala",
      "smart city",
      "airport",
      "seaport",
      "logistic",
      "sadak",
    ],
  },
  {
    tone: "digital",
    icon: "computer",
    background: "#e0e7ff",
    color: "#4f46e5",
    border: "#c7d2fe",
    keywords: [
      "digital",
      "technolog",
      "e-govern",
      "cyber",
      "broadband",
      "internet",
      "aadhaar",
      "aadhar",
      "upi",
      "digit",
      "software",
      "computer",
      "innovat",
      "science",
      "governance",
    ],
  },
  {
    tone: "food",
    icon: "restaurant",
    background: "#ecfccb",
    color: "#4d7c0f",
    border: "#d9f99d",
    keywords: [
      "food",
      "nutrition",
      "ration",
      "meal",
      "hunger",
      "pds",
      "poshan",
      "anna",
      "annapurna",
      "grain",
      "cereal",
      "mid-day",
      "midday",
      "kitchen",
      "ahar",
    ],
  },
];

export const CATEGORY_ICON_DEFAULT: CategoryIcon = {
  icon: "description",
  tone: "default",
  background: "#f1f5f9",
  color: "#475569",
  border: "#e2e8f0",
};

/**
 * Normalize a category value to a lowercase match string.
 * Handles plain strings as well as objects carrying a category field.
 */
export function normalizeCategory(category: CategoryInput): string {
  if (category === null || category === undefined) return "";
  if (typeof category === "object") {
    const record = category as Record<string, unknown>;
    const candidate =
      record["category"] ?? record["name"] ?? record["category_name"] ?? record["title"] ?? "";
    return normalizeCategory(candidate as CategoryInput);
  }
  return String(category).trim().toLowerCase();
}

/**
 * Resolve the icon + colors for a policy/scheme category.
 * Unknown or missing categories return the default document icon.
 */
export function getCategoryIcon(category: CategoryInput): CategoryIcon {
  const normalized = normalizeCategory(category);
  if (!normalized) return { ...CATEGORY_ICON_DEFAULT };
  for (const rule of CATEGORY_RULES) {
    for (const keyword of rule.keywords) {
      if (normalized.includes(keyword)) {
        return {
          icon: rule.icon,
          tone: rule.tone,
          background: rule.background,
          color: rule.color,
          border: rule.border,
        };
      }
    }
  }
  return { ...CATEGORY_ICON_DEFAULT };
}

/** Material Icons ligature name for a category (e.g. "school"). */
export function getCategoryIconName(category: CategoryInput): string {
  return getCategoryIcon(category).icon;
}

/** Stable tone key for a category (e.g. "education"). */
export function getCategoryIconTone(category: CategoryInput): CategoryIconTone {
  return getCategoryIcon(category).tone;
}

/** CSS modifier class for a category (e.g. "category-icon--education"). */
export function getCategoryIconClass(category: CategoryInput): string {
  return `category-icon--${getCategoryIcon(category).tone}`;
}

/**
 * Inline-style bindings for existing icon containers, e.g.
 * `[ngStyle]="getCategoryIconStyle(policy.category)"`.
 */
export function getCategoryIconStyle(category: CategoryInput): {
  "background-color": string;
  color: string;
  "border-color": string;
} {
  const resolved = getCategoryIcon(category);
  return {
    "background-color": resolved.background,
    color: resolved.color,
    "border-color": resolved.border,
  };
}

/** Precomputed template fields for list items carrying a category. */
export interface CategoryIconFields {
  /** Material Icons ligature derived from the item category. */
  catIcon: string;
  /** `[ngStyle]`-ready container colors derived from the category. */
  catStyle: {
    "background-color": string;
    color: string;
    "border-color": string;
  };
}

/** Build the `catIcon`/`catStyle` fields for an item from its category. */
export function categoryIconFields(
  category: CategoryInput,
): CategoryIconFields {
  return {
    catIcon: getCategoryIconName(category),
    catStyle: getCategoryIconStyle(category),
  };
}
