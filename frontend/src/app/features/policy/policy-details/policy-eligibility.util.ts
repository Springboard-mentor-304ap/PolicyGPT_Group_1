/**
 * Mapping helpers for the Policy Details page.
 *
 * The Add Policy form persists structured eligibility rules on the
 * policy record itself (`policy.eligibility_rules`, JSONB rows shaped
 * `{ rule_type, value?, min_age?, max_age?, description? }`, plus
 * free-form proposal objects). These pure helpers convert the saved
 * shapes into readable display content:
 *
 * - Target-beneficiary strings are split into individual points.
 * - Serialized JSON conditions are parsed and rendered with
 *   human-readable labels, bullet lists, and Yes/No booleans.
 * - Internal workflow fields (proposal flags, internal status codes)
 *   are filtered out of the citizen-facing view.
 *
 * No values are invented: absent fields yield no content, invalid
 * JSON falls back to safe plain text, and callers render their own
 * "Not specified" fallbacks.
 */

export interface EligibilityDetail {
  /** Human-readable label; empty when unwrapped (e.g. additionalPropN). */
  label: string;
  /** Scalar display text (booleans become Yes/No). */
  value?: string;
  /** Bullet-list items. */
  items?: string[];
  /** Nested object entries. */
  children?: EligibilityDetail[];
}

export interface SavedEligibilityGroup {
  /** Readable section heading, e.g. "Target Beneficiaries". */
  title: string;
  /** One readable line per stored value. */
  lines: string[];
  /** True when lines read best as bullet points. */
  bulleted: boolean;
  /** Structured (parsed-JSON) sub-content. */
  details: EligibilityDetail[];
}

/** Keys that are internal workflow metadata, never citizen-facing. */
const INTERNAL_KEYS = new Set(["proposal", "status"]);

function isInternalKey(key: string): boolean {
  const k = (key || "").trim().toLowerCase();
  if (!k) return true;
  if (INTERNAL_KEYS.has(k)) return true;
  return k.startsWith("internal_") || k.startsWith("_");
}

/** Placeholder wrapper keys (schema artifacts) whose object value inlines. */
function isWrapperKey(key: string): boolean {
  return /^additionalprop\d*$/i.test((key || "").trim());
}

const NO_RESTRICTION_VALUES = new Set([
  "any",
  "all",
  "all india",
  "not applicable",
  "n/a",
]);

function isNoRestriction(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  const text = String(value).trim();
  if (!text) return true;
  return NO_RESTRICTION_VALUES.has(text.toLowerCase());
}

/** snake_case / camelCase key into a Title Case label. */
export function humanizeKey(key: string): string {
  const words = String(key ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return words.join(" ") || "Detail";
}

function formatINR(value: unknown): string | null {
  const num =
    typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(num)) return null;
  return `\u20B9${num.toLocaleString("en-IN")}`;
}

function formatDateValue(text: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}([T ].*)?$/.test(text.trim())) return null;
  const d = new Date(text.trim());
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return "Not specified";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  const text = String(value).trim();
  if (!text) return "Not specified";
  // Numeric strings stay as-is; ISO dates read better formatted.
  if (/^-?\d+(\.\d+)?$/.test(text)) return text;
  return formatDateValue(text) ?? text;
}

/**
 * Split a beneficiary-style string ("A, B, and C.") into individual
 * points. Strings without commas are a single point; fragments are
 * trimmed, leading "and " is dropped, and trailing periods removed.
 * Nothing is reworded or capitalized.
 */
export function splitListText(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  // Arrays (the chip editor's saved shape) stay item-wise so entries
  // containing commas are never torn apart.
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v ?? "").trim())
      .filter((v) => v.length > 0);
  }
  const text = String(value).trim();
  if (!text) return [];
  if (!text.includes(",")) return [text];
  return text
    .split(",")
    .map((part) =>
      part
        .trim()
        .replace(/^and\s+/i, "")
        .replace(/[.]+$/, "")
        .trim(),
    )
    .filter((part) => part.length > 0);
}

/**
 * Normalize a string-list field that may arrive as an array, a
 * serialized JSON array string, a single plain string, or nullish.
 * Never invents items: unparseable input yields [] (callers show the
 * empty state) except a non-empty plain string, which is one item.
 */
export function normalizeStringList(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v ?? "").trim())
      .filter((v) => v.length > 0);
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return [];
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) return normalizeStringList(parsed);
    } catch {
      // Not JSON: treat as a single item below.
    }
    return [text];
  }
  const text = String(value).trim();
  return text ? [text] : [];
}

function renderScalarItems(items: unknown[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (item === null || item === undefined) continue;
    if (typeof item === "object") continue;
    const text =
      typeof item === "boolean"
        ? item
          ? "Yes"
          : "No"
        : String(item).trim();
    if (text) out.push(text);
  }
  return out;
}

/** Render one parsed-JSON entry into display detail(s), or null to skip. */
function renderJsonEntry(key: string, value: unknown): EligibilityDetail | null {
  if (isInternalKey(key)) return null;
  if (value === null || value === undefined) {
    return isWrapperKey(key) ? null : { label: humanizeKey(key), value: "Not specified" };
  }
  if (Array.isArray(value)) {
    const scalars = renderScalarItems(value);
    const objects = value.filter(
      (v): v is Record<string, unknown> =>
        !!v && typeof v === "object",
    );
    const detail: EligibilityDetail = {
      label: isWrapperKey(key) ? "" : humanizeKey(key),
    };
    if (scalars.length > 0) detail.items = scalars;
    const childDetails: EligibilityDetail[] = [];
    for (const obj of objects) {
      for (const child of renderJsonObject(obj)) childDetails.push(child);
    }
    if (childDetails.length > 0) detail.children = childDetails;
    if (!detail.items && !detail.children) return null;
    return detail;
  }
  if (typeof value === "object") {
    const children = renderJsonObject(value as Record<string, unknown>);
    if (children.length === 0) return null;
    return { label: isWrapperKey(key) ? "" : humanizeKey(key), children };
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return isWrapperKey(key) ? null : { label: humanizeKey(key), value: "Not specified" };
    // A string that itself holds JSON (nested serialization) is parsed.
    if (/^[{[]/.test(text)) {
      try {
        const parsed: unknown = JSON.parse(text);
        if (parsed && typeof parsed === "object") {
          const nested = renderJsonEntry(key, parsed);
          return nested;
        }
      } catch {
        // Fall through to plain text.
      }
    }
    if (typeof value === "boolean") return { label: humanizeKey(key), value: value ? "Yes" : "No" };
    return { label: humanizeKey(key), value: formatScalar(text) };
  }
  // boolean | number
  return { label: humanizeKey(key), value: formatScalar(value) };
}

/** Render a parsed JSON object into display details (internal keys skipped). */
function renderJsonObject(obj: Record<string, unknown>): EligibilityDetail[] {
  const details: EligibilityDetail[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const rendered = renderJsonEntry(key, value);
    if (rendered) details.push(rendered);
  }
  return details;
}

/**
 * Promote children of label-less wrapper details (e.g. unwrapped
 * additionalPropN objects) to the top level so they render without
 * an empty indent step. Nested wrappers keep their structure.
 */
function flattenDetails(details: EligibilityDetail[]): EligibilityDetail[] {
  const out: EligibilityDetail[] = [];
  for (const d of details) {
    if (
      !d.label &&
      d.value === undefined &&
      !d.items &&
      d.children &&
      d.children.length > 0
    ) {
      out.push(...d.children);
    } else {
      out.push(d);
    }
  }
  return out;
}

/**
 * Parse a free-form condition description. Valid JSON objects/arrays
 * become structured details; anything else stays safe plain text.
 */
export function parseConditionDescription(
  description: unknown,
): { text?: string; details?: EligibilityDetail[] } {
  if (description === null || description === undefined) return {};
  if (typeof description !== "string") {
    const text = String(description).trim();
    return text ? { text } : {};
  }
  const text = description.trim();
  if (!text) return {};
  if (/^[{[]/.test(text)) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) {
        const scalars = renderScalarItems(parsed);
        const details: EligibilityDetail[] = [];
        if (scalars.length > 0) details.push({ label: "", items: scalars });
        for (const item of parsed) {
          if (item && typeof item === "object") {
            for (const child of renderJsonObject(
              item as Record<string, unknown>,
            )) {
              details.push(child);
            }
          }
        }
        if (details.length > 0) return { details };
        return {};
      }
      if (parsed && typeof parsed === "object") {
        const details = renderJsonObject(parsed as Record<string, unknown>);
        if (details.length > 0) return { details };
        return {};
      }
    } catch {
      // Invalid JSON: safe plain text below.
    }
  }
  return { text };
}

function ruleTitle(ruleType: string): string {
  switch ((ruleType || "").trim().toUpperCase()) {
    case "TARGET_BENEFICIARIES":
      return "Target Beneficiaries";
    case "AGE_CRITERIA":
      return "Age Criteria";
    case "GENDER":
      return "Gender";
    case "ANNUAL_INCOME_LIMIT":
      return "Income Ceiling";
    case "EDUCATION":
      return "Qualification";
    case "OCCUPATION":
      return "Occupation";
    case "SOCIAL_CATEGORY":
      return "Social Category";
    case "DISABILITY_STATUS":
      return "Disability Status";
    case "CUSTOM_CONDITION":
      return "Additional Condition";
    default:
      return ruleType ? String(ruleType).replace(/_/g, " ") : "Condition";
  }
}

function emptyGroup(title: string): SavedEligibilityGroup {
  return { title, lines: [], bulleted: false, details: [] };
}

/**
 * Normalize a list value for duplicate comparison: case-insensitive,
 * collapsed whitespace, trimmed.
 */
function normalizeListValue(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Collect the dedicated Target Beneficiaries points across all groups.
 * Both array items and comma-separated strings are normalized first so
 * differently formatted duplicates still match.
 */
function collectBeneficiaryValues(
  groups: SavedEligibilityGroup[],
): Set<string> {
  const known = new Set<string>();
  for (const group of groups) {
    if (group.title !== "Target Beneficiaries") continue;
    for (const line of group.lines) {
      for (const point of splitListText(line)) {
        const normalized = normalizeListValue(point);
        if (normalized) known.add(normalized);
      }
    }
  }
  return known;
}

/**
 * Remove beneficiary-list entries that duplicate the dedicated
 * beneficiaries list. Applies to "Target Groups" details and to
 * custom "Target Beneficiaries" keyword blocks alike: unique values
 * are kept under the same label; a fully duplicated list drops the
 * detail. Only these beneficiary labels are ever deduplicated —
 * unrelated fields are untouched even when their text matches.
 * Applies recursively to nested children.
 */
function isBeneficiaryLabel(label: string): boolean {
  const normalized = label.toLowerCase().replace(/\s+/g, " ").trim();
  return (
    normalized === "target groups" || normalized === "target beneficiaries"
  );
}

function dedupeTargetGroups(
  details: EligibilityDetail[],
  known: Set<string>,
): EligibilityDetail[] {
  const out: EligibilityDetail[] = [];
  for (const detail of details) {
    if (isBeneficiaryLabel(detail.label) && detail.items) {
      const fresh = detail.items.filter(
        (item) => !known.has(normalizeListValue(item)),
      );
      if (fresh.length > 0) out.push({ ...detail, items: fresh });
      continue;
    }
    if (detail.children && detail.children.length > 0) {
      out.push({
        ...detail,
        children: dedupeTargetGroups(detail.children, known),
      });
      continue;
    }
    out.push(detail);
  }
  return out;
}

/**
 * Final pass: beneficiaries appear only once (dedicated section).
 * Target Groups details lose entries duplicating the dedicated list
 * (unique values stay); Additional Condition plain lines matching a
 * beneficiary point are dropped as well. Groups left completely
 * empty by deduplication are removed; every other unique condition
 * is preserved untouched.
 */
function dedupeBeneficiaries(
  groups: SavedEligibilityGroup[],
): SavedEligibilityGroup[] {
  const known = collectBeneficiaryValues(groups);
  if (known.size === 0) return groups;
  const pruned = groups.map((group) => {
    if (group.title === "Target Beneficiaries") return group;
    let lines = group.lines;
    if (group.title === "Additional Condition" && lines.length > 0) {
      lines = lines.filter(
        (line) => !known.has(normalizeListValue(line)),
      );
    }
    if (group.details.length === 0) {
      return lines.length === group.lines.length
        ? group
        : { ...group, lines };
    }
    return {
      ...group,
      lines,
      details: dedupeTargetGroups(group.details, known),
    };
  });
  return pruned.filter(
    (group) => group.lines.length > 0 || group.details.length > 0,
  );
}

/**
 * Convert saved `policy.eligibility_rules` rows into readable groups.
 * Target beneficiaries become individual bullet points; serialized
 * JSON conditions become structured details with internal workflow
 * fields filtered out. Non-object rows and rows without usable values
 * are skipped (never rendered as raw JSON).
 */
export function mapSavedEligibilityRules(
  rules: unknown,
): SavedEligibilityGroup[] {
  if (!Array.isArray(rules)) return [];
  const groups: SavedEligibilityGroup[] = [];
  for (const raw of rules) {
    if (!raw || typeof raw !== "object") continue;
    const rule = raw as Record<string, unknown>;
    const type = String(rule["rule_type"] ?? "").trim().toUpperCase();

    // Typed rules with known shapes.
    if (type && type !== "CUSTOM_CONDITION") {
      const group = emptyGroup(ruleTitle(type));
      if (type === "TARGET_BENEFICIARIES") {
        const points = splitListText(rule["value"]);
        if (points.length > 0) {
          group.lines = points;
          group.bulleted = true;
        }
      } else if (type === "AGE_CRITERIA") {
        const min = rule["min_age"];
        const max = rule["max_age"];
        const hasMin =
          min !== null && min !== undefined && String(min).trim() !== "";
        const hasMax =
          max !== null && max !== undefined && String(max).trim() !== "";
        if (hasMin && hasMax) group.lines.push(`Age ${min} - ${max} years`);
        else if (hasMin) group.lines.push(`Minimum age: ${min} years`);
        else if (hasMax) group.lines.push(`Maximum age: ${max} years`);
      } else if (type === "ANNUAL_INCOME_LIMIT") {
        const formatted = formatINR(rule["value"]);
        if (formatted) group.lines.push(`Annual income up to ${formatted}`);
      } else if (type === "DISABILITY_STATUS") {
        const v = rule["value"];
        if (v === true || String(v ?? "").trim().toLowerCase() === "true") {
          group.lines.push("Applicable to persons with disabilities");
        } else if (
          v === false ||
          String(v ?? "").trim().toLowerCase() === "false"
        ) {
          group.lines.push("Applicable to non-disabled applicants");
        } else if (!isNoRestriction(v)) {
          group.lines.push(String(v).trim());
        }
      } else {
        const v = rule["value"];
        if (!isNoRestriction(v)) group.lines.push(String(v).trim());
      }
      if (group.lines.length > 0) groups.push(group);
      continue;
    }

    // Custom conditions and untyped proposal objects.
    if (type === "CUSTOM_CONDITION") {
      // New editor shape: keyword + values[] renders as a labeled
      // bullet list; interim scalar key/value renders as a labeled
      // value; otherwise fall through to description parsing below.
      const rawKeyword: unknown = rule["key"];
      const rawValues: unknown = rule["values"];
      const keyword =
        typeof rawKeyword === "string" ? rawKeyword.trim() : "";
      const values = Array.isArray(rawValues)
        ? rawValues
            .map((v) => String(v ?? "").trim())
            .filter((v) => v.length > 0)
        : [];
      const rawScalar: unknown = rule["value"];
      const scalarValue =
        typeof rawScalar === "string" || typeof rawScalar === "number"
          ? String(rawScalar).trim()
          : "";
      if (values.length > 0) {
        groups.push({
          title: ruleTitle(type),
          lines: [],
          bulleted: false,
          details: [{ label: keyword, items: values }],
        });
        continue;
      }
      if (keyword && scalarValue) {
        groups.push({
          title: ruleTitle(type),
          lines: [],
          bulleted: false,
          details: [{ label: keyword, value: scalarValue }],
        });
        continue;
      }
      if (keyword || scalarValue) {
        groups.push({
          title: ruleTitle(type),
          lines: [keyword || scalarValue],
          bulleted: false,
          details: [],
        });
        continue;
      }
      const parsed = parseConditionDescription(rule["description"]);
      const details = parsed.details ? flattenDetails(parsed.details) : [];
      if (details.length > 0) {
        groups.push({
          title: ruleTitle(type),
          lines: [],
          bulleted: false,
          details,
        });
      } else if (parsed.text) {
        groups.push({
          title: ruleTitle(type),
          lines: [parsed.text],
          bulleted: false,
          details: [],
        });
      }
      continue;
    }

    // No rule_type: render remaining meaningful keys (e.g. proposal
    // payloads), skipping internal workflow fields. Bare scalar
    // value/description entries become plain lines.
    const rest: Record<string, unknown> = {};
    const textLines: string[] = [];
    for (const [k, v] of Object.entries(rule)) {
      if (k === "rule_type") continue;
      if (
        (k === "value" || k === "description") &&
        (typeof v === "string" ||
          typeof v === "number" ||
          typeof v === "boolean")
      ) {
        const t =
          typeof v === "boolean" ? (v ? "Yes" : "No") : String(v).trim();
        if (t) textLines.push(t);
        continue;
      }
      rest[k] = v;
    }
    const details = flattenDetails(renderJsonObject(rest));
    if (textLines.length > 0 || details.length > 0) {
      groups.push({
        title: "Additional Condition",
        lines: textLines,
        bulleted: false,
        details,
      });
    }
  }
  return dedupeBeneficiaries(groups);
}
